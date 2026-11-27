# Omega Funds Generator V2 — PDF preview implementation
Date: 27 November 2026

## Placement
- **Client proposal:** existing workbook-backed live A4 PDF viewer remains after proposal details; a matching placeholder is visible if allocations are not yet valid.
- **Performance:** full-width A4 PDF preview follows the performance summary and fund-level table, accessible via the top **Go to PDF preview** shortcut.
- **Withdrawals:** same placement and controls after the withdrawals summary, using the existing authenticated withdrawals PDF endpoint.
- **Combined portfolio:** an additional A4 PDF preview appears within the combined-policy report section when multiple policies are selected.

## Architecture
- The Performance/Withdrawals/Combined viewer is one reusable client-side component.
- Preview creation uses a user-triggered authenticated POST to `/api/v2/performance/pdf`. Reports are not regenerated on every form change.
- The generated PDF is embedded in an iframe using an in-memory object URL. **Download PDF uses the exact same object URL and bytes as the preview.**
- A subsequent edit or policy/tab change aborts an in-flight request, revokes the existing object URL and removes stale preview content.
- PDF generation is disabled unless the applicable reporting period, client details, cash-flow confirmation and reconciliation checks pass.
- Existing Proposal preview and server PDF generator are unchanged; no calculations or persisted records are modified by this feature.

## Isolated build verification
- All existing Proposal/fund application tests: PASS (21 + 127)
- Existing V2 calculations and PDF generation tests: PASS (27)
- New V2 preview layout, disabled state, and shared-blob contract tests: PASS (4)
- TypeScript (`npm run lint`): PASS
- Next.js production build (`npx next build`): PASS
- **Total automated tests: 179 passing; no failures after React import compatibility fix.**
- No live V2 or V1 database was accessed. No credentials were used.

## Open acceptance test
After the next approved release, sign in and verify: Proposal preview; Performance preview/refresh/download; Withdrawals preview/refresh/download; combined-policy preview; and stale-preview clearing when values change. Use fictional data.

## Release status
This work is staged as a detached commit to respect the instruction to conserve Vercel deployments. The `v2-development` branch is not moved until a wider release is approved. V1 is untouched.
