# Omega Approved Fund Universe

The only funds available for selection are the **115 rows of the `FUNDS` tab** from the user-provided `Omega Fund FactSheets & Performance - Nov 2026 -.xlsx`.

| Provider | Fund count |
| --- | ---: |
| Aviva | 30 |
| Zurich | 29 |
| Standard Life | 14 |
| New Ireland | 42 |
| **Total** | **115** |

Exact display names are stored in `src/lib/approved-funds.ts`.

**Important distinction:** the workbook's remaining four worksheets contain **406 performance-series rows**, including additional funds and share classes. Those are potential data sources for the approved 115 funds, but are **not a broader fund library**.

Several display names are abbreviated. A name match does not prove the share class, pension/investment basis, fee basis or reporting date. Fund performance will not become approved until a reviewer confirms its exact source series and returns convention.

No monthly/daily prices are requested, stored or modelled for this application. The primary data source is the fund's published YTD, 1m, 3m, 6m, 1-year, 3-year, 5-year, 10-year and since-launch figures, with missing values preserved.

## Current functionality
- The Fund Library shows only the 115 selected funds.
- The Portfolio Builder allows allocations to only those funds.
- The Portfolio Comparison shows allocation structures, but withholds performance figures pending source verification.
- The Client Proposal PDF layout is retained in the codebase, but actual exports are not enabled from the current fund-selection interface until the verified-return workflow is complete.
- Fund uploads remain available and persist original documents in private Vercel Blob with an audit record in Neon.

## Remaining work
1. Provider-specific factsheet extraction and matching to approved names.
2. Compare workbook return rows against the correct official factsheet share class.
3. Establish common as-of dates and cumulative/annualised return semantics.
4. Obtain review and approval for each matched fund, keeping missing years as null.
5. Enable published-period performance comparisons and re-enable client proposal PDFs without any fictional historical price curves.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
