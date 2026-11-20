import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {createPdfPerformanceWorkbook,type StoredPdfRecord} from "@/lib/export/pdf-performance-workbook";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const noStore={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function authorised(){
  return isLoginConfigured() && (await auth())?.user?.email?.toLowerCase()===ADMIN_EMAIL;
}

/**
 * Download the complete private Vercel PDF archive's extracted data as one XLSX.
 * Each uploaded PDF is included even if its title/table could not be read.
 * The source of every return is the individual original PDF, not a workbook.
 */
export async function GET(request:Request){
  if(!await authorised())
    return NextResponse.json({error:"Unauthorised"},{status:401,headers:noStore});
  try{
    const sql=getNeonSql();
    const rows=await sql.query([
      "SELECT i.id::text AS import_id,i.filename,i.uploaded_at::text,",
      "f.status AS parse_status,f.error_message,f.data",
      "FROM imports i",
      "LEFT JOIN fund_source_factsheets f ON f.import_id=i.id",
      "WHERE i.storage_key LIKE 'funds/factsheets/%'",
      "ORDER BY i.uploaded_at ASC,i.id ASC LIMIT 1000"
    ].join(" "));
    if(!rows.length)
      return NextResponse.json({error:"No private fund PDFs are stored. Upload factsheets first."},
        {status:404,headers:noStore});
    const records:StoredPdfRecord[]=rows.map(row=>({
      importId:String(row.import_id),
      filename:String(row.filename),
      uploadedAt:row.uploaded_at?String(row.uploaded_at):null,
      status:row.parse_status?String(row.parse_status):null,
      errorMessage:row.error_message?String(row.error_message):null,
      data:row.data??null
    }));
    const workbook=createPdfPerformanceWorkbook(records,new URL(request.url).origin);
    const result=await workbook.xlsx.writeBuffer();
    const buffer=Buffer.from(result);
    const body=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength) as ArrayBuffer;
    const date=new Date().toISOString().slice(0,10);
    return new Response(body,{headers:{
      ...noStore,
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":'attachment; filename="Omega-All-PDF-Fund-Performance-'+date+'.xlsx"',
      "Content-Length":String(buffer.byteLength)
    }});
  }catch(error){
    console.error("Private PDF Excel export failed",error instanceof Error?error.name:"unknown");
    return NextResponse.json({error:"Could not export the PDF archive. Try importing PDF return tables and retry."},
      {status:500,headers:noStore});
  }
}
