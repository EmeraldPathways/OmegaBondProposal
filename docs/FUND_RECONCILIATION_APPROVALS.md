# Omega fund source-identity approval workflow

Official provider PDFs are the **primary** identity and return source for the 115 Omega-approved funds. The exact name printed inside the PDF is authoritative; filenames never determine identity. A performance workbook is optional and is never necessary for PDF reconciliation.

## Source workflow

1. **Parse PDFs:** Existing provider-specific parsers extract the printed title, reporting date, published returns, fee basis and available evidence.
2. **Auto-approve clear identities:** The approved shortlist entry must uniquely and consistently match the internal PDF title, including all explicit share-class, series and pension/growth indicators. Duplicate or ambiguous candidates cannot be approved automatically.
3. **Stage original PDF returns:** A dated, defensibly extracted return table may be displayed for an approved PDF identity. Missing periods remain N/A.
4. **Manually resolve exceptions:** Adviser can choose a PDF, approve, reject, or reset a match and enter an evidence note. Previous manual decisions remain independent of rescans.
5. **Validate before client calculations:** Displaying published figures is distinct from approving portfolio performance for client proposals; mixed dates, annualisation conventions and policy charges are not silently treated as comparable.

Workbook rows can be attached during manual review, but no workbook identity match is needed for the official PDF path. The old workbook series matching engine is retained for historical compatibility and optional reference only.

Scores are heuristic source-name similarity measures, **not** probability of correctness. No invented historical prices, cumulative-to-annualised conversions or missing returns.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
