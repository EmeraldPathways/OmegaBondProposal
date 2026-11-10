# Validate Neon + Private Vercel Blob

Project: `omega-bond-proposal`  
Account/team: `goemeraldpathways-gmailcoms-projects`

## Status

The user reported that Neon and private Vercel Blob were installed and connected through Vercel on 10 November 2026. However, the connected Vercel API still returned **403 Forbidden** when attempting to read environment-variable names or integration configuration. Resource creation and direct server-side verification are therefore not confirmed by the connector.

## Verify the deployment

1. Open the linked application's [health endpoint](https://omega-bond-proposal.vercel.app/api/health) while signed into the Vercel project. It shows whether `DATABASE_URL` and the Blob store ID/token are configured (no values displayed).
2. Open [read-only connection checks](https://omega-bond-proposal.vercel.app/api/health?check=1). Successful connections return `"neon":"ready"` and `"blob":"ready"`. The tests perform a Postgres `SELECT 1` and a read-only Blob listing; they never access client documents.
3. If either is `not_configured`, confirm the correct production environment was selected when connecting the resource and **redeploy**.
4. If either reports `connection_failed`, inspect that resource in Vercel Storage. Neon must supply a valid `DATABASE_URL`; Blob needs a private store connected to the project and either `BLOB_STORE_ID`/OIDC or a server-only token.
5. Keep Vercel Deployment Protection enabled. Never paste database URLs or Blob tokens into chat, tickets or GitHub.

The health route reports only booleans/states, not secrets or document names.

## Apply the initial schema (separate controlled step)

After the database connection test passes, run the one-time schema bootstrap from a trusted workstation or reviewed CI job with a securely injected `DATABASE_URL`:

```sh
npm install
npm run db:migrate
```

Do not paste `DATABASE_URL` into a command or source file. `db:migrate` does not automatically run on deployment; it creates tables only if the schema has not previously been initialised. Subsequent changes require versioned migrations and adviser-controlled testing.

## Additional safeguards still required

- Invite-only staff authentication and server-side authorisation.
- Fund identity matching and versioned source-data import endpoints.
- Private document write/read round trip in an authorised diagnostic flow.
- Provider-specific price-basis checks, audit logging and upload validation.
- Database tables must exist before any production data ingestion.

**Until these are done, the interface remains a synthetic-data demonstration.**

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
