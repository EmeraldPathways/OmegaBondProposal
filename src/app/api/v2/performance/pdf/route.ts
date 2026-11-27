import {renderToBuffer} from "@react-pdf/renderer";
import {z} from "zod";
import {auth, ADMIN_EMAIL, isLoginConfigured} from "@/auth";
import {investmentRecordSchema, v2DatabaseGuard} from "@/lib/v2-investment-schema";
import {calculatePerformance, isValidDate} from "@/lib/v2-investment-performance";
import {calculateCombinedPortfolio,portfolioWarnings} from "@/lib/v2-policy-portfolios";
import CombinedPortfolioPdf from "@/lib/pdf/v2-combined-portfolio-report";
import PerformancePdf from "@/lib/pdf/v2-performance-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const payload = z.object({
  record: investmentRecordSchema.optional(),
  records: z.array(investmentRecordSchema).min(2).max(40).optional(),
  startDate: z.string().refine(isValidDate),
  endDate: z.string().refine(isValidDate),
  reportType: z.enum(["performance","withdrawals","portfolio"])
});
const error=(message:string,status=400)=>Response.json({error:message},{status,headers});
export async function POST(request:Request) {
  if(!isLoginConfigured()||(await auth())?.user?.email?.toLowerCase()!==ADMIN_EMAIL)
    return error("Unauthorised.",401);
  if(!v2DatabaseGuard()) return error("The isolated V2 database connection is not verified.",503);
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return error("Invalid request origin.",403);
  if(Number(request.headers.get("content-length")||0)>250_000)
    return error("Request is too large.",413);
  let input:z.infer<typeof payload>;
  try {
    const body=await request.text();
    if(body.length>250_000)return error("Request is too large.",413);
    input=payload.parse(JSON.parse(body));
  }catch{return error("Enter valid policy, valuation and transaction data.");}
  if(input.reportType==="portfolio"){
    if(!input.records||input.record)return error("Select two or more saved policies for the combined report.");
    if(input.records.some(r=>r.cashFlowsConfirmed!==true))return error("Confirm all actual dated contributions and withdrawals for each policy before exporting.",422);
    const combined=calculateCombinedPortfolio(input.records,input.startDate,input.endDate);
    if(!combined.available)return error(combined.reason,422);
    const warnings=portfolioWarnings(input.records,input.startDate,input.endDate);
    if(warnings.length)return error("Correct valuation or cash-flow reconciliation before exporting: "+warnings[0],422);
    const combinedFlows=input.records.reduce((n,r)=>n+r.flows.filter(f=>f.date>input.startDate&&f.date<=input.endDate).length,0);
    if(combinedFlows>500)return error("Select a shorter reporting period. A combined PDF supports up to 500 dated cash flows.",422);
    try{
      const pdf=await renderToBuffer(CombinedPortfolioPdf({records:input.records,startDate:input.startDate,endDate:input.endDate}));
      return new Response(new Uint8Array(pdf),{status:200,headers:{
        ...headers,"Content-Type":"application/pdf",
        "Content-Disposition":"attachment; filename=\"Omega-Combined-Portfolio-Performance.pdf\"",
        "Content-Length":String(pdf.byteLength)
      }});
    }catch{
      console.error("[v2-combined-pdf] Report rendering failed.");
      return error("The combined report could not be generated.",500);
    }
  }
  if(!input.record)return error("Select a policy for this report.");
  if(input.record.cashFlowsConfirmed!==true)return error("Confirm the complete dated cash-flow ledger before exporting this client report.",422);
  if(!input.record.clientName||!input.record.policyName)
    return error("Client and policy names are required for client reports.");
  if(input.startDate>=input.endDate||input.record.investmentDate>input.startDate)
    return error("Select a valid reporting period after investment inception.");
  const warnings=portfolioWarnings([input.record],input.startDate,input.endDate);
  if(warnings.length)return error("Correct valuation or cash-flow reconciliation before exporting: "+warnings[0],422);
  const performance=calculatePerformance(input.record,input.startDate,input.endDate);
  if(input.reportType==="performance"&&!performance.available)
    return error("Performance report cannot be calculated: "+performance.reason,422);
  if(input.record.flows.filter(f=>f.date>input.startDate&&f.date<=input.endDate).length>500)
    return error("Select a shorter reporting period. A single PDF supports up to 500 dated cash flows.",422);
  try{
    const pdf=await renderToBuffer(PerformancePdf({record:input.record,startDate:input.startDate,endDate:input.endDate,reportType:input.reportType}));
    return new Response(new Uint8Array(pdf),{status:200,headers:{
      ...headers,"Content-Type":"application/pdf",
      "Content-Disposition":"attachment; filename="+(input.reportType==="performance"?"\"Omega-Investment-Performance.pdf\"":"\"Omega-Withdrawals-Statement.pdf\""),
      "Content-Length":String(pdf.byteLength)
    }});
  }catch{
    console.error("[v2-performance-pdf] Report rendering failed.");
    return error("The report could not be generated.",500);
  }
}
