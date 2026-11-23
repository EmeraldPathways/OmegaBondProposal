/** Read-only release check against production Neon and private Vercel Blob.
 * Reports counts, not credentials or client data. */
import {neon} from "@neondatabase/serverless";
if(process.env.VERCEL_ENV!=="production"){
  console.log("[Omega source audit] Skipped outside production deployment.");
  process.exit(0);
}
if(!process.env.DATABASE_URL){
  console.log("[Omega source audit] UNAVAILABLE: DATABASE_URL not configured at build time.");
  process.exit(0);
}
const key=(value)=>String(value).normalize("NFKC").toLowerCase()
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const pdfKey=(value)=>key(String(value).replace(/\.pdf$/i,""));
async function run(){
  const sql=neon(process.env.DATABASE_URL);
  const latest=await sql.query("SELECT id::text,filename,storage_key FROM imports "+
    "WHERE storage_key LIKE 'funds/performance/%' AND filename ILIKE '%.xlsx' "+
    "ORDER BY uploaded_at DESC,id DESC LIMIT 1");
  if(!latest.length){console.log("[Omega source audit] FAIL: no current workbook.");return;}
  const id=String(latest[0].id);
  const [funds,perf,pdfs,links,extracted]=await Promise.all([
    sql.query("SELECT fund_id,provider,name,workbook_import_id::text FROM fund_active_names"),
    sql.query("SELECT provider,row_number,source_name FROM fund_source_performance WHERE import_id=$1::uuid",[id]),
    sql.query("SELECT id::text,filename,storage_key FROM imports "+
      "WHERE storage_key LIKE 'funds/factsheets/%' AND filename ILIKE '%.pdf'"),
    sql.query("SELECT fund_id,performance_import_id::text AS workbook_id,"+
      "factsheet_import_id::text AS pdf_id,selected_workbook_row,status,evidence FROM fund_reconciliations"),
    sql.query("SELECT import_id::text,status FROM fund_source_factsheets WHERE status='parsed'")
  ]);
  const rows=new Map();
  for(const row of perf){
    const identity=String(row.provider)+"|"+key(row.source_name);
    rows.set(identity,[...(rows.get(identity)??[]),row]);
  }
  const filenames=new Map();
  for(const f of pdfs){
    const identity=pdfKey(f.filename);
    filenames.set(identity,[...(filenames.get(identity)??[]),f]);
  }
  const linkMap=new Map(links.map(v=>[String(v.fund_id),v]));
  const providers={Aviva:0,Zurich:0,"New Ireland":0,"Standard Life":0};
  let returnsMatched=0,filenameMatched=0,currentLinks=0;
  const problems=[];
  for(const f of funds){
    providers[f.provider]=(providers[f.provider]??0)+1;
    const row=rows.get(String(f.provider)+"|"+key(f.name))??[];
    const pdf=filenames.get(key(f.name))??[];
    if(row.length===1)returnsMatched++;else problems.push(String(f.name)+" (workbook row "+row.length+")");
    if(pdf.length===1)filenameMatched++;else problems.push(String(f.name)+" (PDF filenames "+pdf.length+")");
    const link=linkMap.get(String(f.fund_id));
    const evidence=link?.evidence??{};
    if(row.length===1&&pdf.length===1&&link &&
       String(link.workbook_id)===id && String(link.pdf_id)===String(pdf[0].id) &&
       Number(link.selected_workbook_row)===Number(row[0].row_number) &&
       link.status!=="manual_rejected" &&
       evidence.matchBasis==="unique_provider_qualified_filename" &&
       evidence.displayedReturnsSource==="uploaded_workbook")currentLinks++;
    else problems.push(String(f.name)+" (stale reconciliation link)");
  }
  const parsedIds=new Set(extracted.map(x=>String(x.import_id)));
  const parsed=pdfs.filter(f=>parsedIds.has(String(f.id))).length;
  const unexpected=pdfs.filter(f=>!funds.some(x=>key(x.name)===pdfKey(f.filename))).length;
  const countOk=funds.length===107&&perf.length===107&&pdfs.length===107&&
    providers.Aviva===25&&providers.Zurich===28&&
    providers["New Ireland"]===40&&providers["Standard Life"]===14;
  let blobResult="not checked";
  try{
    const {list}=await import("@vercel/blob");
    const [p,b]=await Promise.all([
      list({prefix:"funds/factsheets/",limit:1000}),
      list({prefix:"funds/performance/",limit:1000})
    ]);
    if(!p.hasMore&&!b.hasMore){
      const names=new Set([...p.blobs,...b.blobs].map(x=>x.pathname));
      const missing=pdfs.filter(x=>!names.has(String(x.storage_key))).length+
        (names.has(String(latest[0].storage_key))?0:1);
      blobResult="missing objects="+missing;
    }else blobResult="incomplete list";
  }catch{blobResult="listing unavailable"}
  console.log("[Omega source audit] Workbook="+latest[0].filename);
  console.log("[Omega source audit] Neon: funds="+funds.length+
    " returnRows="+perf.length+" pdfRecords="+pdfs.length+
    " parsedPDFs="+parsed+" externalPDFs="+unexpected);
  console.log("[Omega source audit] Providers="+JSON.stringify(providers));
  console.log("[Omega source audit] Exact match: returns="+returnsMatched+
    "/107 PDFnames="+filenameMatched+"/107 reconciled="+currentLinks+"/107");
  console.log("[Omega source audit] Vercel Blob: "+blobResult);
  if(problems.length)console.log("[Omega source audit] Exceptions="+problems.slice(0,30).join(" | "));
  console.log("[Omega source audit] DATABASE "+(countOk&&
    returnsMatched===107&&filenameMatched===107&&currentLinks===107&&unexpected===0?
      "PASS":"INCOMPLETE"));
}
try{await run()}catch(error){
  console.log("[Omega source audit] UNAVAILABLE: "+
    (error instanceof Error?error.name:"database query error")+
    ". Check the authenticated in-app source audit.");
}
