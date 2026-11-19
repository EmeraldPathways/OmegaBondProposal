# Fund performance data contract — November 2026

**Authoritative Omega source:** `Omega Fund FactSheets & Performance - Nov 2026 -.xlsx`.

The workbook contains five worksheets: `FUNDS` (fund shortlists), `STANDARD` (Standard Life), `ZURICH`, `New Ireland` and `AVIVA`.

The four performance worksheets have exactly the same column headings:

| Fund identifier | Historical reporting fields |
| --- | --- |
| Name | YTD, 1m, 3m, 6m, 1yr, 3yrs, 5yrs, 10yrs, Since launch |

**Permanent requirement: Omega will NOT import daily/monthly/dated unit-price time series.** Do not request 10 years of monthly prices, infer them from the workbook, or manufacture a historical path.

## Ingest rules

1. Retain original workbook (private Vercel Blob) and its SHA-256 hash (Neon `imports`).
2. Record each exact sheet name, complete fund name/share-class designation and each reported return percentage. Values are already in percentage points, e.g. `249.4` means 249.4%, not 2.494%.
3. Preserve all empty/"-" cells as missing, never 0%.
4. Retain source workbook name and upload timestamp. **The exact performance as-of date and whether each horizon is cumulative or annualised require verification**; a November file name by itself does not prove a valuation date.
5. Match each fund to official factsheets using the provider plus precise series/share-class identifiers. Never merge identically named but different series.
6. Store every imported performance value with a review/approval state before it is used in portfolio comparisons.
7. Fund charges, risk ratings and asset allocation come from source factsheets, with their own published/as-of dates and original PDFs attached.

## Analytics / display

- Fund Library: sortable published return table (YTD, 1m, 3m, 6m, 1yr, 3yrs, 5yrs, 10yrs, since launch).
- Portfolio Builder: select approved funds and set allocations adding to 100%.
- Comparison: show period-by-period calculations **only when all selected fund records share a comparable reporting date and return basis**.
- Do not treat a weighted mean of annualised returns as an actual historical portfolio CAGR.
- Do not calculate monthly annualised volatility, drawdown, or year-by-year performance from this workbook; the workbook does not contain the necessary time series.
- Do not draw any historical growth line using invented observations or extrapolated values.
- Report missing histories as "Not available", and explain why if a portfolio includes a recently launched fund.
- Continue to mark existing synthetic demo charts and figures as demonstration-only until the new report engine is implemented.

## Import workflow

The secured `Fund uploads` section accepts factsheets (PDF) and performance workbooks (XLSX/CSV), records the original source privately and flags documents as pending review. Merely storing a document does not yet make its figures approved or available for client proposals.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
