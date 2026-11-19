/**
 * One-time stage of exact printed return tables from Omega's private PDFs.
 * Original PDFs and all existing manual decisions are preserved.
 * No workbook return is used as a fallback and no published return is
 * marked approved for client proposals by this maintenance operation.
 */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {extractText,getDocumentProxy} from "unpdf";
import {parsePdfPerformance} from "../src/lib/reconciliation/pdf-performance.ts";
import type {FactSheetData} from "../src/lib/reconciliation/engine.ts";

const log=(code:string,detail:object)=>console.log("OMEGA_OFFICIAL_PDF_"+code,JSON.stringify(detail));
if(process.env.VERCEL_ENV!=="production"){log("SKIP",{reason:"production-only"});process.exit(0);}
if(!process.env.DATABASE_URL||!process.env.BLOB_STORE_ID)throw new Error("Private production database/blob are required.");
const sql=neon(process.env.DATABASE_URL);
const sources=await sql.query(
  "SELECT f.import_id::text,i.storage_key,f.data FROM fund_source_factsheets f "+
  "JOIN imports i ON i.id=f.import_id WHERE f.status='parsed' AND f.data IS NOT NULL ORDER BY f.import_id"
);
const documents=new Map<string,FactSheetData>();
const counts:Record<string,{total:number,extracted:number,withoutTable:number,needsReview:number}>={};
let failed=0;
for(const row of sources){
  const data=row.data as FactSheetData;
  const provider=String(data.providerHint??"Unknown");
  const c=counts[provider]??={total:0,extracted:0,withoutTable:0,needsReview:0};
  c.total++;
  try{
    const result=await get(String(row.storage_key),{access:"private"});
    if(!result||result.statusCode!==200)throw new Error("Private PDF unavailable.");
    const bytes=new Uint8Array(await new Response(result.stream).arrayBuffer());
    if(bytes.length<6||bytes.length>3_500_000)throw new Error("PDF outside allowed byte range.");
    const proxy=await getDocumentProxy(bytes);
    const txt=await extractText(proxy);
    const pages=Array.isArray(txt.text)?txt.text:[txt.text];
    const performance=parsePdfPerformance({provider:data.providerHint,title:data.title,pages});
    if(performance.status==="extracted")c.extracted++;
    else if(performance.status==="needs_review")c.needsReview++;
    else c.withoutTable++;
    const merged={...data,performance};
    await sql.query(
      "UPDATE fund_source_factsheets SET data=$2::jsonb,processed_at=now() WHERE import_id=$1::uuid",
      [row.import_id,JSON.stringify(merged)]
    );
    documents.set(String(row.import_id),merged);
  }catch(error){
    failed++;c.needsReview++;
    log("SOURCE_ERROR",{provider,kind:error instanceof Error?error.name:"Error"});
  }
}
log("DOCUMENTS",{count:sources.length,failed,providers:counts});

const recs=await sql.query(
  "SELECT fund_id,factsheet_import_id::text,evidence FROM fund_reconciliations"
);
let staged=0,withheld=0,missing=0;
for(const r of recs){
  const pdf=r.factsheet_import_id?documents.get(String(r.factsheet_import_id)):null;
  const approved=Boolean((r.evidence as {factsheetIdentityApproved?:boolean}|null)?.factsheetIdentityApproved);
  const perf=pdf?.performance;
  // PDF title must be accepted for this fund, and the PDF performance table
  // must be extractable and dated. Merely choosing the nearest filename or
  // workbook row cannot turn a return into an official PDF source figure.
  const usable=approved && perf?.status==="extracted" &&
    perf?.asOf && Object.values(perf.returns).some(x=>x!==null);
  const sourceMetadata=perf?{
    source:"official_factsheet_pdf",importId:String(r.factsheet_import_id),
    status:perf.status,asOf:perf.asOf,asOfPrecision:perf.asOfPrecision,
    feeBasis:perf.feeBasis,returnKinds:perf.returnKinds,
    page:perf.page,warnings:perf.notes
  }:null;
  const evidence={...(r.evidence as Record<string,unknown>??{}),
    publishedPerformance:sourceMetadata,
    displayedReturnsSource:usable?"official_factsheet_pdf":null,
    workbookReturnsUsed:false
  };
  await sql.query(
    "UPDATE fund_reconciliations SET reported_returns=$2::jsonb,extracted_factsheet=$3::jsonb,"+
    "evidence=$4::jsonb,returns_approved=false,updated_at=now() WHERE fund_id=$1",
    [r.fund_id,usable?JSON.stringify(perf!.returns):null,
      pdf?JSON.stringify(pdf):null,JSON.stringify(evidence)]
  );
  if(usable)staged++;else if(pdf)withheld++;else missing++;
}
log("COMPLETE",{funds:recs.length,pdfReturnsStaged:staged,withheldOrUnsupported:withheld,
  noCandidatePdf:missing,clientReportReturnsApproved:0,workbookReturnFallbacks:0});
