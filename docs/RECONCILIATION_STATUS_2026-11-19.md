# Omega fund reconciliation — 19 November 2026

## Latest production reconciliation results

- Approved universe: **115 funds** (Aviva 30; Zurich 29; Standard Life 14; New Ireland 42).
- Stored original source PDFs: **105**, all parsed or represented in the source archive.
- Published performance source rows: **406**, across the four provider worksheets.
- **81** uniquely corroborated factsheet identities marked `factsheetIdentityApproved`.
- **28** complete PDF-to-workbook identities have the stronger `auto_approved` status.
- **87** complete identities remain in the manual approval/rejection queue.
- Tentative factsheet candidates for **101** shortlist entries; workbook row candidates for **108**.
- One-time local OCR recovered **16** candidate internal titles from image-only PDFs; confidence and provenance are stored in the respective source records.
- A further **2** printed Aviva titles were repaired by the text-layer parser.
- **0** published returns are yet approved for client reports. Identified and approved fund identity is not the same as verified as-of date, return basis, fees or a client-safe performance calculation.

## Operation

1. Go to `Fund uploads`. The page defaults to `Needs manual review`, ordered by most plausible candidates first.
2. `Review match` opens a per-fund comparison of the internally printed PDF title and original performance workbook series.
3. The reviewer may approve, reject, reset or select alternative provider-specific source records.
4. Duplicate published return rows are blocked. A shared umbrella factsheet requires an explanatory reviewer note.
5. Use `All statuses` to inspect or override an automatically approved identity.
6. The review queue is persistent in Neon. Original source files remain in private Vercel Blob.

Scores are heuristic similarity values, **not** probabilities of correctness. No prices, chart histories or volatility are synthesized.

## Technical notes

- OCR is intentionally limited to pages lacking usable PDF text, not applied indiscriminately.
- OCR-derived figures are **not** accepted for charges, risk or performance; OCR recovers identity candidates only.
- Future deployments use a normal read-only build. The one-time recovery and staging utilities are retained as explicit maintenance scripts.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
