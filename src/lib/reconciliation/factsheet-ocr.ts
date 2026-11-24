import "server-only";
import {existsSync} from "node:fs";
import {dirname,join} from "node:path";

/** OCR of the first page of a scanned provider factsheet.
 * The English model is bundled with the app: never download OCR data at request
 * time, and never infer information that is not visible in source pixels. */
export async function readScannedFactsheetPage(bytes:Uint8Array):Promise<string|null>{
  const canvas=await import("@napi-rs/canvas");
  Object.assign(globalThis,{
    DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D
  });
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const {createWorker,PSM}=await import("tesseract.js");
  const model=join(process.cwd(),"node_modules","@tesseract.js-data",
    "eng","4.0.0_best_int","eng.traineddata.gz");
  if(!existsSync(model))
    throw new Error("Bundled English OCR language model was not included in the deployment.");
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),
    useSystemFonts:true,disableFontFace:true,maxImageSize:16_777_216});
  let worker:Awaited<ReturnType<typeof createWorker>>|null=null;
  try{
    const pdf=await task.promise;
    const page=await pdf.getPage(1);
    const viewport=page.getViewport({scale:2.1});
    const image=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({
      viewport,
      canvasContext:image.getContext("2d") as unknown as CanvasRenderingContext2D,
      canvas:image as unknown as HTMLCanvasElement
    }).promise;
    // New Ireland's heading/narrative block sits above the performance charts.
    // Separate columns to avoid mixing the Fund Description with Risk Profile.
    const zone=(x:number,y:number,w:number,h:number)=>{
      const width=Math.max(1,Math.round(image.width*w));
      const height=Math.max(1,Math.round(image.height*h));
      const crop=canvas.createCanvas(width,height);
      crop.getContext("2d").drawImage(image,
        Math.round(image.width*x),Math.round(image.height*y),width,height,
        0,0,width,height);
      return crop.encode("png");
    };
    worker=await createWorker("eng",1,{
      langPath:dirname(model),cacheMethod:"none"
    });
    const read=async(png:Uint8Array,mode:typeof PSM[keyof typeof PSM])=>{
      await worker!.setParameters({tessedit_pageseg_mode:mode});
      const result=await worker!.recognize(png);
      return result.data.text?.replace(/\u00a0/g," ").trim()??"";
    };
    const full=await read(await zone(0,0,1,.76),PSM.AUTO);
    const hasDescription=(s:string)=>/\bFund\s+Descrip(?:tion|t[i1]on|ton)\s*[:.]?/i.test(s);
    const hasDetail=(s:string)=>/\b(?:Managed\s+By|Style\s*:|Asset\s+Mix|Performance\s+as\s+at)\b/i.test(s);
    const adequate=(s:string)=>s.replace(/\s/g,"").length>=130;
    // One pass is often sufficient for modern image-only PDFs.
    if(adequate(full)&&hasDescription(full)&&hasDetail(full))return full;
    const left=await read(await zone(0,0,.65,.77),PSM.SINGLE_COLUMN);
    // Prefer the left-column narrative if the full-page pass scrambled columns.
    const main=hasDescription(left)&&adequate(left)?left:full;
    if(adequate(main)&&hasDescription(main)&&hasDetail(main))return main;
    const right=await read(await zone(.48,0,.52,.77),PSM.SINGLE_COLUMN);
    const combined=main+"\n"+right;
    // Keep a moderately legible OCR result for downstream field-level parsing
    // even when labels were not recognized exactly. Auditing flags missing fields.
    if(adequate(combined)&&
       (hasDescription(combined)||/\bPerformance\s+Factsheet\b/i.test(combined)))
      return combined;
    return null;
  }finally{
    if(worker)await worker.terminate().catch(()=>{});
    await task.destroy().catch(()=>{});
  }
}
