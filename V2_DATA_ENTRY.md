# Omega Funds Generator V2 — Actual investment data entry and reporting

**Scope:** V2 only. The original Proposal and V1 production app are not modified by this batch.

## The source valuation workbook

The client-provided reference workbook contains three worksheet formats:
- **Pension:** provider, policy number, start date, contributions, allocated funds, dated values, current total, source-reported performance.
- **Post-Retirement:** the above plus withdrawals and contributions less withdrawals. The sheet can hold several policies.
- **Investment:** provider/policy, start date, contributions, holdings, dated values and current total.

The sample workbook provides **summary contributions/withdrawal totals but not the complete dates of every payment**. Its existing reported percentage should not be reused as a cash-flow-adjusted investment return. An accurate Modified Dietz return requires dated cash flows and opening/closing valuations at the selected reporting dates.

**Privacy:** No client details from the reference workbook are seeded into source code, tests or a production database. Use fictional examples when testing.

## Proposal, Performance and Withdrawals

- **Proposal:** Existing fund-selection and workbook-backed proposal tools remain in place.
- **Performance:** Enter each actual client policy, fund holdings, original investment, dated fund/policy values and actual cash flows. Choose report start and end dates; calculate individual fund, policy and combined client-portfolio cumulative performance. No annualisation.
- **Withdrawals:** Record and review dated pension drawdowns and further contributions. Regular premiums can be generated as individually dated actual payments, then checked against statements. Future scheduled payments are not treated as paid.

All three PDFs use Omega's logo, burgundy/gold colours, font hierarchy, regulatory footer and A4 format. Proposal forecasts/illustrations and actual investment performance are kept methodologically separate.

## Manual copy/paste formats

Enter the policy's **Fund Holdings** before importing named fund valuations.

### Dated policy/fund valuations

Copy tab-separated rows (including optional header) from Excel:

| Date | Holding | Market value |
|---|---|---:|
| 01/01/2022 | Policy | 100,000.00 |
| 26/11/2026 | Policy | 126,000.00 |

### Fund-by-date matrix, matching valuation workbook

| Fund Invested | Value @ 29/03/2022 | Value @ 26/11/2026 |
|---|---:|---:|
| Example Multi-Asset Fund | 52,000.00 | 63,500.00 |
| Example Bond Fund | 48,000.00 | 62,500.00 |

Blank cells are **missing values**, not zero. Unknown fund names and duplicate holding/date valuations are rejected.

### Dated cash flows

| Date | Type | Holding | Amount | Notes |
|---|---|---|---:|---|
| 01/01/2024 | Contribution | Policy | 1,000.00 | Additional pension premium |
| 01/07/2025 | Withdrawal | Policy | 2,500.00 | ARF drawdown |

Accepted dates: Irish DD/MM/YYYY, ISO YYYY-MM-DD or 5-digit Excel date serial. EUR values use cents and comma thousands separators, not decimal-comma notation. On validation failure, the entire paste is rejected without partial changes. Confirm imported rows against the actual statements and save the policy.

## Optional statement reconciliation controls

For the statement's as-of date, enter the provider's **total contributions including the initial investment** and **total withdrawals**. The system compares them with the original investment plus actual dated contributions and with actual dated withdrawals. Disagreement is shown as a warning and blocks client PDF export for the relevant statement/report date.

**Statement totals never create fictitious transactions or transaction dates.** Original investment is entered once.

## Calculation

For the specified start/end dates:

- Net external cash flow = additional contributions – withdrawals.
- Investment gain/loss = closing market value – opening market value – net external cash flow.
- Modified Dietz denominator = opening market value + the sum of each signed cash flow multiplied by the fraction of the reporting period remaining after its date.
- **Cumulative Modified Dietz percentage** = gain/loss ÷ Modified Dietz denominator × 100.

This is a **single-period cash-flow-adjusted approximation**, not a true time-weighted return, not an annualised return, and not a provider quoted fund return. Actual valuations are never interpolated.

To combine policies, all selected policies must belong to the same named client and optional portfolio group and have adequate valuations for identical reporting dates. The combined return is computed from summed values and dated flows, **not an average of policy returns**. A policy opened after the reporting start requires special treatment of inception funding/transfers, so the current method refuses to assume a zero opening balance or invent an external cash flow. Choose common dates until the internal-transfer model is designed.

### Current limitations and release gates

1. **Fund switches/internal transfers** are not yet a separate transaction type. Fund-level return is withheld when a policy-level external cash flow cannot be allocated to the affected funds. Do not treat inter-fund transfers as fresh contributions or withdrawals.
2. Missing dates, valuations, unsupported cross-policy inception periods and nonpositive Dietz denominators result in unavailable returns, not estimates.
3. No annualised return or future projection is shown in actual performance.
4. Saved policy drafts do not require financial completeness. **Client PDF export requires an explicit adviser confirmation** of complete actual cash flows and reconciliation checks where available.
5. The V2-only database write API must retain its isolated Vercel project ID and Neon compute hostname guard. The original V1 database and Blob store must not be modified.
6. Run the V2 calculation, table-paste and PDF-rendering test suites plus Next.js TypeScript/build validation before any deployment.
7. Deploy once after a reviewed milestone. Do not use incremental deployment for every file change. Never merge V2 into V1 without explicit authorisation.

## Future acceptance work

- Internal transfers/switches across funds and policies, including ARF rollover accounting.
- Workbook-template export / optional direct structured workbook import.
- Reporting-period cash flow completeness audit and independent adviser review workflow.
- On-screen preview of Performance and Withdrawals PDFs and full visual comparison to Proposal.
