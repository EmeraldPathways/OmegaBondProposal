# PDF viewer and export — Omega Bond Proposal Generator

## Visual reference

Reference supplied by Omega: **Omega Savings Projection Calculator2.pdf**, 19 November 2026.

The report generator uses the reference's A4 dimensions, burgundy header with a full-white Omega logo, gold letterspaced section captions, serif headings, warm off-white financial cards, thin borders, low-density charts and clean tables.

## Export behaviour

1. The client form and the selected fund portfolios are sent in a POST request to the authenticated \`/api/proposal/pdf\` route.
2. The Node.js server recomputes metrics from aligned observation dates and constructs an A4 PDF via \`@react-pdf/renderer\`.
3. The browser displays that exact PDF as a read-only Blob iframe in the proposal viewer.
4. Clicking **Download PDF** downloads the **same Blob**, not a new HTML print or a screenshot.

**The application does not call \`window.print()\` or use browser printing for exports.** The generated PDF has no browser-generated datetime/title/URL, no printed page numbers and no browser header/footer areas. Document-authored "Prepared [date]" and mandatory investment disclosures remain part of the styled content.

The PDF is not stored in the database in this phase. It is generated on demand for the signed-in user and the Blob URL is revoked when changed/unmounted.

## Security and data integrity

- Protected by the same single-user sign-in (\`info@omegafinancial.ie\`).
- POST-only endpoint; validates values, lengths, fund identifiers, allocations, currency, file size; rejects oversized inputs.
- Server output is \`application/pdf\` with \`Cache-Control: private, no-store\` and \`X-Content-Type-Options: nosniff\`.
- No external fonts or images are fetched when rendering.
- All presently available fund inputs are synthetic or browser-session imports. PDFs prominently state that data is **unverified demonstration data and not suitable for a client recommendation**.
- Returns, dates and volatility use a common set of dates across every selected portfolio. The report displays "Not available" for intervals lacking sufficient history instead of inventing results.
- Charges are displayed separately and not deducted a second time from unit-price-derived values.
- Fund data will be upgraded to verified, archived provider records as a separate workflow.

## Test plan

1. Log in to the deployed app.
2. Navigate to **Client proposal**.
3. Confirm a visible two-page A4 PDF preview is generated.
4. Change a portfolio allocation or analysis period. The PDF should update and the old Blob URL should be discarded.
5. Select **Download PDF**. Open the file separately and compare its pixels/content with the viewer's version.
6. Confirm neither page contains browser-added date/time, the web-app title, URL, printer header/footer or page number.
7. Verify page 2's regulatory content and portfolio numbers.
8. Without a valid authenticated session, POST \`/api/proposal/pdf\` must return HTTP 401.
9. Verify PDF export with 3-, 5-, 10-year periods and with insufficient price history.

No printing is necessary.
