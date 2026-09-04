# ADR-0004 — Authentication and Session Model

**Status:** Accepted for P1 implementation  
**Date:** 2026-09-05

## Context

FieldRep OS needs browser/PWA authentication that supports:

- Server-side session revocation
- Multi-workspace membership resolution after login
- Secure browser cookies
- Cloudflare Workers runtime
- D1-backed control-plane identity/session storage
- Future password reset, email verification, MFA, SSO, and enterprise identity features
- Strong separation between authentication and FieldRep OS authorization

A custom authentication implementation would create unnecessary security and maintenance risk.

Cloudflare Workers supports modern `node:crypto` APIs, but Argon2 is not currently supported by the native Workers Node crypto surface. Better Auth uses `scrypt` by default for email/password credentials, supports Cloudflare D1 directly, traditional database-backed cookie sessions, rate limiting, trusted-origin checks, secret rotation, password reset/session revocation, and future plugins such as two-factor authentication.

## Decision

Use **Better Auth 1.7.x** as the authentication/session framework for the initial FieldRep OS implementation, backed by the **CONTROL_DB** D1 database.

Authentication and authorization remain separate:

```text
Better Auth
  └── authenticates global user + validates session

FieldRep OS control plane
  └── resolves company/workspace memberships, roles, permissions, scopes, entitlements
```

A valid Better Auth session alone grants no workspace access.

## Initial Authentication Mode

P1 starts with email/password authentication.

Public self-sign-up is disabled for production product flows. User provisioning/invitation will be platform/company-admin controlled in later phases.

Development/test fixtures may create users through controlled seed/test utilities.

## Password Hashing

Use Better Auth's default `scrypt` password hashing for P1.

Reasoning:

- `scrypt` is memory-hard and is Better Auth's supported default.
- Cloudflare Workers' current Node crypto compatibility supports scrypt, while native `argon2`/`argon2Sync` are not supported.
- Avoid introducing a custom WASM Argon2 implementation before there is a demonstrated need.

If runtime/provider support changes, password hashing can be upgraded later through an explicit migration ADR.

## Session Storage

Use database-backed sessions in CONTROL_DB.

Initial policy:

```text
session lifetime: 7 days
rolling refresh/update age: 1 day
cookie cache: disabled initially
```

Cookie cache is intentionally disabled at first so session revocation/disable semantics remain straightforward. Authorization memberships/permissions are resolved by FieldRep OS separately and must never be trusted from a long-lived client cache.

## Browser Cookie Policy

Production/staging browser sessions use:

```text
HttpOnly
Secure
SameSite=Lax unless a reviewed cross-site flow requires otherwise
Path=/
```

Prefer serving SPA and API from the same site/origin to reduce cookie/CSRF complexity.

Do not place long-lived authentication tokens in `localStorage` or IndexedDB.

## CSRF / Origin Policy

Do not disable Better Auth origin protections.

Use:

- Explicit `trustedOrigins` allowlist per environment
- SameSite cookie protections
- Better Auth's origin/fetch-metadata protections
- No state-changing operations through GET

Wildcard trusted origins are not permitted in production unless an explicit architecture review documents the need.

## Rate Limiting

Better Auth rate limiting is enabled in production/staging.

Use a serverless-safe persistent backend (CONTROL_DB or approved secondary storage) rather than in-memory-only rate limiting.

Cloudflare deployment should use the trusted `cf-connecting-ip` header for client-IP rate-limit context.

Sensitive auth endpoints receive stricter limits than normal API traffic.

Application/API abuse limits outside Better Auth remain a separate platform concern.

## Secret Management and Rotation

Authentication secrets are never committed to Git.

Use Cloudflare secrets/environment bindings and Better Auth versioned-secret rotation capability.

Requirements:

- High-entropy secret, at least Better Auth's required minimum length
- Separate local/staging/production secrets
- Documented non-destructive rotation procedure before production launch

## Password Reset

Password reset flow is added when transactional email is wired.

Required policy:

```text
revokeSessionsOnPasswordReset = true
```

Changing a password from an authenticated session should offer/perform revocation of other sessions according to product policy.

## Email Verification

The architecture supports verified-email invitations/onboarding, but email verification does not block P1 shell development.

Before broad company onboarding, invitation and verification semantics must be defined together with the company-admin user lifecycle.

## Privileged Roles / MFA

Platform Admin, Company Admin, and Workspace Admin must have an MFA extension path.

MFA is not required to render the first P1 Field User shell, but production privileged-role rollout is gated on a follow-up security decision/implementation.

## Offline PWA Boundary

Offline cached data is **not** authentication material.

A previously authenticated PWA may retain authorized offline business state for a defined offline window, but on reconnect every server request/sync operation is re-authorized using the current server session and current memberships/permissions.

Offline authorization duration/cache-lock policy is handled by the P4 offline-session ADR.

## Integration Boundary

Application code should not spread Better Auth-specific user/session types through the domain.

Better Auth adapter resolves its session to a small FieldRep OS session identity:

```ts
interface SessionIdentity {
  sessionId: string
  userId: string
  expiresAt: string
  freshUntil?: string
}
```

Then FieldRep OS resolves an active workspace membership and builds `AuthContext`.

## Consequences

Positive:

- Avoids custom password/session cryptography.
- First-class Cloudflare D1 compatibility.
- Database-backed revocable browser sessions.
- Clear path to reset, MFA, OAuth/SSO later.
- Authentication remains replaceable behind a small application interface.

Tradeoffs:

- Better Auth becomes a security-sensitive dependency requiring disciplined upgrades.
- Auth schema/migrations must be coordinated with control-plane migrations.
- D1 limitations must be considered before enabling plugins that require interactive transactions.
- Enterprise SSO/SCIM plugins may need different storage capabilities later.

## Upgrade Policy

Pin Better Auth to an explicit compatible version in production and review security/changelog releases before upgrades.

Keep Better Auth and any `@better-auth/*` packages on compatible release lines.

## References Reviewed

- Better Auth 1.5+ first-class Cloudflare D1 support
- Better Auth 1.7 current session/cookie/security documentation
- Cloudflare Workers Node crypto compatibility: native Argon2 unavailable; other Node crypto APIs substantially supported

These references informed the decision; implementation tests remain authoritative for FieldRep OS.
