import {neon} from "@neondatabase/serverless";
import {get} from "@vercel/blob";
import {createWorker} from "tesseract.js";
import {createCanvas,DOMMatrix,ImageData,Path2D} from "@napi-rs/canvas";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
if(process.env.VERCEL_ENV!=="production"){console.log("OMEGA_OCR_TEST_SKIP");process.exit(0);}
globalThis.DOMMatrix=DOMMatrix;globalThis.ImageData=ImageData;globalThis.Path2D=Path2D;
const sql=neon(process.env.DATABASE_URL);
const found=await sql.query("SELECT i.filename,i.storage_key,f.data FROM fund_source_factsheets f JOIN imports i ON i.id=f.import_id WHERE f.status='parsed' AND f.data->>'title' IS NULL AND i.filename ILIKE '%Ethical Managed%' LIMIT 1");
if(!found.length){console.log("OMEGA_OCR_TEST_NO_DOCUMENT");process.exit(0);}
const source=await get(String(found[0].storage_key),{access:"private"});
if(!source||source.statusCode!==200)throw new Error("Private source could not be read.");
const raw=new Uint8Array(await new Response(source.stream).arrayBuffer());
const task=getDocument({data:raw,useSystemFonts:true,disableFontFace:true});
const pdf=await task.promise;
const page=await pdf.getPage(1);const viewport=page.getViewport({scale:2.1});
const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
await page.render({canvasContext:canvas.getContext("2d"),viewport,canvas}).promise;
const png=await canvas.encode("png");
const worker=await createWorker("eng");
try{
 const result=await worker.recognize(png);
 const lines=result.data.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 console.log("OMEGA_OCR_TEST_RESULT",JSON.stringify({
  filename:String(found[0].filename),pageCount:pdf.numPages,
  confidence:Math.round(result.data.confidence),imageBytes:png.length,
  leadingLines:lines.slice(0,16).map(s=>s.slice(0,100))
 }));
}finally{await worker.terminate();await task.destroy();}
