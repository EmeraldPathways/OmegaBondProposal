# Initial schema bootstrap completed

On **10 November 2026**, the project was verified connected to Neon and Vercel Blob using the read-only `/api/health?check=1` endpoint supplied by the user. The subsequent Vercel production build for commit `4c79286` reported **"Neon schema initialised successfully."**

This first migration created the tables described in `src/lib/schema.sql`. The follow-up change restored the normal `next build` command: migration is **not** executed on every deployment.

The schema is currently empty. No client records or official financial data have been uploaded.

## Verify

Visit [health checks](https://omega-bond-proposal.vercel.app/api/health?check=1) (while authorised through Vercel Deployment Protection).

Expected: `"neon":"ready"`, `"blob":"ready"`, `"schemaInitialized":true`.

## Next steps

1. Enable staff authentication and server-side role enforcement.
2. Connect the read-only fund catalogue in `src/lib/server/catalogue.ts` to the authenticated UI.
3. Add a private upload endpoint for factsheets and CSV/XLSX price files with content validation, access checks and DB transaction recording.
4. Perform an actual private Blob write/read/delete test using harmless test content.
5. Add fund identifier matching, import review and audited approval before publishing imported values to portfolio calculations.
6. Verify that issuance snapshots preserve exact data sources, prices, methodology and dates.

**Do not enter real client information until access controls, retention settings and private storage are fully verified.**

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
