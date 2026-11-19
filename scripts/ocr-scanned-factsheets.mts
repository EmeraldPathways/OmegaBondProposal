/**
 * One-time recovery of fund identities in scanned, image-only factsheets.
 *
 * The original private PDFs remain unchanged. The OCR text is processed
 * locally inside the authorised Vercel production build. Only a candidate
 * fund title and confidence are persisted, not fabricated returns/charges.
 */
import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {createWorker} from "tesseract.js";
import {createCanvas,DOMMatrix,ImageData,Path2D} from "@napi-rs/canvas";
import {APPROVED_FUNDS} from "../src/lib/approved-funds.ts";
import {ocrTitleFromPage} from "../src/lib/reconciliation/ocr-title.ts";

const log=(kind:string,value:object)=>console.log("OMEGA_SCANNED_OCR_"+kind,JSON.stringify(value));
if(process.env.VERCEL_ENV!=="production"){log("SKIP",{environment:"nonproduction"});process.exit(0);}
if(!process.env.DATABASE_URL||!process.env.BLOB_STORE_ID)throw new Error("Private production storage unavailable.");

globalThis.DOMMatrix=DOMMatrix;globalThis.ImageData=ImageData;globalThis.Path2D=Path2D;
const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
const sql=neon(process.env.DATABASE_URL);
const sources=await sql.query(
  "SELECT f.import_id::text,i.storage_key,f.data FROM fund_source_factsheets f "+
  "JOIN imports i ON i.id=f.import_id "+
  "WHERE f.status='parsed' AND (f.data->>'title' IS NULL OR f.data->>'title'='') "+
  "ORDER BY f.processed_at"
);
log("INVENTORY",{unresolvedPdfTitles:sources.length});
if(sources.length>35)throw new Error("Unexpected number of unreadable PDF identities; no batch changes applied.");
let inspected=0,recognized=0,skippedText=0,skippedLowConfidence=0,failed=0;
let worker=null;
try{
  for(const item of sources){
    const prior=item.data;
    if(!prior||typeof prior!=="object")continue;
    let task=null;
    try{
      const response=await get(String(item.storage_key),{access:"private"});
      if(!response||response.statusCode!==200)throw new Error("Private PDF retrieval failed.");
      const buffer=new Uint8Array(await new Response(response.stream).arrayBuffer());
      if(buffer.length<6||buffer.length>3_500_000)throw new Error("Source size outside approved bounds.");
      task=getDocument({data:buffer,useSystemFonts:true,disableFontFace:true});
      const pdf=await task.promise;
      const page=await pdf.getPage(1);
      const layer=await page.getTextContent();
      const text=layer.items.map(x=>x&&typeof x==="object"&&"str" in x?String(x.str):"").join(" ");
      // This is an OCR fallback, not an alternative to the existing text parser.
      if(text.replace(/\s/g,"").length>100){skippedText++;continue;}
      const viewport=page.getViewport({scale:2.05});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      const rendered=page.render({canvasContext:canvas.getContext("2d"),viewport,canvas});
      await rendered.promise;
      if(!worker)worker=await createWorker("eng");
      const result=await worker.recognize(await canvas.encode("png"));
      const ocrText=result.data.text??"";
      const provider=String(prior.providerHint??"");
      // Validate the issuer from observed PDF pixels, not the upload filename.
      const issuerVisible=provider==="New Ireland"?/new\s+ireland/i.test(ocrText):
        provider==="Zurich"?/zurich/i.test(ocrText):
        provider==="Standard Life"?/standard\s+life/i.test(ocrText):
        provider==="Aviva"?/aviva/i.test(ocrText):false;
      const evidence=issuerVisible?
        ocrTitleFromPage(ocrText,provider,APPROVED_FUNDS,result.data.confidence):null;
      if(!evidence){skippedLowConfidence++;continue;}
      const updated={
        ...prior,
        title:evidence.title,
        titleEvidence:evidence.proof,
        ocrIdentity:{engine:"tesseract.js",page:1,confidence:evidence.confidence,
          nameSimilarity:evidence.score,requiresCorroboration:true},
        extractionWarnings:[
          ...(Array.isArray(prior.extractionWarnings)?
            prior.extractionWarnings.filter(x=>!String(x).includes("Official fund title not reliably located.")):[]),
          "OCR recovered only the title. Financial figures must be verified from original PDF."
        ]
      };
      // The OCR source is advisory; preserve all original files and audit metadata.
      await sql.query(
        "UPDATE fund_source_factsheets SET data=$2::jsonb,processed_at=now() WHERE import_id=$1::uuid",
        [item.import_id,JSON.stringify(updated)]
      );
      recognized++;
      log("TITLE",{provider,matchedName:evidence.title,
        ocrConfidence:evidence.confidence,nameSimilarity:evidence.score});
    }catch(e){
      failed++;
      log("ITEM_ERROR",{errorType:e instanceof Error?e.name:"Unknown",message:String(e instanceof Error?e.message:e).slice(0,110)});
    }finally{
      inspected++;
      if(task)await task.destroy().catch(()=>{});
    }
  }
}finally{if(worker)await worker.terminate();}
log("COMPLETE",{unresolvedSources:sources.length,inspected,recognized,skippedText,skippedLowConfidence,failed});
