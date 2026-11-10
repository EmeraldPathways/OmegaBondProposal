# Neon and Vercel Blob provisioning — Omega Bond Proposal

Target team: `goemeraldpathways-gmailcoms-projects` (`team_BoGud9hs1z0FtJhldp67eW4A`).  
Target project: `omega-bond-proposal` (`prj_0iAsD2dMBwAoVZnc8PqS5g2ki2vC`).

## Current issue

On 10 November 2026, the Vercel connector returned **403 forbidden** for reading project environment variables and for creating a private Blob store. The Vercel CLI fallback reported **invalid token**. Therefore neither service can be treated as connected or operational from this session. No secrets should be pasted into ChatGPT.

## Required account-side steps

1. Sign into the Vercel dashboard as a team member authorised to create storage and manage integrations.
2. Open the **omega-bond-proposal** project and choose **Storage**.
3. Add **Neon Postgres** via the Vercel Marketplace, connect it to this project, and select the intended environments. Use a separate database or branch for previews.
4. Create a **Vercel Blob** store with **Private** access (not public). Connect it to this project, preferably in a European region.
5. Review the environment-variable **names** in Project Settings. Neon should supply its connection variable (often `DATABASE_URL`); Blob should supply `BLOB_STORE_ID` with Vercel OIDC or a server-only write token as appropriate. Never put either secret in source control.
6. Reauthorise the Vercel connector for the relevant team/project with permissions to manage integrations, storage and environment variables. If the team uses role restrictions, a team owner must approve.
7. Redeploy the project after the connections are established. Do not remove Vercel deployment protection until app-level staff authentication and authorisation are implemented.

## CLI alternative on an authorised workstation

From a cloned repository linked to this Vercel project:

```sh
vercel login
vercel link --yes --scope goemeraldpathways-gmailcoms-projects --project omega-bond-proposal
vercel integration add neon --scope goemeraldpathways-gmailcoms-projects
vercel blob create-store omega-bond-proposal-documents --access private --region dub1 --yes
vercel env ls
```

Some Marketplace steps involve billing approval or an account-side confirmation. Do not rerun install if a database already exists; connect the existing resource instead.

## Activation / verification

- `src/lib/server/neon.ts` contains the lazy server-only Neon driver and a `SELECT 1` connection probe for authorised diagnostics.
- `src/lib/server/blob.ts` contains private document helpers. No unauthenticated upload, download or delete routes are registered.
- A database schema draft exists at `src/lib/schema.sql`, but **migrations have not run**. Database connection alone is not equivalent to a working data library.
- Before real client files can be accepted, implement staff login, server-side authorisation, audit logs, upload validation/limits, import staging and migrations. Verify a private Blob round trip using a harmless test file from an authorised route and then delete the test object.
