import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./v2-performance.css";
export const metadata: Metadata = {
  title: "Omega | Bond Proposal Generator",
  description: "Omega Financial Management investment bond portfolio analysis and proposal workspace.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const isV2Preview=true; // V2 branch only: show warning on every deployment target.
  return <html lang="en"><body>
    {isV2Preview?<div role="status" style={{
      background:"#671E27",color:"#FFFFFF",fontSize:12,
      lineHeight:"18px",padding:"7px 18px",textAlign:"center",
      letterSpacing:".025em",fontFamily:"Arial, sans-serif"
    }}>
      OMEGA V2 · DEVELOPMENT PREVIEW · READ-ONLY — LIVE WEBSITE UNCHANGED
    </div>:null}
    {children}
  </body></html>;
}
