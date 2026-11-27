# Omega Funds Generator V2 — Test & Fix Report
**Date:** 27 November 2026  
**Scope:** V2 staged feature milestone only; V1 left untouched.
**Change set:** proposal regression check, actual performance and withdrawals, manual spreadsheet paste, multi-policy cumulative Modified Dietz analysis, PDF exports.

## Verification results

| Area | Result | Evidence |
|---|---|---|
| Existing Proposal/fund application tests | PASS (127 / 127) | `npm test` in isolated Vercel Sandbox |
| V2 performance, pasted tables, cash flows, combined-policy calculations and PDF generation | PASS (27 / 27) | Node `--import tsx --test` V2 test files |
| TypeScript | PASS | `npm run lint` (`tsc --noEmit`) |
| Next.js production-style build | PASS | `npx next build`; V2 API routes compiled |
| Unauthenticated application HTTP smoke | PASS | Login HTTP 200, public health HTTP 200, home redirects HTTP 307, protected V2 policy API HTTP 401 |
| Database separation | PASS | V1 original 27 tables; V2 28 tables including V2-only `v2_investment_cases` |
| V1 write safety | PASS by inspection | No changes made to V1 repository branch, Neon main branch, or Blob store |

Total automated tests in the test run: **154 passed, 0 failed**.

## Defects discovered and corrections

1. **TypeScript error in actual Performance PDF export:** `input.record` was optional for the new combined-policy request shape, and the renderer was called with the union payload. **Fixed:** pass an explicit, narrowed single-policy payload to `PerformancePdf`. TypeScript and Next.js compile pass.
2. **Existing Proposal navigation regression:** the new V2 navigation shortened the existing `Client proposal` label to `Proposal`, breaking an existing regression assertion. **Fixed:** restore the original label, preserving navigation continuity. Full existing test suite passes.
3. **Local test setup:** `npm ci` could not run because the repository has no tracked `package-lock.json`. **Action:** use a sandbox-only `npm install` for the test session; generated lockfile was not committed. **Follow-up:** consider committing a reviewed lockfile to make future tests reproducible.

## Source-workbook compatibility

The provided valuation example includes Pension, Post-Retirement and Investment worksheet layouts with Excel date serials, fund-by-date valuations, and totals for contributions/withdrawals. The new manual paste format supports Excel dates and `Value @ DD/MM/YYYY` columns, exact fund-name matching, blank values as missing, and dated transaction rows. The example's total contributions/withdrawals do not establish the dates of the underlying transactions; those dates remain required for a valid cash-flow-adjusted return.

## Known limitations and controls

- No browser-level authenticated end-to-end testing against actual Vercel credentials was performed. Unauthenticated HTTP checks and source/sandbox validation are not a substitute for an adviser checking interactive screens after release.
- The V2 database and private Blob integration were not exercised using real client files during this sandbox test. Existing data migration was separately verified in the prior migration stage; current validation covers isolation and application interfaces, not an authenticated file-open journey.
- Fund switches/internal transfers are not yet a separate flow type. Do not treat them as new contributions or withdrawals. Missing valuations or unallocated cash flows suppress affected fund-level returns.
- Provider statement control totals are reconciliation checks; they never generate fictitious dated transactions.
- Client PDF export requires confirmed complete dated contributions and withdrawals, matched statement totals where available, and valid reporting valuations.
- All percentage returns in the actual investment reports are **cumulative Modified Dietz returns**, not annualised or true time-weighted returns.
- After deployment, remove the temporary V2-only environment variable `V1_BLOB_READ_WRITE_TOKEN` if it remains. Keep V2's own `DATABASE_URL`, `BLOB_STORE_ID`, and `BLOB_READ_WRITE_TOKEN`.

## Release procedure

1. Move the tested commit to `v2-development` once.
2. Trigger **one V2 Production deployment** from that exact commit, with the build test gate enabled.
3. Confirm deployment is READY and health/login routes respond.
4. Sign in with an adviser account and manually confirm saving a **fictional** V2 policy, navigating Proposal/Performance/Withdrawals, and viewing both PDF exports.
5. Keep V1 unchanged.
