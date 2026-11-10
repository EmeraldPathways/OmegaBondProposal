"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import OmegaLogo from "@/components/omega-logo";

export default function LoginForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await signIn("credentials", {
        email,
        password,
        redirect: false,
        redirectTo: "/",
      });
      if (response?.error) {
        setError("Incorrect password. Please check your details and try again.");
        setPassword("");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Sign-in was unsuccessful. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-wordmark"><OmegaLogo variant="dark" width={280} /></div>
        <div className="auth-eyebrow">SECURE ADVISER WORKSPACE</div>
        <div className="auth-icon"><LockKeyhole size={23} aria-hidden="true" /></div>
        <h1 id="auth-title">Welcome back.</h1>
        <p>Sign in to your secure investment proposal workspace.</p>
        <form onSubmit={submit}>
          <label htmlFor="omega-email">Email address</label>
          <input id="omega-email" name="email" type="email" value={email} autoComplete="username" readOnly aria-readonly="true" />
          <label htmlFor="omega-password">Password</label>
          <div className="auth-password">
            <input id="omega-password" name="password" type={visible ? "text" : "password"} required minLength={1} maxLength={512}
              value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
            <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-button" type="submit" disabled={submitting || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-helper">Single-user access. There is no public registration.</p>
        <p className="auth-legal">OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</p>
      </section>
    </main>
  );
}
