# Omega Bond Proposal Generator — Implementation Plan

**Version:** 1.0  
**Prepared:** 10 November 2026  
**Repository:** https://github.com/EmeraldPathways/OmegaBondProposal  
**Status:** Planning specification; application not yet implemented.

## 1. Product goal and locked scope

Develop a private, adviser-facing web application that converts verified fund factsheets and historical unit-price data into reusable fund records, builds client investment portfolios, compares up to **three** portfolio options side by side, and exports client-ready branded PDF proposals.

V1 **must** include:
- Staff authentication and adviser/admin roles.
- Secure PDF factsheet, CSV and XLSX upload and original-file storage.
- Fund master library, fund/series identification, versioned factsheets, searchable price history and data quality status.
- Structured factsheet extraction with human review; **never silently invent or silently overwrite** facts.
- Portfolio builder supporting allocation by % and € (total exactly 100%, allowing only rounding tolerance).
- A/B/C portfolio comparison with fund allocations, historical total and annualised return, 5-/10-year observation windows when supported, historical annualised volatility and explicitly sourced fees/risks.
- Interactive charts and a client PDF with consistent values and Omega branding.
- Proposal drafts, saved versions, immutable issued snapshots and audit records.
- Exportable data import/error logs and tests.

Not in V1: market-data subscriptions, live trading, client portals, client signature, suitability determination, tax advice, automated recommendations, and forecasts presented as guarantees.

## 2. Technical architecture

| Layer | Choice | Responsibility |
|---|---|---|
| Source control | GitHub | Code and migrations; never client data or credentials |
| Web/UI | Next.js App Router + TypeScript | Responsive adviser portal |
| Design | Tailwind CSS + accessible UI components | Match Omega Savings Projection Calculator |
| Deployment | Vercel | Preview/production builds, server routes |
| Database | Neon PostgreSQL via Vercel | Canonical structured data and audit trails |
| Objects | **Private** Vercel Blob | PDF, source CSV/XLSX, optional issued PDFs |
| Data access | Drizzle ORM or Prisma | Schema migrations and typed queries |
| Import | Server-side parsers + validation | Controlled ingestion into staging and canonical tables |
| Charts | Recharts | Fund, allocation and comparison charts |
| PDFs | Print-safe HTML rendering, server-side PDF export | One branded presentation layer |
| Tests | Vitest, Playwright | Mathematics, security, imports, layout |
| Auth | Invite-only staff accounts, preferably managed SSO + MFA | Roles and access enforcement |

Neon is an external managed Postgres provider provisioned through Vercel; GitHub and Vercel alone are **not** the data store. Private Vercel Blob is needed for controlled access to original documents.

Do not store files in the GitHub repository; its current visibility is public.

### Proposed application routes
- `/login`
- `/dashboard`
- `/funds`
- `/funds/[id]`
- `/imports`
- `/portfolios/new`
- `/portfolios/[id]`
- `/compare/[id]`
- `/clients`
- `/proposals/[id]`
- `/proposals/[id]/print`
- `/admin/users`, `/admin/settings`, `/admin/audit`

## 3. Database design

Core relational entities (all primary keys UUIDs except where explicitly otherwise):

1. **providers** — name, provider reference and website.
2. **funds** — canonical name, provider ID, category, status and description.
3. **fund_series** — fund ID, exact provider fund code/ISIN *where available*, wrapper/product, share/unit class, currency, accumulation/distribution treatment, pricing basis, fee treatment and active status. **One price series cannot be mixed with another fund/unit class.**
4. **factsheet_versions** — series ID, publication/as-of dates, private Blob key, checksum, original filename, extraction status, reviewer, notes, source/licence.
5. **factsheet_metrics** — version ID, metric label, observation period, numeric value, units, basis (gross/net), and source page; include published SRI, performance, volatility, allocations and published charges where present.
6. **price_series** — fund_series ID, source, frequency, currency, price type (bid/offer/mid/NAV), treatment of distributions/adjustments, whether charges are reflected, import source.
7. **price_observations** — series ID, date, full precision unit price, source import batch. Unique(series_id, date). Do not overwrite conflicts without explicit approval/version tracking.
8. **import_batches** and **import_rows** — file, uploader, format, status, validations, errors, counts and checksum.
9. **users** — role (admin, adviser, viewer), identity provider, status.
10. **clients** — name, optional reference, contact fields if required, retention/consent metadata. Minimise personal data.
11. **portfolios** and **portfolio_versions** — client ID, name, initial investment, valuation as-of, time-window/methodology, status, saved version.
12. **portfolio_allocations** — portfolio version ID, series ID, allocation percentage and derived allocated € amount.
13. **comparison_sets** — 2–3 portfolio version IDs, common investment amount/date and scenario parameters.
14. **calculation_runs** — input snapshot hash, pricing cut-off, calculation version, method, charges assumptions, output JSON and warnings.
15. **proposals** and **proposal_versions** — client, adviser, selected portfolios, narrative, disclosures, PDF key, issued timestamp, source document/version references.
16. **audit_events** — actor, entity, action, changed fields, timestamp, request ID.

Mandatory indexes include (series_id, date) unique, fund name/provider search, factsheet publication dates, client, portfolio, proposal and audit timestamps.

## 4. Source import requirements

### PDFs / fund factsheets
- Accept one or multiple PDFs.
- Store original PDF untouched in private Blob with checksum, uploader and upload date.
- Extract text/tables; store candidate values in a staging/review area.
- Display the source page and confidence/validation status for each extracted field.
- Reviewer approves each published fact before it becomes active; missing values remain null with status `not_available`.
- Preserve previous factsheets and historical published figures.
- Distinguish fact sheet's publication date from the date of each performance/risk figure.

### Prices (CSV/XLSX)
Preferred canonical CSV columns:

```csv
provider,fund_name,fund_code,unit_class,series_currency,price_date,unit_price,price_type,distribution_basis,source
Example Provider,Example Fund,EX123,Series A,EUR,2026-10-30,1.234567,NAV,accumulation,Provider price export
```

Import process:
1. Upload original and create import batch.
2. Map incoming columns (support provider-specific template mappings).
3. Match exact fund **and unit class/series**; unmatched items are queued, not guessed.
4. Validate date format, numeric price > 0, currency, duplicate dates, frequency and source.
5. Identify conflicting revisions, unexpected spikes/splits and large gaps.
6. Stage a preview with accepted/rejected/flagged rows.
7. Reviewer confirms; transactionally commit approved observations.
8. Show audit log, import result, latest price and coverage span.

Imports must be idempotent: reuploading an identical file must not duplicate data. Large files should be uploaded directly to private Blob then processed in chunks/as a job, rather than relying on a single oversized HTTP request/function run.

### Data freshness
Display `last factsheet date`, `last price observation`, `last successful import`, and data-quality indicators. No automatic assumption that a fact sheet is current. Advisory staff decide refresh cadence and document usage rights.

## 5. Calculation methodology

All formulas must be implemented as pure, versioned functions with recorded inputs and tests.

**Price-based return:**
- Simple interval return: `P_t / P_(t-1) - 1` for an adjusted total-return series.
- Cumulative return: `P_end / P_start - 1`.
- CAGR: `(P_end / P_start)^(1 / years) - 1` for valid start/end observation dates.
- Portfolio buy-and-hold backtest: purchase notional units for each allocation at the common start date; value their units on each aligned observation date; portfolio return = end value / initial investment - 1.
- Annualised historical volatility: sample standard deviation of aligned periodic portfolio returns x sqrt(periods/year), e.g. monthly x sqrt(12), weekly x sqrt(52), or daily x sqrt(252), after data sufficiency checks.
- Money-weighted returns/IRR only when actual cashflows exist; not interchangeable with CAGR.

**Comparison alignment:**
- All compared portfolios use a **common as-of date, valuation currency, return basis and measurement period**.
- Where a required fund lacks the complete 5-/10-year observation history, display **insufficient data**, not a made-up return.
- Align actual observations according to a documented calendar convention; flag, do not silently interpolate, major gaps.
- If an underlying series is in another currency, require validated FX history before producing a EUR-denominated comparison.
- V1 starts with **buy-and-hold, no rebalancing** as the documented default; future rebalancing methods require explicit user selection and distinct methodology tags.

**Fees:**
- Store fund-price charge basis separately from product-level annual management/advice charges.
- Do not subtract a fee already reflected in the reported unit price.
- Charges not represented in NAV should be applied explicitly, with frequency/date and method captured.
- Mark whether figures are gross or net of charges/taxes; tax assumptions are not implicit.

**Risk indicators:**
- Display PRIIPs KID SRI (1–7) only if supplied for the exact product, with its source/date.
- Display calculated historical volatility as a separate metric.
- A custom decimal score or blended risk band must be identified as **Omega's methodology**, never as an official ESMA or SRI category.

**Forward-looking scenarios:**
- Historical backtests and assumed forward projections must have distinct headings.
- If forward scenarios are included, advisers must enter the assumptions, and the report clearly labels illustrations, fees and uncertainty.
- Do not extrapolate 5-year history into a guaranteed 10-year result.

## 6. Portfolio builder and comparison

### Portfolio editor
- Client, adviser, objective, currency, lump sum, optional start date.
- Fund search across approved, active fund series; factsheet and price coverage visible.
- Add/remove fund; edit % or €; totals recalculate, must sum to 100%.
- Portfolio title/description, draft/approved/issued states.
- Save versions rather than replacing a portfolio used in an issued report.

### Compare (V1 mandatory)
- Select or create **two or three** portfolios, labels A/B/C.
- Common investment amount and comparable date/return basis.
- Side-by-side cards and detailed table for allocations, values, cumulative return, CAGR, historical volatility, sourced SRI, charges and warnings.
- Shared line chart of historical backtested value in €, chart date filter, optional stacked allocation visualisation.
- Display available data windows and methodological limitations directly by each figure.
- Save comparison snapshot and add it to proposal with one action.
- If a metric cannot be calculated, a visible `N/A — insufficient history` is preferable to a fabricated value.

## 7. PDF and visual design

Reference: **Omega Savings Projection Calculator.pdf**, not the older Investment Bond Proposal as the visual design system.

- Burgundy main branding, muted gold section labels, warm off-white cards, airy layout, serif headings and legible sans-serif body.
- Responsive website with a printable A4 layout.
- Same data model and number-formatting functions for web and PDF.
- Include cover/client+adviser details, objectives, portfolio summary, allocation table/chart, comparative table and chart, risk/fee notes, methodology, fund sources, as-of dates and regulatory disclaimer.
- Clear separation of historical data from assumed illustrations.
- Reproduce footer in every client report: `OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.`
- CTA: `Schedule a free consultation at +353 1 293 8554 (Sandyford office).`
- Document version, issue date, proposal reference, and saved immutable copy for reproducibility.
- Test rendered PDFs against the Omega design with screenshot/snapshot comparison; no clipping across multi-page tables.

## 8. Security, governance and compliance

- Invite-only staff login; enforce authorisation on server/API and private file access.
- Roles: admin (import/data approval/users), adviser (clients/portfolios/proposals), viewer (read-only as authorised).
- MFA where supported and preferred SSO; secure sessions, CSRF protection and rate limits.
- Separate development/preview/production databases and object stores.
- Never put production secrets, client data, or private factsheets in GitHub/public URLs or logs.
- Encrypt in transit and use provider-managed at-rest security; back up the database and plan periodic restore tests.
- Capture source/provenance of every published value and calculation assumptions in every issued proposal.
- Implement retention/deletion/export workflows consistent with Omega's documented GDPR policy.
- Ensure staff review and approval before issuance. The tool assists with analysis; it does not independently determine suitability or guarantee future outcomes.
- Review source data distribution rights and any insurer/provider conditions before showing original factsheet content to clients.
- Compliance and risk wording must be adviser-approved before production use.

## 9. Implementation phases and acceptance tests

### Phase 1 — Project foundation
- Create Next.js app, design tokens, layout, navigation, environment validation, preview deployments and CI checks.
- Set up Neon, migration runner, private Blob, auth/RBAC and protected routes.
- **Accept:** staff can securely sign in; non-staff cannot access fund or client data; deployment builds cleanly.

### Phase 2 — Fund database and raw uploads
- Build schema/migrations; admin fund directory and series screens.
- Import PDFs and CSV/XLSX to private Blob, record imports and revisions.
- Add price CSV mapper/validator with staging and commit.
- **Accept:** same price file can be re-imported without duplicates; exact fund class retained; errors flagged; history query works.

### Phase 3 — Factsheet extraction and verification
- Parse candidate fields; show manual review UI and page references.
- Enable publish/replace while retaining every prior factsheet version.
- **Accept:** approved facts become queryable; unapproved guesses are excluded; old version is preserved.

### Phase 4 — Portfolio engine
- Build fund selector, allocation editor, saved portfolio versions.
- Implement testable returns/fees/volatility and data coverage rules.
- **Accept:** total allocations 100%; deterministic examples reproduce independent spreadsheet calculations; incomplete history is labelled.

### Phase 5 — Portfolio comparisons
- Build comparison set A/B/C, metrics table, aligned charts and saved comparison snapshot.
- **Accept:** changing an allocation updates charts/metrics correctly; all portfolios use matched dates; missing fund history is not invented.

### Phase 6 — Client reports
- Build client/adviser forms, proposal editing, Omega printable design, one-click PDF export and immutable issue record.
- **Accept:** PDF and web calculations match to the cent/defined precision; A4 layout and legal footer render throughout; PDFs contain data-as-of and methodology.

### Phase 7 — Quality assurance and controlled release
- Vitest calculation/import tests, Playwright end-to-end flows, role/URL access tests, performance checks, PDF visual regression, backup restore and staff acceptance.
- **Accept:** full documented flow upload → approve → portfolio A/B/C → compare → proposal → PDF succeeds using test data; Omega adviser validates outputs against independent calculations.

## 10. What Omega should gather now

For **every exact fund/unit series** used:
- Official fund name, provider, product/wrapper, share/unit class and identifying code/ISIN if available.
- Most recent official fund factsheet PDF and date; preferably older editions if performance history can change with time.
- **Historical unit prices**, ideally daily; weekly/monthly acceptable for an appropriately-labelled comparison but consistent frequency improves results.
- Source URL or provider, currency, bid/offer/mid/NAV type, distribution/adjustment treatment, whether charges are embedded, price observation dates and export date.
- Published risk indicator and its KID/factsheet source.
- Published fund and product fees with an explanation of which are already reflected in prices.

Request as far back as possible (10+ years if available); do not assume all funds have 10 years of actual history. Request CSV or XLSX rather than screenshots whenever possible.

Suggested input directory layout (local-only, **not** GitHub):
```
Provider Name/
  Fund Name - Exact Unit Class/
    factsheets/
      YYYY-MM-factsheet.pdf
    prices/
      historical-prices-YYYY-MM-DD.csv
    provenance.txt
```

## 11. Risks and open design decisions

1. **Price comparability:** Some providers' prices are gross/net, contain varying fees, use different dates or include distributions differently.
2. **Missing history:** New funds cannot be presented as having a full historical 10-year return.
3. **Provider licensing:** Internal advisory use and copying/extracting price data may have terms.
4. **PDF rendering:** Use the shared print route and verified server rendering, test in Vercel rather than relying on browser screenshots alone.
5. **Data security:** Treat all client records as sensitive; keep repository code-only.
6. **Initial calculations:** Agree whether any non-price-based forward projections belong in V1; historical analysis remains clearly separated.
7. **Formal advice:** Suitability, scope of advice and final risk/charge phrasing must be signed off by Omega.

**Recommended starting method:** Build and test the importer with a small synthetic dataset, then validate with 3–5 actual provider fact sheets/price series when supplied. Complete the architecture and UI independently of the arrival of full fund data.

---

**Required footer for client-facing artefacts:**

Schedule a free consultation at +353 1 293 8554 (Sandyford office).

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
