import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {getDocumentProxy,extractText} from "unpdf";
if(process.env.VERCEL_ENV!=="production")process.exit(0);
const sql=neon(process.env.DATABASE_URL);
const names=[
 ["Aviva","High Yield Equity Fund Series 1"],
 ["Zurich","Prisma 5 Fund"],
 ["Standard Life","Standard Life Ireland MyFolio Market IV"],
 ["Standard Life","Standard Life Vanguard Global Stock Index"],
 ["New Ireland","PruFund Cautious"]
];
const files=await sql.query("SELECT i.storage_key,f.data FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id WHERE f.status='parsed'");
for(const [provider,name] of names){
 const item=files.find(r=>r.data?.providerHint===provider && r.data?.title===name);
 if(!item)continue;
 const res=await get(String(item.storage_key),{access:"private"});
 const doc=await getDocumentProxy(new Uint8Array(await new Response(res.stream).arrayBuffer()));
 const out=await extractText(doc);
 const lines=(Array.isArray(out.text)?out.text.join("\n"):out.text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let first=lines.findIndex(x=>/^(Fund Performance \*|Fund Performance|Cumulative Performance|Annualised Return to|Annualised Performance|Cumulative 1Mth)/i.test(x));
 if(first<0) first=Math.max(0,lines.findIndex(x=>/Annualised/i.test(x))-6);
 const section=lines.slice(first,Math.min(lines.length,first+62));
 for(let i=0;i<section.length;i+=10){
  console.log("OMEGA_PDF_TABLE",JSON.stringify({provider,title:name,at:first+i,lines:section.slice(i,i+10)}));
 }
 try{await doc.destroy()}catch{}
}
