import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Omega | Bond Proposal Generator",
  description: "Omega Financial Management investment bond portfolio analysis and proposal workspace.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
