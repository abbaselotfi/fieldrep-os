#!/usr/bin/env python3
"""CI smoke test for scripts/extract-legacy-workbook.py.

Builds a minimal synthetic XLSM OOXML container, includes a dummy VBA payload,
runs the extractor as a subprocess and validates extracted values/provenance.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACTOR = ROOT / "scripts" / "extract-legacy-workbook.py"

WORKBOOK_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Physision" sheetId="1" r:id="rId1"/></sheets>
</workbook>
"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
</Relationships>
"""

SHARED_STRINGS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Name</t></si>
  <si><t>Frequency</t></si>
  <si><t>دکتر تست</t></si>
</sst>
"""

SHEET_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="7">
      <c r="A7" t="s"><v>2</v></c>
      <c r="B7"><v>6</v></c>
    </row>
  </sheetData>
</worksheet>
"""


def build_fixture(path: Path) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", WORKBOOK_XML)
        archive.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        archive.writestr("xl/sharedStrings.xml", SHARED_STRINGS)
        archive.writestr("xl/worksheets/sheet1.xml", SHEET_XML)
        # Presence of a VBA project is intentional. The extractor never reads or executes it.
        archive.writestr("xl/vbaProject.bin", b"DUMMY-VBA-MUST-NOT-EXECUTE")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="fieldrep-workbook-") as temp_dir:
        workbook = Path(temp_dir) / "fixture.xlsm"
        build_fixture(workbook)

        completed = subprocess.run(
            [sys.executable, str(EXTRACTOR), str(workbook)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        payload = json.loads(completed.stdout)

    assert payload["sourceName"] == "fixture.xlsm"
    assert len(payload["sourceSha256"]) == 64
    assert payload["parserVersion"] == "fieldrep-ooxml-stdlib-v1"
    rows = payload["sheets"]["Physision"]
    assert rows[0] == {"rowNumber": 1, "cells": ["Name", "Frequency"]}
    assert rows[1] == {"rowNumber": 7, "cells": ["دکتر تست", 6]}

    print("Legacy XLSM non-executing extractor validation: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
