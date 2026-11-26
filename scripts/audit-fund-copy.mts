/** Read-only production check of print-ready narrative coverage for 107 funds.
 * Does not expose source excerpts, modify the database or designate copy approved.
 */
import {neon} from "@neondatabase/serverless";
import {fundCardNarrative,completeSourceSentences}
  from "../src/lib/pdf/fund-detail-layout.ts";
import type {FactSheetData} from "../src/lib/reconciliation/engine.ts";

const tag="[Omega fund copy audit]";
if(process.env.VERCEL_ENV!=="production"||!process.env.DATABASE_URL){
  console.log(tag,"Skipped outside configured production build.");
}else{
  try{
    const sql=neon(process.env.DATABASE_URL);
    const rows=await sql.query(
      "SELECT n.fund_id::text AS fund_id,n.provider,n.name,"+
      "s.status AS source_status,s.data AS source_data "+
      "FROM fund_active_names n "+
      "LEFT JOIN fund_reconciliations r ON r.fund_id=n.fund_id "+
      "LEFT JOIN fund_source_factsheets s ON s.import_id=r.factsheet_import_id "+
      "ORDER BY n.provider,n.name"
    );
    let descriptions=0,risks=0,omittedSections=0,missingSources=0;
    const review:string[]=[];
    const providerCounts:Record<string,{total:number;description:number;review:number}>={};
    for(const row of rows){
      const provider=String(row.provider),name=String(row.name);
      const item=providerCounts[provider]??{total:0,description:0,review:0};
      providerCounts[provider]=item;item.total++;
      const data=(row.source_status==="parsed"?
        row.source_data:null) as FactSheetData|null;
      if(!data){missingSources++;item.review++;review.push(provider+": "+name+" (no current parsed source)");continue;}
      const chosen=fundCardNarrative(data);
      const desc=chosen.find(x=>x.label==="Fund description");
      const hasDescription=!!desc&&desc.text!=="Information unavailable.";
      if(hasDescription){descriptions++;item.description++;}
      if(chosen.some(x=>x.label==="Key risks"||x.label==="Risk information"))risks++;
      const fields=[data.objective,data.description,data.strategy,data.riskDisclosure,
        data.chargesDisclosure].filter((x):x is string=>typeof x==="string"&&x.trim().length>0);
      const skipped=fields.filter(value=>!completeSourceSentences(value,58)).length;
      omittedSections+=skipped;
      if(!hasDescription||skipped){
        item.review++;
        review.push(provider+": "+name+" ("+
          (!hasDescription?"no concise complete description":"")+
          (skipped?(hasDescription?" / ":"")+"source phrases need editorial review: "+skipped:"")+")");
      }
    }
    console.log(tag,"Registered="+rows.length+
      " conciseDescriptions="+descriptions+
      " riskSections="+risks+
      " missingParsedSources="+missingSources+
      " unfitSourcePhrases="+omittedSections+
      " fundsForEditorialReview="+review.length);
    console.log(tag,"By provider="+JSON.stringify(providerCounts));
    if(review.length)console.log(tag,"Example review queue="+review.slice(0,20).join(" | "));
    console.log(tag,"Note: source-backed candidate text is NOT manually approved.");
  }catch(error){
    console.log(tag,"UNAVAILABLE: "+(error instanceof Error?error.name:"audit failure"));
  }
}
