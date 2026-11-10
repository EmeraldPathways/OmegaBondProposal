import { redirect } from "next/navigation";
import { ADMIN_EMAIL, auth, isLoginConfigured } from "@/auth";
import LoginForm from "@/components/login-form";

export const metadata = { title: "Secure Login | Omega Bond Proposals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isLoginConfigured()) redirect("/");
  const session = await auth();
  if (session?.user?.email?.toLowerCase() === ADMIN_EMAIL) redirect("/");
  return <LoginForm email={ADMIN_EMAIL} />;
}
