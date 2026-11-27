# Omega Funds Generator — V2 development

**Branch:** `v2-development`  
**Status:** isolated Git/Vercel Preview, not production

## Source baseline

Created from production commit `dda7bd9d43462e7a388d917ff9ce3905881e06eb` on 27 November 2026.

- `main` + `https://omega-bond-proposal.vercel.app`: live V1. Do not modify during V2 development.
- `v2-development`: V2 development commits and preview deployments only.
- Visual identity, source funds and PDF styling remain the baseline for V2.

## Data isolation and safety

Vercel Preview environment variables could inherit production database connections; their targets could not be inspected with the current Vercel permissions. **Do not assume the preview has its own database.**

Until an independent V2 database and blob storage are provisioned:
- Branch-only middleware rejects all data-changing API requests on Vercel Preview.
- Authentication and read-only PDF export remain available.
- Read-only queries may use the existing configured provider data; never enter genuine client information for testing.
- Do not enable importing, deleting, approving, enriching or writing financial records on Preview.
- The V2 preview banner visually distinguishes test from live.
- Before enabling data changes, configure and verify a dedicated, sandboxed V2 datastore and storage, then migrate the middleware policy with tests.

## Planned V2 sections

1. **Proposal:** Existing live functionality retained.
2. **Performance:** Original contributions, additional dated contributions, dated withdrawals, start/end values, fund-level and combined cumulative cash-flow-aware returns, selectable reporting period and Omega-styled PDF.
3. **Withdrawals:** Empty placeholder until the agreed methodology is supplied.

No V2 performance calculations are implemented by this branch-only initialization.

## Release policy

V2 changes stay on `v2-development`. Do not merge to `main`, change Vercel's production branch or promote a Preview deployment until the user expressly approves a tested release.
