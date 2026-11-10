# Omega Bond Proposal Generator

Adviser-facing investment bond portfolio analysis and proposal application for OFM Financial Ltd T/A Omega Financial Management.

**Status: Single-user login implementation deployed. Fund import remains a demonstration until secure persistent workflows are enabled.**

## Live build
https://omega-bond-proposal.vercel.app

The Vercel deployment currently retains Vercel Authentication protection. The application additionally uses a single email-and-password login for `info@omegafinancial.ie`, which remains locked until the required private production secrets are configured. See [login setup](docs/SINGLE_USER_LOGIN.md). No client records or official fund data should be entered at this stage.

## Current functionality
- Omega-branded Next.js workspace (Overview, Fund Library, Data Imports, Portfolio Builder, Comparison, Client Proposal).
- Six deliberately **synthetic** sample funds and ten years of generated month-end price points.
- Three editable model portfolios, with allocation totals checked.
- Buy-and-hold historical calculations with aligned prices and sample annualised volatility.
- CSV prices: parse/validate dates and unit prices, reject duplicates and bad values, convert to month-end, replace synthetic prices in the **current browser session only**.
- Factsheet file selection UI (file not uploaded or extracted).
- Web proposal with print / Save as PDF layout.
- Preliminary PostgreSQL schema in `src/lib/schema.sql`.

## Not enabled yet
- Neon and Vercel Blob are connected; the initial Postgres schema has been created, but the authenticated data import API is not yet enabled.
- Private Blob upload/download/delete round-trip verification and server-side factsheet extraction.
- A single-user Auth.js login is implemented; its production password and session secret must be configured privately in Vercel before use.
- Persisted fund records, portfolio versions or client proposals.
- Adviser-reviewed data provenance and distribution-corrected historical price series.
- True issuer-backed PDF generation and immutable report archive.

**Do not store real clients, financial information, or private fund factsheets in this prototype or the public repository.**

## Single-user login setup

The only permitted email is **info@omegafinancial.ie**. Add `AUTH_SECRET` (at least 32 random characters) and `OMEGA_LOGIN_PASSWORD` (a unique password of at least 16 characters) as server-only Vercel Sensitive/Secret environment variables for **Production**, then redeploy. Do not share the password or secret in this repository or any chat. Login is intentionally fail-closed until they are set. See [setup instructions](docs/SINGLE_USER_LOGIN.md).

## Local development
```bash
npm install
npm run dev
```
Open http://localhost:3000.

```bash
npm run build
npm run lint
npm test
```

## Data import guide
For the browser demo, CSV needs a header for `date` (or `price_date`) and `price` (or `unit_price`). Dates must be YYYY-MM-DD; unit prices must be positive. The site offers a template download, and imported CSV values exist only until the page is reloaded.

For eventual production files, capture exact provider, fund code/unit class, denomination, price type, distribution treatment, as-of date, charge basis and provider source. These fields are essential for comparable analysis; a price series is not necessarily a total-return series.

## Methodology
- Portfolio construction: one-time initial allocation with no rebalancing.
- Historical return: relative change of aligned portfolio unit-value series.
- Annualised return: compound annual growth rate based on actual start/end dates.
- Volatility: sample standard deviation of monthly portfolio returns multiplied by sqrt(12).
- No fabricated ten-year returns when genuine history is absent.
- Do not equate a weighted average of fund SRI scores with an official regulatory risk rating.
- Sample fees are displayed separately and are not automatically deducted from the sample price series, to avoid double-counting embedded fees.
- Historical backtests are distinct from hypothetical future forecasts.

See [technical build plan](docs/BUILD_PLAN.md) for detailed requirements and production milestones.

## Regulatory attribution
OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
