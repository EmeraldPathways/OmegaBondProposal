# Fund performance data contract — November 2026

**Primary performance source: each provider's original PDF factsheet.**

A workbook may still be stored and reviewed as an **optional comparison reference**. No workbook upload or matching step is required to extract, stage, or display official PDF performance figures. Neither workbook values nor synthetic monthly prices may override or backfill the PDF table.

## Parsing and identity

1. The provider-specific factsheet title parser identifies the fund by its **name printed inside the PDF**, not the upload filename.
2. Provider-specific return-table parsers handle Aviva, Zurich, New Ireland and Standard Life layouts. Preserve the published as-of date, its precision (day or month), the return convention and AMC/TER disclosure.
3. Extract periods as available: YTD, 1 month, 3 months, 6 months, 1 year, 3 years, 5 years, 10 years and since launch. The original document may publish fewer periods. Missing values display **N/A**, never zero.
4. Distinguish annualised multi-year returns from cumulative returns; do not substitute one for the other. Calendar-year returns, when clearly published, are stored separately.
5. Match the PDF's internal title to the approved Omega shortlist. Unique and share-class-consistent identities can be auto-approved; competing titles, omitted series/pension designations and duplicates require adviser review.
6. Manual decisions can confirm, reject, or reset an identity. Preserve the source PDF and its provenance.
7. Even when PDF values are displayed, comparison, annualisation across mixed conventions, and client-specific fee calculations require separate validation of reporting dates and return bases.

## No invented observations

**Omega will not import or manufacture monthly/daily historical unit-price series** for this PDF-driven workflow. A factsheet growth chart is retained as part of the original document, not reconstructed as numerical data. Never infer annual performance or risk statistics from missing periods.

## Optional Excel

The existing Excel workbook and workbook-review endpoints remain accessible for optional cross-checking. They are not part of the core PDF ingest or reconciliation path and must not become a fallback return source.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
