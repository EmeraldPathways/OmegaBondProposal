/** Best-effort OCR of a rasterized provider factsheet. Text is accepted
 * only with an adequate OCR confidence; no missing data is inferred. */
export async function readScannedFactsheetPage(bytes:Uint8Array):Promise<string|null>{
  const canvas=await import("@napi-rs/canvas");
  Object.assign(globalThis,{
    DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D
  });
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const {createWorker}=await import("tesseract.js");
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),
    useSystemFonts:true,disableFontFace:true,maxImageSize:16_777_216});
  let worker:Awaited<ReturnType<typeof createWorker>>|null=null;
  try{
    const pdf=await task.promise;
    const page=await pdf.getPage(1);
    const viewport=page.getViewport({scale:1.75});
    const image=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({
      viewport,
      canvasContext:image.getContext("2d") as unknown as CanvasRenderingContext2D,
      canvas:image as unknown as HTMLCanvasElement
    }).promise;
    worker=await createWorker("eng");
    const result=await worker.recognize(await image.encode("png"));
    if((result.data.confidence??0)<65)return null;
    return (result.data.text??"").trim()||null;
  }finally{
    if(worker)await worker.terminate().catch(()=>{});
    await task.destroy().catch(()=>{});
  }
}
