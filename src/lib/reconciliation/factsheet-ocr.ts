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
    })¶»§q«^