# FieldRep OS database migrations

FieldRep OS intentionally separates its data into two logical planes.

## Directories

- `control/` — global identity/authentication, companies, workspaces, memberships, roles, scopes, entitlements, routing and privileged audit.
- `workspace/` — operational foundation for one isolated workspace database.

The first workspace migration does **not** hard-code a workspace ID. Provisioning must create the physical database, apply workspace migrations, then insert exactly one `workspace_identity` row for the intended workspace before any operational data is written.

`workspace_data_routes.store_identifier` is a logical routing key. In P1 it maps to a D1 binding supplied to the Worker by deployment configuration; Cloudflare database IDs, API tokens and credentials are not stored in application rows.

## Safety invariants

1. A workspace data store must identify itself as the requested workspace before the router returns it.
2. A route whose schema version is newer than the physical workspace database is rejected.
3. Membership/company and entitlement/company relationships are guarded in SQL as well as application authorization.
4. Better Auth core tables stay in the control plane; workspace databases never contain password/session authority.
5. No remote migration is applied automatically by CI.

## Validation

Run from the repository root:

```bash
pnpm validate:migrations
```

The validator applies every migration to a fresh in-memory SQLite database, checks foreign keys/integrity, verifies required baseline tables, and exercises key isolation constraints.

Remote Cloudflare D1 provisioning and binding configuration are intentionally deferred until the deployment environment is available.
