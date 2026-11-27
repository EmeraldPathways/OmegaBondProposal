import {NextRequest,NextResponse} from "next/server";

/**
 * V2 preview safety boundary.
 *
 * The current branch may inherit Vercel Preview environment variables from
 * the existing project. Until a separate V2 test database and blob store are
 * configured, forbid every write-capable API action in preview deployments.
 *
 * Production is unaffected: these files exist only on the v2-development
 * branch and nothing is merged into main.
 */
export function middleware(request:NextRequest){
  if(process.env.VERCEL_ENV!=="preview")return NextResponse.next();
  const pathname=request.nextUrl.pathname;
  if(["GET","HEAD","OPTIONS"].includes(request.method))
    return NextResponse.next();
  // Auth credential verification never changes a fund/portfolio record.
  if(pathname.startsWith("/api/auth/"))return NextResponse.next();
  // Proposal PDF generation reads current data and returns a PDF only.
  if(pathname==="/api/proposal/pdf"&&request.method==="POST")
    return NextResponse.next();
  return NextResponse.json({
    error:"Omega V2 is a read-only development preview. Data-changing actions "+
      "are disabled until a separate V2 test database is configured."
  },{status:403,headers:{"Cache-Control":"no-store"}});
}

export const config={matcher:["/api/:path*"]};
