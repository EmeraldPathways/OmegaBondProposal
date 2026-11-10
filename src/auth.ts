import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/** Exactly one permitted account; no sign-up, invitations or additional users. */
export const ADMIN_EMAIL = "info@omegafinancial.ie";

/** Both secrets must be present before any access to the financial workspace is allowed. */
export function isLoginConfigured(): boolean {
  return (
    (process.env.AUTH_SECRET?.length ?? 0) >= 32 &&
    (process.env.OMEGA_LOGIN_PASSWORD?.length ?? 0) >= 16
  );
}

/** Fixed-length hashes prevent string-length timing leaks in the equality check. */
function safePasswordEquals(candidate: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      name: "Omega adviser login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!isLoginConfigured()) return null;
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (email !== ADMIN_EMAIL || password.length < 1 || password.length > 512) return null;
        if (!safePasswordEquals(password, process.env.OMEGA_LOGIN_PASSWORD!)) return null;
        return { id: "omega-single-adviser", name: "Omega Financial Management", email: ADMIN_EMAIL };
      },
    }),
  ],
});
