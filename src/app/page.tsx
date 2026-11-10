import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { ADMIN_EMAIL, auth, isLoginConfigured } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Fail closed: an unconfigured deployment must never expose client-facing tools.
  if (!isLoginConfigured()) {
    // Display only configuration status, never the secret values or their lengths.
    const secretReady = (process.env.AUTH_SECRET?.length ?? 0) >= 32;
    const passwordReady = (process.env.OMEGA_LOGIN_PASSWORD?.length ?? 0) >= 16;
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-wordmark"><span>Ω</span> OMEGA</div>
          <div className="auth-eyebrow">SECURE WORKSPACE SETUP</div>
          <h1>Administrator login is not configured.</h1>
          <p>The Omega Bond Proposal Generator is ready for a single-user login using <strong>{ADMIN_EMAIL}</strong>.</p>
          <p>In the Vercel project, add two server-only sensitive environment variables for Production:</p>
          <div className="auth-setup-vars"><code>AUTH_SECRET</code><code>OMEGA_LOGIN_PASSWORD</code></div>
          <div role="status" style={{ marginTop: 16, padding: "14px 16px", background: "#f8f5ef", borderRadius: 7, fontSize: 12, lineHeight: 1.9 }}>
            <div><strong>AUTH_SECRET:</strong> {secretReady ? "Configured correctly" : "Missing or fewer than 32 characters"}</div>
            <div><strong>OMEGA_LOGIN_PASSWORD:</strong> {passwordReady ? "Configured correctly" : "Missing or fewer than 16 characters"}</div>
          </div>
          <p>Both variables must be saved under this project's <strong>Production</strong> environment. Use a randomly generated secret of at least 32 characters and a unique password of at least 16 characters, without surrounding quotation marks. Redeploy after saving the variables. Never enter credentials in GitHub or this chat.</p>
          <a className="auth-button auth-link" href="https://vercel.com/goemeraldpathways-gmailcoms-projects/omega-bond-proposal/settings/environment-variables">Open Vercel environment settings</a>
          <p className="auth-legal">OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</p>
        </section>
      </main>
    );
  }
  const session = await auth();
  if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) redirect("/login");
  return <Workspace />;
}
