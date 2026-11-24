import {renderToBuffer} from "@react-pdf/renderer";
import {get} from "@vercel/blob";
import {z} from "zod";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {getActiveFunds} from "@/lib/server/active-funds";
import {matchWorkbookReturn,workbookNameKey,pdfFilenameFundKey} from "@/lib/reconciliation/workbook-source";
import type {WorkbookEntry,ReportedReturns,FactSheetData} from "@/lib/reconciliation/engine";
import {extractFundFactsheet} from "@/lib/reconciliation/factsheet";
import WorkbookProposalPDF, {
  type WorkbookProposalData,type WorkbookProposalFund,type WorkbookReturnPeriods
} from "@/lib/pdf/workbook-proposal";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const noCache={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const portfolio=z.object({
  id:z.string().trim().min(1).max(30),
  title:z.string().trim().min(1).max(80),
  description:z.string().trim().max(250),
  weights:z.record(z.number().finite().min(0).max(100))
});
const payload=z.object({
  client:z.string().trim().max(120).default(""),
  adviser:z.string().trim().min(1).max(120),
  objective:z.string().trim().min(1).max(600),
  investment:z.number().finite().positive().max(1e9),
  portfolios:z.array(portfolio).min(1).max(3)
});
const periods=[
  "ytd","oneMonth","threeMonth","sixMonth","oneYear",
  "threeYear","fiveYear","tenYear","sinceLaunch"
] as const;
function safeReturns(value:ReportedReturns):WorkbookReturnPeriods{
  const returns={} as WorkbookReturnPeriods;
  for(const period of periods){
    const n=value?.[period];
    if(n==null){returns[period]=null;continue;}
    if(typeof n!=="number"||!Number.isFinite(n)||Math.abs(n)>100000)
      throw new Error("A workbook return value is invalid.");
    returns[period]=n;
  }
  return returns;
}
function validationError(error:string,status=422){
  return Response.json({error},{status,headers:noCache});
}

export async function POST(request:Request){
  if(!isLoginConfigured() ||
    (await auth())?.user?.email?.toLowerCase()!==ADMIN_EMAIL)
    return validationError("Unauthorised.",401);
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return validationError("Invalid request origin.",403);
  const length=Number(request.headers.get("content-length")||0);
  if(length>32000)return validationError("Proposal request is too large.",413);
  let data:z.infer<typeof payload>;
  try{
    const body=await request.text();
    if(body.length>32000)return validationError("Proposal request is too large.",413);
    data=payload.parse(JSON.parse(body));
  }catch{
    return validationError("Enter valid proposal details and complete allocations.",400);
  }
  if(new Set(data.portfolios.map(p=>p.id)).size!==data.portfolios.length)
    return validationError("The selected portfolios must be distinct.");

  const requestedIds=new Set<string>();
  for(const p of data.portfolios){
    const allocations=Object.entries(p.weights).filter(([,weight])=>weight>0);
    const total=allocations.reduce((sum,[,weight])=>sum+weight,0);
    if(allocations.length<1||allocations.length>30||Math.abs(total-100)>0.005)
      return validationError("Each selected portfolio must allocate exactly 100% across 1–30 funds.");
    for(const [id] of allocations)requestedIds.add(id);
  }
  try{
    const sql=getNeonSql();
    const [active,source]=await Promise.all([
      getActiveFunds(),
      sql.query("SELECT id::text,filename FROM imports WHERE storage_key LIKE 'funds/performance/%' "+
        "AND filename ILIKE '%.xlsx' ORDER BY uploaded_at DESC,id DESC LIMIT 1")
    ]);
    if(active.length!==107||!source.length)
      return validationError("Import the current 107-fund workbook before generating a proposal.");
    const sourceId=String(source[0].id);
    const idMap=new Map(active.map(f=>[f.id,f]));
    if([...requestedIds].some(id=>!idMap.has(id)))
      return validationError("Some portfolio funds are no longer listed in the current workbook.");

    // Do not trust returns or fund metadata from the browser. Resolve every
    // selected series independently against the most recent workbook import.
    const [rows,activeSources,linkedDocs]=await Promise.all([
      sql.query("SELECT provider,row_number,source_name,reported_returns "+
        "FROM fund_source_performance WHERE import_id=$1::uuid",[sourceId]),
      sql.query("SELECT DISTINCT workbook_import_id::text AS id FROM fund_active_names"),
      sql.query("SELECT r.fund_id,r.factsheet_import_id::text,r.status,r.evidence,"+
        "i.filename AS source_filename,i.storage_key AS source_path,"+
        "s.data AS source_data "+
        "FROM fund_reconciliations r "+
        "LEFT JOIN imports i ON i.id=r.factsheet_import_id "+
        "LEFT JOIN fund_source_factsheets s ON s.import_id=r.factsheet_import_id")
    ]);
    if(activeSources.length!==1||String(activeSources[0].id)!==sourceId)
      return validationError("The workbook has been uploaded but not imported. Run workbook matching first.");
    const entries:WorkbookEntry[]=rows.map(row=>({
      provider:String(row.provider),rowNumber:Number(row.row_number),
      sourceName:String(row.source_name),returns:row.reported_returns as ReportedReturns
    }));
    // Older New Ireland PDFs were previously classified as "unknown" because
    // the provider appears on page 2, not the first 2500 characters. Reparse
    // only selected, still-linked sources with missing metadata, and cache the
    // corrected extraction for subsequent client proposals. Performance rows
    // and all workbook values remain untouched.
    const newIrelandMissing=linkedDocs.filter(doc=>{
      const fund=idMap.get(String(doc.fund_id));
      const pdf=doc.source_data as FactSheetData|null;
      return requestedIds.has(String(doc.fund_id)) &&
        fund?.provider==="New Ireland" &&
        doc.factsheet_import_id && doc.source_path && doc.source_filename &&
        pdfFilenameFundKey(String(doc.source_filename))===workbookNameKey(fund.name) &&
        (!pdf?.objective || !pdf?.riskProfile);
    });
    for(let i=0;i<newIrelandMissing.length;i+=3){
      await Promise.all(newIrelandMissing.slice(i,i+3).map(async doc=>{
        try{
          const blob=await get(String(doc.source_path),{access:"private"});
          if(!blob||blob.statusCode!==200)throw new Error("PDF not in private storage");
          const bytes=new Uint8Array(await new Response(blob.stream).arrayBuffer());
          if(bytes.byteLength>3_500_000 || bytes.byteLength<100 ||
             Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
            throw new Error("Invalid source PDF");
          const extracted=await extractFundFactsheet({
            importId:String(doc.factsheet_import_id),
            filename:String(doc.source_filename),data:bytes
          });
          if(extracted.providerHint!=="New Ireland" || !extracted.objective)
            throw new Error("New Ireland fund description not found");
          await Promise.all([
            sql.query(
              "UPDATE fund_source_factsheets SET data=$2::jsonb,"+
              "status='parsed',error_message=NULL,processed_at=now() "+
              "WHERE import_id=$1::uuid",
              [doc.factsheet_import_id,JSON.stringify(extracted)]
            ),
            sql.query(
              "UPDATE fund_reconciliations SET extracted_factsheet=$3::jsonb "+
              "WHERE fund_id=$1 AND factsheet_import_id=$2::uuid",
              [doc.fund_id,doc.factsheet_import_id,JSON.stringify(extracted)]
            )
          ]);
          doc.source_data=extracted;
        }catch{
          // A malformed source cannot be filled with guessed information.
          // Keep the existing parsed data and preserve proposal export.
          console.warn("New Ireland factsheet metadata enrichment unavailable.");
        }
      }));
    }
    const pdfMap=new Map(linkedDocs.map(row=>[String(row.fund_id),row]));
    const portfolioReports=data.portfolios.map(p=>{
      const funds:WorkbookProposalFund[]=Object.entries(p.weights)
        .filter(([,weight])=>weight>0)
        .map(([id,weight])=>{
          const fund=idMap.get(id)!;
          const row=matchWorkbookReturn(fund,entries);
          if(!row)throw new Error("Workbook return row missing for "+fund.name);
          const doc=pdfMap.get(id);
          const proof=doc?.evidence as {matchBasis?:string}|null;
          const pdfFilename=doc?.source_filename?String(doc.source_filename):null;
          if(!pdfFilename || proof?.matchBasis!=="unique_provider_qualified_filename" ||
             pdfFilenameFundKey(pdfFilename)!==workbookNameKey(fund.name))
            throw new Error("A current matching PDF filename is missing for "+fund.name);
          const pdf=doc?.source_data as FactSheetData|null;
          const short=(v:unknown,max=600)=>typeof v==="string"?v.trim().slice(0,max)||null:null;
          const numeric=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100?v:null;
          return {
            id,name:fund.name,provider:fund.provider,
            weight,allocatedAmount:data.investment*weight/100,
            returns:safeReturns(row.returns),
            factsheet:{
              filename:pdfFilename,title:short(pdf?.title,160),date:short(pdf?.asOf,50),
              objective:short(pdf?.objective,1200),strategy:short(pdf?.strategy,1200),
              moneyMateId:short(pdf?.moneyMateId,40),baseCurrency:short(pdf?.baseCurrency,8),
              riskProfile:short(pdf?.riskProfile,80),
              managedBy:short(pdf?.managedBy,240),
              managementStyle:short(pdf?.managementStyle,240),
              assetMix:short(pdf?.assetMix,300),
              taxStatus:short(pdf?.taxStatus,40),
              riskRating:typeof pdf?.riskRating==="number"&&Number.isInteger(pdf.riskRating)&&
                pdf.riskRating>=1&&pdf.riskRating<=7?pdf.riskRating:null,
              amcPct:numeric(pdf?.amcPct),civPct:numeric(pdf?.civPct),
              chartPages:(pdf?.chartReferences??[]).slice(0,12).map(c=>
                String(c.label).slice(0,60)+" (page "+Number(c.page)+")")
            }
          };
        });
      return {id:p.id,title:p.title,description:p.description,funds};
    });
    const report:WorkbookProposalData={
      client:data.client,adviser:data.adviser,objective:data.objective,
      investment:data.investment,workbookFilename:String(source[0].filename),
      preparedDate:new Intl.DateTimeFormat("en-IE",{
        timeZone:"Europe/Dublin",day:"numeric",month:"long",year:"numeric"
      }).format(new Date()),
      portfolios:portfolioReports
    };
    const pdf=await renderToBuffer(WorkbookProposalPDF({data:report}));
    return new Response(new Uint8Array(pdf),{
      status:200,headers:{...noCache,
        "Content-Type":"application/pdf",
        "Content-Disposition":"attachment; filename=\"Omega-Investment-Bond-Proposal.pdf\"",
        "Content-Length":String(pdf.byteLength)
      }
    });
  }catch(error){
    if(error instanceof Error && (
      error.message.startsWith("Workbook return row missing")||
      error.message.startsWith("A current matching PDF filename is missing")||
      error.message.startsWith("A workbook return value is invalid")
    ))return validationError(error.message);
    console.error("Omega workbook proposal PDF generation failed.");
    return validationError("The draft proposal could not be generated. Check the latest workbook import and retry.",500);
  }
}
