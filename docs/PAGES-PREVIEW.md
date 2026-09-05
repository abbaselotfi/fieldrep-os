# FieldRep OS — GitHub Pages UI Preview

This preview exists only to review the static React/PWA field-user interface before Cloudflare deployment.

## What the preview includes

- responsive RTL field-user shell
- Home, Calendar, Planner, Customers, Reports, Settings and Visit UI
- List / Calendar / Excel / Map-placeholder planner views
- representative synthetic data
- installable PWA shell where supported

## What the preview does not include

- production authentication
- D1 data
- Cloudflare Worker APIs
- real company/workspace data
- offline business-data synchronization
- map provider APIs

Those capabilities remain on their own roadmap phases.

## One-time repository activation

GitHub Pages must be enabled once by a repository administrator:

```text
Repository
→ Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

After that, run the `GitHub Pages Preview` workflow from the Actions tab.

Expected project-site address after a successful deployment:

```text
https://abbaselotfi.github.io/fieldrep-os/
```

## Deployment design

The web app is intentionally deployment-base aware:

- Vite receives `/fieldrep-os/` as the Pages base
- React Router uses `import.meta.env.BASE_URL`
- the manifest uses base-relative URLs
- the service worker derives its cache and API paths from its active scope
- `404.html` mirrors the SPA entrypoint for GitHub Pages deep-link fallback

The normal production build continues to use `/` as its default base.

## Workflow policy during development

The Pages workflow is manual (`workflow_dispatch`) until the repository Pages source is activated. This avoids a failing Pages check on every feature commit before the one-time repository setting is enabled.
