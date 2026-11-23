import {NextResponse} from "next/server";
import {list} from "@vercel/blob";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {getActiveFunds} from "@/lib/server/active-funds";
import {CURRENT_FUND_COUNTS,matchWorkbookReturn,pdfFilenameFundKey,workbookNameKey}
  from "@/lib/reconciliation/workbook-source";
import type {WorkbookEntry,ReportedReturns} from "@/lib/reconciliation/engine";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
type Issue={fund:string;provider:string;problem:string};
type StorageFile={filename:string;pathname:string};

export async function GET(){
  if(!isLoginConfigured() ||
    (await auth())?.user?.email?.toLowerCase()!==ADMIN_EMAIL)
    return NextResponse.json({error:"Unauthorised"},{status:401,headers});
  try{
    const sql=getNeonSql();
    const latest=await sql.query(
      "SELECT id::text AS id,filename,storage_key FROM imports "+
      "WHERE storage_key LIKE 'funds/performance/%' AND filename ILIKE '%.xlsx' "+
      "ORDER BY uploaded_at DESC,id DESC LIMIT 1");
    if(!latest.length)
      return NextResponse.json({initialized:false,error:"No uploaded workbook was found."},{headers});
    const workbookId=String(latest[0].id);
    const [funds,rows,pdfs,reconciliations,extractions,activeSources]=await Promise.all([
      getActiveFunds(),
      sql.query("SELECT provider,row_number,source_name,reported_returns "+
        "FROM fund_source_performance WHERE import_id=$1::uuid",[workbookId]),
      sql.query("SELECT id::text AS id,filename,storage_key "+
        "FROM imports WHERE storage_key LIKE 'funds/factsheets/%' "+
        "AND filename ILIKE '%.pdf'"),
      sql.query("SELECT fund_id,performance_import_id::text AS performance_id,"+
        "factsheet_import_id::text AS pdf_id,selected_workbook_row,status,evidence "+
        "FROM fund_reconciliations"),
      sql.query("SELECT import_id::text AS id,status,(data IS NOT NULL) AS has_data "+
        "FROM fund_source_factsheets"),
      sql.query("SELECT DISTINCT workbook_import_id::text AS id FROM fund_active_names")
    ]);
    const performance:WorkbookEntry[]=rows.map(v=>({
      provider:String(v.provider),sourceName:String(v.source_name),
      rowNumber:Number(v.row_number),returns:v.reported_returns as ReportedReturns
    }));
    const pdfFiles:StorageFile[]=pdfs.map(v=>({
      filename:String(v.filename),pathname:String(v.storage_key)
    }));
    const pdfByKey=new Map<string,typeof pdfs>();
    for(const file of pdfs){
      const key=pdfFilenameFundKey(String(file.filename));
      pdfByKey.set(key,[...(pdfByKey.get(key)??[]),file]);
    }
    const reconByFund=new Map(reconciliations.map(v=>[String(v.fund_id),v]));
    const providerCounts:Record<string,number>={};
    for(const fund of funds)providerCounts[fund.provider]=(providerCounts[fund.provider]??0)+1;
    const issues:Issue[]=[];
    let exactFilenamePairs=0,currentLinks=0,currentReturnRows=0;
    for(const fund of funds){
      const exact=matchWorkbookReturn(fund,performance);
      const linked=pdfByKey.get(workbookNameKey(fund.name))??[];
      const record=reconByFund.get(fund.id);
      if(exact)currentReturnRows++;
      else issues.push({fund:fund.name,provider:fund.provider,
        problem:"No unique matching performance row in the currently imported workbook"});
      if(linked.length===1)exactFilenamePairs++;
      else issues.push({fund:fund.name,provider:fund.provider,
        problem:linked.length===0?"PDF filename is not uploaded":"Duplicate PDF filenames exist"});
      if(!exact||linked.length!==1)continue;
      const evidence=record?.evidence as {
        matchBasis?:string;displayedReturnsSource?:string
      }|null;
      const matches=Boolean(record &&
        String(record.pdf_id)===String(linked[0].id) &&
        String(record.performance_id)===workbookId &&
        Number(record.selected_workbook_row)===exact.rowNumber &&
        evidence?.matchBasis==="unique_provider_qualified_filename" &&
        evidence?.displayedReturnsSource==="uploaded_workbook" &&
        record.status!=="manual_rejected");
      if(matches)currentLinks++;
      else issues.push({fund:fund.name,provider:fund.provider,
        problem:"Reconciliation link is stale or missing; run Recheck workbook + PDF matches"});
    }
    const names=new Set(funds.map(f=>workbookNameKey(f.name)));
    const extras=pdfFiles.filter(f=>!names.has(pdfFilenameFundKey(f.filename)))
      .map(f=>f.filename);
    const duplicatePdfFilenames=[...pdfByKey.entries()]
      .filter(([,files])=>files.length>1)
      .map(([,files])=>String(files[0].filename));
    const parsedIds=new Set(extractions.filter(v=>
      v.status==="parsed" && v.has_data).map(v=>String(v.id)));
    const parsedFactsheets=pdfs.filter(v=>parsedIds.has(String(v.id))).length;
    const providerCountsCorrect=Object.entries(CURRENT_FUND_COUNTS).every(
      ([p,count])=>providerCounts[p]===count);
    const activeWorkbookCurrent=activeSources.length===1 &&
      String(activeSources[0].id)===workbookId;
    const databaseReady=activeWorkbookCurrent && providerCountsCorrect &&
      funds.length===107 && performance.length===107 &&
      exactFilenamePairs===107 && currentReturnRows===107 &&
      currentLinks===107 && issues.length===0;
    let blobStatus:"verified"|"unavailable"="unavailable";
    let missingBlobFiles:string[]=[];
    try{
      const [factBlob,perfBlob]=await Promise.all([
        list({prefix:"funds/factsheets/",limit:1000}),
        list({prefix:"funds/performance/",limit:1000})
      ]);
      if(!factBlob.hasMore&&!perfBlob.hasMore){
        const blobPaths=new Set([
          ...factBlob.blobs.map(b=>b.pathname),
          ...perfBlob.blobs.map(b=>b.pathname)
        ]);
        missingBlobFiles=[
          ...pdfFiles.filter(p=>!blobPaths.has(p.pathname)).map(p=>p.filename),
          ...(!blobPaths.has(String(latest[0].storage_key))
            ?[String(latest[0].filename)]:[])
        ];
        blobStatus="verified";
      }
    }catch{
      // Database audit still works if Blob listing is temporarily unavailable.
      // Never claim the stored PDF objects are verified in that situation.
      blobStatus="unavailable";
    }
    return NextResponse.json({
      initialized:true,
      checkedAt:new Date().toISOString(),
      workbookFilename:String(latest[0].filename),
      expectedFunds:107,
      providerCounts,
      databaseReady,
      storageStatus:blobStatus,
      storageReady:blobStatus==="verified"?missingBlobFiles.length===0:null,
      proposalReady:databaseReady &&
        (blobStatus!=="verified"||missingBlobFiles.length===0),
      counts:{
        activeFunds:funds.length,workbookReturnRows:performance.length,
        pdfUploadRecords:pdfs.length,exactFilenamePairs,currentReturnRows,
        currentReconciliationLinks:currentLinks,
        pdfTextExtracted:parsedFactsheets,
        pdfTextUnavailable:pdfs.length-parsedFactsheets,
        extraPdfRecords:extras.length,duplicatePdfFilenames:duplicatePdfFilenames.length
      },
      issues:issues.slice(0,107),
      extraPdfFilenames:extras,
      duplicatePdfFilenames,
      missingBlobFiles,
      storageNote:blobStatus==="unavailable"?
        "Blob object listing was unavailable; database records were audited but physical storage could not be independently checked.":null,
      note:"Filename matching verifies document association, not contents or client suitability. Fund performance figures are exclusively from the latest workbook."
    },{headers});
  }catch{
    console.error("Omega fund source database audit failed.");
    return NextResponse.json(
      {error:"Database audit failed; check the workbook import and database connection."},
      {status:500,headers});
  }
}
