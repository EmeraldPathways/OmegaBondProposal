# Omega Bond Proposal Generator — Single-user authentication

**Only permitted email:** `info@omegafinancial.ie`

The application uses Auth.js Credentials to authenticate one fixed email address against a server-only password held as a **Vercel Sensitive/Secret environment variable**. Auth.js provides encrypted, HttpOnly session cookies with an eight-hour expiry. There is no public sign-up route and no multi-user dashboard.

## Initial setup (Vercel)

Open: https://vercel.com/goemeraldpathways-gmailcoms-projects/omega-bond-proposal/settings/environment-variables

Add these **Production** environment variables with Sensitive/Secret enabled:

| Key | Value |
| --- | --- |
| `AUTH_SECRET` | A cryptographically generated random string, at least 32 characters. Generate on your own machine using `openssl rand -base64 48` or `npx auth secret`. |
| `OMEGA_LOGIN_PASSWORD` | A new, unique password of at least 16 characters. |

**Do not paste either secret into ChatGPT, GitHub, or a support ticket.** The email is fixed in source; there is no need for a separate email environment variable. Do not add secrets under `NEXT_PUBLIC_`.

After saving, **Redeploy** the latest `main` branch so the deployment picks up the variables.

## Behaviour

- Without both valid secrets, the app fails closed and displays a setup page instead of the workspace.
- With valid secrets, unauthenticated requests to `/` are redirected to `/login`.
- Login accepts only `info@omegafinancial.ie` and the configured password.
- The session expires after eight hours. A **Sign out** control ends the session.
- `/api/health?check=1` requires the same authenticated session.
- No fund/client-data write routes have been enabled. Vercel Deployment Protection stays enabled until the new login is verified.

## Changing the password

Replace `OMEGA_LOGIN_PASSWORD` in Vercel's environment settings, then redeploy. Existing sessions may remain active until their eight-hour expiry; for immediate revocation, rotate `AUTH_SECRET` too (this invalidates all sessions).

## Security limitations

This is an intentionally minimal single-user credentials system. Password storage is in a protected server-side environment variable, not browser storage, GitHub or public configuration. Use a password manager and a long, unique password. Auth.js handles CSRF and session cookies, but there is no managed password reset, MFA, or distributed rate limiting. Before removing Vercel Deployment Protection for public internet access, configure appropriate rate limits/WAF and verify sign-in, sign-out, and denied unauthenticated access end to end.

OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.
