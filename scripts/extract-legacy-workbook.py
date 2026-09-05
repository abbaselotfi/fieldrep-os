#!/usr/bin/env python3
"""Extract worksheet cell values from .xlsx/.xlsm without executing VBA.

Uses only the Python standard library. The OOXML ZIP container is read directly;
VBA projects, external links and formulas are never executed. Formula cells expose
only the cached value stored in the workbook. Output is JSON consumed by the
FieldRep OS legacy-workbook adapter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_REF = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")


def q(ns: str, name: str) -> str:
    return f"{{{ns}}}{name}"


def column_index(ref: str) -> int:
    match = CELL_REF.match(ref)
    if not match:
        raise ValueError(f"invalid cell reference: {ref}")
    value = 0
    for char in match.group(1):
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        data = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    values: list[str] = []
    for item in root.findall(q(NS_MAIN, "si")):
        values.append("".join(node.text or "" for node in item.iter(q(NS_MAIN, "t"))))
    return values


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in relationships.findall(q(NS_REL_PKG, "Relationship"))
    }
    sheets = workbook.find(q(NS_MAIN, "sheets"))
    if sheets is None:
        return []

    result: list[tuple[str, str]] = []
    for sheet in sheets.findall(q(NS_MAIN, "sheet")):
        name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get(q(NS_REL_DOC, "id"))
        if not name or not rel_id or rel_id not in rel_targets:
            continue
        target = rel_targets[rel_id].replace("\\", "/")
        path = target.lstrip("/") if target.startswith("/") else str(PurePosixPath("xl") / target)
        parts: list[str] = []
        for part in PurePosixPath(path).parts:
            if part == "..":
                if parts:
                    parts.pop()
            elif part != ".":
                parts.append(part)
        result.append((name, "/".join(parts)))
    return result


def cell_value(cell: ET.Element, shared: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(q(NS_MAIN, "is"))
        return "" if inline is None else "".join(node.text or "" for node in inline.iter(q(NS_MAIN, "t")))

    value_node = cell.find(q(NS_MAIN, "v"))
    if value_node is None or value_node.text is None:
        return None
    raw = value_node.text

    if cell_type == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return raw
    if cell_type == "b":
        return raw == "1"
    if cell_type in {"str", "e"}:
        return raw

    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_sheet(archive: zipfile.ZipFile, path: str, shared: list[str]) -> list[dict]:
    root = ET.fromstring(archive.read(path))
    sheet_data = root.find(q(NS_MAIN, "sheetData"))
    if sheet_data is None:
        return []

    result: list[dict] = []
    for ordinal, row in enumerate(sheet_data.findall(q(NS_MAIN, "row")), start=1):
        try:
            row_number = int(row.attrib.get("r", ordinal))
        except ValueError:
            row_number = ordinal
        values: list[object] = []
        for cell in row.findall(q(NS_MAIN, "c")):
            ref = cell.attrib.get("r")
            if not ref:
                continue
            index = column_index(ref)
            while len(values) <= index:
                values.append(None)
            values[index] = cell_value(cell, shared)
        while values and values[-1] is None:
            values.pop()
        result.append({"rowNumber": row_number, "cells": values})
    return result


def extract(path: Path) -> dict:
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    with zipfile.ZipFile(path, "r") as archive:
        shared = read_shared_strings(archive)
        sheets = {
            name: read_sheet(archive, sheet_path, shared)
            for name, sheet_path in workbook_sheets(archive)
        }
    return {
        "sourceName": path.name,
        "sourceSha256": digest,
        "parserVersion": "fieldrep-ooxml-stdlib-v1",
        "sheets": sheets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract XLSX/XLSM cells to JSON without running macros.")
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", "-o", type=Path)
    args = parser.parse_args()

    if args.workbook.suffix.lower() not in {".xlsx", ".xlsm"}:
        parser.error("workbook must be .xlsx or .xlsm")
    if not args.workbook.is_file():
        parser.error("workbook file does not exist")

    try:
        payload = extract(args.workbook)
    except (zipfile.BadZipFile, KeyError, ET.ParseError, ValueError) as exc:
        print(f"extract failed: {exc}", file=sys.stderr)
        return 2

    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(encoded + "\n", encoding="utf-8")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
