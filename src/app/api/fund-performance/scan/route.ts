import { get } from "@vercel/blob";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import { getNeonSql } from "@/lib/server/neon";
import { APPROVED_FUNDS } from "@/lib/approved-funds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };
const sheetFor: Record<string,string> = {
  "Aviva":"AVIVA",
  "Zurich":"ZURICH",
  "Standard Life":"STANDARD",
  "New Ireland":"New Ireland",
};
const periods=["ytd","oneMonth","threeMonth","sixMonth","oneYear","threeYear","fiveYear","tenYear","sinceLaunch"] as const;
type ReturnValue = number | null;
type PerformanceRow = { sourceName: string; returns: Record<string,ReturnValue> };
type Candidate = PerformanceRow & { confidence: number };

async function permitted() {
  if (!isLoginConfigured()) return false;
  const session=await auth();
  return session?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}
function norm(value:string) {
  return value.toLowerCase()
    .replace(/&/g," and ").replace(/\b(l\s*and\s*g)\b/g,"legal general")
    .replace(/\bmaf\b/g,"multi asset").replace(/\bser\b/g,"series")
    .replace(/\beq\b/g,"equity").replace(/\bglo\b/g,"global")
    .replace(/\bfixed\.d\b/g,"fixed d")
    .replace(/[^a-z0-9]+/g," ").trim()
    .replace(/\b(zurich life|new ireland|standard life)\b/g,"")
    .replace(/\b(fund|life)\b/g," ")
    .replace(/\s+/g," ").trim();
}
function similarity(a:string,b:string) {
  const lhs=norm(a), rhs=norm(b);
  if(!lhs||!rhs)return 0;
  if(lhs===rhs)return 1;
  const tokens=(s:string)=>new Set(s.split(" ").filter(w=>w.length>1));
  const x=tokens(lhs),y=tokens(rhs);
  const shared=[...x].filter(t=>y.has(t)).length;
  const jaccard=shared/Math.max(1,x.size+y.size-shared);
  // Bigram score helps with shortened names, but does not prove the share class.
  const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
  const g1=grams(lhs.replace(/\s/g,"")),g2=grams(rhs.replace(/\s/g,""));
  const overlap=[...g1].filter(g=>g2.has(g)).length;
  const dice=2*overlap/Math.max(1,g1.size+g2.size);
  const contain=lhs.includes(rhs)||rhs.includes(lhs)?0.12:0;
  return Math.min(1,0.6*jaccard+0.4*dice+contain);
}
function cellText(cell:ExcelJS.Cell) {
  const v=cell.value;
  if(typeof v==="string")return v.trim();
  if(typeof v==="number")return String(v);
  if(v && typeof v==="object" && "text" in v) return String(v.text).trim();
  return cell.text?.trim()??"";
}
function cellPercent(cell:ExcelJS.Cell):ReturnValue {
  const v=cell.value;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const s=cellText(cell).replace(/%/g,"").trim();
  if(!s || s==="-" || s==="—" || s.toLowerCase()==="n/a")return null;
  const n=Number(s.replace(/,/g,""));
  return Number.isFinite(n)?n:null;
}
function values(sheet:ExcelJS.Worksheet):PerformanceRow[] {
  const first=sheet.getRow(1);
  if(cellText(first.getCell(1)).toLowerCase()!=="name" || cellText(first.getCell(9)).toLowerCase()!=="10yrs"){
    throw new Error("The performance worksheet has unexpected columns.");
  }
  const rows:PerformanceRow[]=[];
  for(let i=2;i<=sheet.rowCount;i++){
    const row=sheet.getRow(i);
    const sourceName=cellText(row.getCell(1));
    if(!sourceName)continue;
    const returns:Record<string,ReturnValue>={};
    for(let j=0;j<periods.length;j++)returns[periods[j]]=cellPercent(row.getCell(j+2));
    rows.push({sourceName,returns});
  }
  return rows;
}
async function ensureTable() {
  const sql=getNeonSql();
  await sql`CREATE TABLE IF NOT EXISTS approved_fund_review (
    fund_id text PRIMARY KEY,
    provider_name text NOT NULL,
    display_name text NOT NULL,
    source_import_id uuid NOT NULL REFERENCES imports(id),
    suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'needs_review',
    source_sheet text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function GET() {
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers:noStore});
  try{
    const sql=getNeonSql();
    const exists=await sql`SELECT to_regclass('public.approved_fund_review') IS NOT NULL AS ready`;
    if(!exists[0]?.ready) return NextResponse.json({scanned:false,reviews:[]},{headers:noStore});
    const records=await sql`SELECT fund_id,provider_name,display_name,status,source_sheet,
      source_import_id::text,updated_at::text,suggestions
      FROM approved_fund_review ORDER BY provider_name,display_name`;
    const approved=new Set(APPROVED_FUNDS.map(f=>f.id));
    return NextResponse.json({scanned:true,reviews:records.filter(r=>approved.has(String(r.fund_id)))},{headers:noStore});
  }catch{
    console.error("Fund shortlist review status read failed.");
    return NextResponse.json({error:"Could not load source matching status."},{status:500,headers:noStore});
  }
}

export async function POST(request:Request) {
  if(!await permitted())return NextResponse.json({error:"Unauthorised"},{status:401,headers:noStore});
  const origin=request.headers.get("origin");
  if(!origin || origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Invalid request origin."},{status:403,headers:noStore});
  try{
    const sql=getNeonSql();
    const stored=await sql`SELECT id::text,filename,storage_key FROM imports
      WHERE filename ILIKE '%Omega%Fund%Performance%' AND filename ILIKE '%.xlsx'
      AND storage_key LIKE 'funds/performance/%'
      ORDER BY uploaded_at DESC LIMIT 1`;
    if(!stored.length)return NextResponse.json({
      error:"No matching Omega November performance workbook is saved. Upload it under Fund uploads first."
    },{status:404,headers:noStore});

    const blob=await get(String(stored[0].storage_key),{access:"private"});
    if(!blob || blob.statusCode!==200)throw new Error("Workbook unavailable.");
    const raw=Buffer.from(await new Response(blob.stream).arrayBuffer());
    if(raw.byteLength>3_500_000)throw new Error("Workbook exceeds size limit.");
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(raw as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const master=workbook.getWorksheet("FUNDS");
    if(!master)throw new Error("FUNDS worksheet missing.");
    const sourceNames=new Set<string>();
    for(let i=2;i<=master.rowCount;i++){
      const row=master.getRow(i),provider=cellText(row.getCell(1)),name=cellText(row.getCell(2));
      if(provider && name)sourceNames.add(provider+"|"+name);
    }
    const expected=new Set(APPROVED_FUNDS.map(f=>f.provider+"|"+f.name));
    if(sourceNames.size!==115 || expected.size!==115 || [...expected].some(id=>!sourceNames.has(id))) {
      return NextResponse.json({error:"The workbook's FUNDS sheet does not match the approved 115-fund shortlist. No changes applied."},
        {status:409,headers:noStore});
    }
    const byProvider=new Map<string,PerformanceRow[]>();
    for(const [provider,sheetName] of Object.entries(sheetFor)){
      const sheet=workbook.getWorksheet(sheetName);
      if(!sheet)throw new Error("A required provider performance sheet is missing.");
      byProvider.set(provider,values(sheet));
    }
    const reviews=APPROVED_FUNDS.map(f=>{
      const rows=byProvider.get(f.provider)??[];
      const suggestions:Candidate[]=rows.map(row=>({
        ...row,confidence:Math.round(similarity(f.name,row.sourceName)*1000)/1000
      })).filter(row=>row.confidence>=0.35)
        .sort((a,b)=>b.confidence-a.confidence).slice(0,5);
      return {fundId:f.id,provider:f.provider,name:f.name,sourceSheet:sheetFor[f.provider],suggestions};
    });

    await ensureTable();
    const payload=JSON.stringify(reviews.map(r=>({
      ...r,sourceImportId:String(stored[0].id)
    })));
    await sql`INSERT INTO approved_fund_review (
      fund_id,provider_name,display_name,source_import_id,source_sheet,suggestions,status
    ) SELECT x->>'fundId', x->>'provider', x->>'name',
      (x->>'sourceImportId')::uuid, x->>'sourceSheet',x->'suggestions','needs_review'
      FROM jsonb_array_elements(${payload}::jsonb) AS x
    ON CONFLICT (fund_id) DO UPDATE SET
      provider_name=EXCLUDED.provider_name,
      display_name=EXCLUDED.display_name,
      source_import_id=EXCLUDED.source_import_id,
      source_sheet=EXCLUDED.source_sheet,
      suggestions=EXCLUDED.suggestions,
      status='needs_review',
      updated_at=now()`;

    return NextResponse.json({
      scanned:true,shortlisted:reviews.length,
      withSuggestions:reviews.filter(r=>r.suggestions.length>0).length,
      unavailable:reviews.filter(r=>r.suggestions.length===0).length,
      sourceWorkbook:String(stored[0].filename),
      message:"Shortlist matched to workbook candidates. All mappings require human approval and no performance is activated."
    },{headers:noStore});
  }catch(error){
    console.error("Approved fund source workbook staging failed.",error instanceof Error?error.message:"Unknown error");
    return NextResponse.json({error:"Could not stage the approved fund performance workbook."},{status:500,headers:noStore});
  }
}
