# FieldRep OS — Security & Threat Model Baseline

**Phase:** P0-A6  
**Status:** Initial threat model

---

## 1. Security Objectives

FieldRep OS must protect:

- Authentication/session integrity
- Company/workspace isolation
- Field-user operational data
- Imported datasets
- Customer/practitioner information
- Location data and visit-location evidence
- Offline cached business data
- Administrative permissions and audit trails
- External API credentials

Security design follows deny-by-default and least-privilege principles.

---

# 2. Primary Trust Boundaries

```text
Browser/PWA
↕
Cloudflare Worker/API
↕
Control Plane
↕
Workspace Data Plane(s)

External Providers:
Maps / optional AI / email etc.
```

Additional boundaries:

```text
Workspace A ↔ Workspace B
Platform Admin ↔ Tenant Operational Data
Offline User A ↔ Next User on Same Device
Imported Files ↔ Production Data
```

---

# 3. Key Assets

### Critical

```text
session credentials
password credentials/hashes
platform admin access
workspace database routing
role/scope assignments
```

### High value

```text
customer/practitioner datasets
visit reports
plans
team/company performance data
location evidence
company imports
```

### Operational

```text
routes
products
calendar events
recommendation data
sync queues
```

---

# 4. Threat Actors

Potential threat actors include:

- Unauthenticated internet attacker
- Compromised normal user account
- Curious/malicious user attempting cross-team access
- Compromised supervisor/admin account
- Privileged platform operator misuse
- Malicious/compromised browser extension or device
- Malformed/malicious uploaded dataset
- External provider/API compromise
- Automated credential stuffing / abuse

---

# 5. Cross-Tenant / IDOR Risk

## Threat

A user changes URL/body identifiers to access another workspace/company/user resource.

Example:

```text
/workspaces/W1/reports/R1
→ change W1/R1 to another tenant
```

## Required mitigations

- Resolve current membership server-side.
- Verify resource ownership and scope for every request.
- Require workspace-aware repository access.
- Never rely on hidden UI controls.
- Add explicit cross-workspace denial tests.

---

# 6. Membership / Scope Spoofing

## Threat

Client submits arbitrary `companyId`, `workspaceId`, `role`, or `scope`.

## Mitigations

- Server derives effective context from session/control-plane data.
- Client-supplied workspace ID is only a requested context and must be validated.
- Permission/scope data is never trusted from browser state.

---

# 7. Privilege Escalation

## Threat

User gains admin/supervisor capabilities through role assignment bugs or permissive defaults.

## Mitigations

- Permission-based checks.
- Deny-by-default.
- Privileged role/scope changes audited.
- Admin APIs separately permissioned.
- Role bundles do not imply unrestricted scope.

---

# 8. Platform Admin Misuse

## Threat

Privileged platform operator accesses or exports tenant operational data without a legitimate governed path.

## Mitigations

- Platform admin role alone does not imply tenant operational access.
- Explicit permissions for workspace-data access/export.
- Target workspace/context required.
- Audit privileged access/export actions.
- Governing contractual/privacy terms must cover intended platform data access.

---

# 9. Authentication / Session Theft

## Threats

```text
credential stuffing
session token theft
XSS stealing browser-accessible tokens
stale sessions after account disable
```

## Mitigations

- Secure HttpOnly cookie session strategy.
- Secure/SameSite policy appropriate to deployment.
- Session rotation/revocation support.
- Rate limiting and abuse controls.
- Strong password hashing implementation chosen in security ADR.
- MFA capability for privileged roles later.
- Avoid long-lived bearer tokens in localStorage.

---

# 10. CSRF

Cookie-based sessions require CSRF-aware design.

Mitigations may include:

- SameSite policy
- origin/referer checks for state-changing browser requests where appropriate
- CSRF token strategy if needed by deployment/cross-site requirements
- no sensitive state changes through GET

Exact mechanism is finalized with P1 auth design.

---

# 11. XSS

## Threat

Visit report text, imported names/addresses, admin data, or external provider content causes script execution.

## Mitigations

- React escaping by default.
- Avoid unsafe raw HTML rendering.
- Sanitize any future rich text.
- Strong Content Security Policy target.
- Treat imported strings as untrusted.
- Avoid storing executable markup in generic metadata fields.

---

# 12. SQL Injection

## Threat

Search/import filters or API fields reach SQL unsafely.

## Mitigations

- Parameterized queries/ORM bindings.
- Zod request validation.
- No string-concatenated SQL from user input.
- Strict allow-lists for dynamic sort/column names.

---

# 13. Bulk Import Threats

Potential risks:

```text
malformed XLSX/CSV
huge file/resource exhaustion
formula injection in exported CSV/XLSX
unexpected columns/types
embedded malicious content
duplicate poisoning
```

Mitigations:

- File size/type limits.
- Parse in controlled/staged flow.
- Schema validation.
- Preview before apply.
- Normalize data.
- Store original separately from production tables.
- Sanitize spreadsheet exports against formula injection where relevant.
- Record import manifest/audit.

---

# 14. Dataset Cross-Leakage

## Threat

Shared practitioner/dataset architecture accidentally exposes another workspace's classification, visits, notes, or targets.

## Mitigations

- Canonical identity stores only master identity data.
- Workspace-specific relationship owns classification/frequency.
- Operational queries never join unrestricted workspace data by canonical practitioner alone.
- Dataset assignment is explicit.

---

# 15. Offline Cache Leakage

## Threat

User A logs out and User B on same device sees cached doctors/reports.

## Mitigations

- Local storage namespaced by user/workspace.
- Logout clears/locks sensitive cached business data according to policy.
- No shared unscoped IndexedDB queries.
- E2E test user-switch scenario.

---

# 16. Stale Offline Authorization

## Threat

User's permission is revoked while device remains offline, then client attempts to sync unauthorized work.

## Mitigation

- Server re-authorizes every sync operation using current permissions.
- Stale local entitlement cannot force server acceptance.
- Client handles rejected operations visibly.

---

# 17. Sync Replay / Duplicate Writes

## Threat

Network retry creates multiple visits or duplicated operations.

## Mitigation

- Stable operation IDs.
- Idempotent mutation processing.
- Server records applied operations/results as required.
- Derived metrics rebuild from authoritative unique records.

---

# 18. Conflict Data Loss

## Threat

Last-write-wins silently overwrites another device/user's plan/report edit.

## Mitigations

- Version/revision token on mutable shared records.
- Detect stale base versions.
- Domain-specific conflict resolution.
- Never conflict-merge derived totals.

---

# 19. Location Spoofing

## Threat

User/device reports manipulated coordinates.

## Mitigations / product boundary

- Store accuracy and timestamps.
- Evaluate geofence conservatively.
- Preserve capture time vs server receipt time.
- Label feature as location verification/evidence, not guaranteed physical proof.
- Future native/device attestation would be separate enhancement.

PWA/browser geolocation alone is not assumed tamper-proof.

---

# 20. Continuous Tracking Scope Creep

Visit check-in and continuous employee tracking are separate products/security/privacy concerns.

Continuous tracking must not be introduced by reusing one-time visit permissions in the background.

If ever added, require:

- separate feature entitlement
- permissions
- explicit UX/policy
- retention rules
- threat review

---

# 21. Map Provider Credential Leakage

## Threat

Unrestricted provider keys embedded in public client code are copied/abused.

## Mitigations

- Server-side gateway for sensitive APIs where supported.
- Provider-supported origin/domain restrictions for public browser keys.
- Separate client/server credentials.
- Per-environment secrets.
- Usage monitoring/quotas.

---

# 22. External AI Data Leakage

## Threat

LLM/provider receives more company/customer data than necessary or logs sensitive context.

## Mitigations

- Deterministic engine works without LLM.
- LLM receives minimal structured authorized context.
- No unrestricted dataset access by model adapter.
- Provider selection and data-retention review before production use.
- Avoid sensitive raw report text unless required for a defined feature.

---

# 23. Recommendation Hallucination / Unsafe Automation

## Threat

Model invents doctor availability, frequency, history, or silently writes a plan.

## Mitigations

- Structured facts from authoritative services.
- Structured reasons.
- LLM explanation cannot create core facts.
- User acceptance required before plan mutation.
- Engine versioning and test fixtures.

---

# 24. Export Exfiltration

## Threat

Large dataset/report export becomes a high-impact data exfiltration path.

## Mitigations

- Explicit export permissions.
- Scope enforcement.
- Feature/licensing rules if relevant.
- Audit privileged/bulk exports.
- Rate/size limits.
- Export job metadata and expiration policy later.

---

# 25. Audit Tampering / Overlogging

Two opposite risks:

```text
missing privileged audit
logging too much sensitive content
```

Mitigations:

- Append-oriented audit events.
- Store actor/action/resource/context, not unnecessary full payloads.
- Restrict audit access.
- Avoid secrets/report bodies/raw imported datasets in diagnostic logs.

---

# 26. Environment Cross-Contamination

## Threat

Staging accidentally reads/writes production DB/R2/secrets.

## Mitigations

- Separate resource IDs/bindings/secrets.
- Deployment checks.
- Environment-specific configuration.
- Never reuse production operational DB in staging.
- Smoke tests verify bindings/environment identity.

---

# 27. Dependency / Supply Chain

Mitigations:

- Lockfile committed.
- Minimal dependencies.
- Review dependency updates.
- CI typecheck/tests.
- Security scanning later.
- Avoid obscure packages for authentication/cryptography where possible.

---

# 28. Availability / Abuse

Threats:

```text
login brute force
expensive map route spam
AI inference abuse
large search/export requests
D1 query overload
```

Mitigations:

- Rate limiting.
- Quotas/feature entitlement.
- Bounded pagination.
- Query indexing/performance review.
- Async jobs for heavy operations later.
- Provider usage metering.

---

# 29. Data Deletion / Retention

Do not implement casual hard-delete cascades for company/workspace suspension.

Separate concepts:

```text
disable/suspend
archive
retention expiration
legal/account deletion
```

Production deletion/export/retention policy is finalized before broad launch.

---

# 30. Required Security Tests by Phase

### P1

```text
unauthenticated route denial
invalid/inactive membership denial
cross-workspace API denial
session logout
basic CSRF/origin posture tests as implemented
```

### P2

```text
user A cannot read user B private plan/report without permission
workspace A doctor IDs cannot be used in workspace B plan
input validation
```

### P4

```text
offline user-switch isolation
sync replay idempotency
permission revoked before sync
```

### P6

```text
accuracy-aware verification
capture/server timestamp separation
```

### P8-P11

```text
supervisor scope escape attempts
company admin workspace escape
platform dataset export permission/audit
privileged workspace access audit
```

---

# 31. P0 Security Exit Criteria

1. Tenant isolation is a server-side invariant.
2. Platform admin operational-data access is explicit rather than implicit.
3. Offline cache/user-switch risk is addressed in architecture.
4. Location verification is not treated as absolute proof.
5. Map/AI secrets/data boundaries are defined.
6. Import/export are recognized as high-risk surfaces.
7. Privileged actions have audit requirements.
8. P1 authentication decisions still requiring concrete library/crypto choices are explicitly deferred to ADR, not ignored.
