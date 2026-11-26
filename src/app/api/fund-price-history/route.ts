import {NextResponse} from "next/server";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getActiveFunds} from "@/lib/server/active-funds";
import {getNeonSql} from "@/lib/server/neon";
import {readActiveFundPricePoints,currentPriceSnapshot} from "@/lib/server/fund-prices";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noCache={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

export async function GET(request:Request){
  if(!isLoginConfigured()||
     (await auth())?.user?.email?.toLowerCase()!==ADMIN_EMAIL)
    return NextResponse.json({error:"Unauthorised"},{status:401,headers:noCache});
  const id=new URL(request.url).searchParams.get("fundId")??"";
  if(!/^[a-z0-9-]{12,100}$/.test(id))
    return NextResponse.json({error:"Invalid fund ID"},{status:400,headers:noCache});
  try{
    const fund=(await getActiveFunds()).find(x=>x.id===id);
    if(!fund)return NextResponse.json({error:"Fund not found"},{status:404,headers:noCache});
    const sql=getNeonSql();
    const [snapshot,points]=await Promise.all([
      currentPriceSnapshot(sql),readActiveFundPricePoints(sql,[id])
    ]);
    return NextResponse.json({
      fund:{id:fund.id,name:fund.name,provider:fund.provider},
      source:snapshot?{filename:snapshot.source_filename,
        from:String(snapshot.start).slice(0,10),
        to:String(snapshot.end).slice(0,10),
        periods:Number(snapshot.period_count)}:null,
      points:points.map(x=>({date:x.date,label:x.label,returnPct:x.returnPct}))
    },{headers:noCache});
  }catch(error){
    console.error("Monthly price history query failed.",
      error instanceof Error?error.message.slice(0,160):"Unknown error");
    return NextResponse.json({error:"Price history is unavailable."},
      {status:500,headers:noCache});
  }
}

