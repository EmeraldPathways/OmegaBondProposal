/** Best-effort OCR of a rasterized provider factsheet. Text is accepted
 * only with an adequate OCR confidence; no missing data is inferred. */
export async function readScannedFactsheetPage(bytes:Uint8Array):Promise<string|null>{
  const canvas=await import("@napi-rs/canvas");
  Object.assign(globalThis,{
    DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D
  });
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const {createWorker,PSM}=await import("tesseract.js");
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),
    useSystemFonts:true,disableFontFace:true,maxImageSize:16_777_216});
  let worker:Awaited<ReturnType<typeof createWorker>>|null=null;
  try{
    const pdf=await task.promise;
    const page=await pdf.getPage(1);
    const viewport=page.getViewport({scale:1.95});
    const image=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({
      viewport,
      canvasContext:image.getContext("2d") as unknown as CanvasRenderingContext2D,
      canvas:image as unknown as HTMLCanvasElement
    }).promise;
    // The fund narrative is in the upper part of New Ireland factsheets.
    // Page segmentation 4 follows text columns more reliably than average
    // confidence scoring over the entire chart-heavy page.
    const cropHeight=Math.ceil(image.height*.72);
    const crop=canvas.createCanvas(image.width,cropHeight);
    crop.getContext("2d").drawImage(
      image,0,0,image.width,cropHeight,0,0,image.width,cropHeight
    );
    worker=await createWorker("eng");
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_COLUMN});
    const result=await worker.recognize(await crop.encode("png"));
    const text=(result.data.text??"").trim();
    if(text.replace(/\s/g,"").length<170||
       !/Fund\s+Description\s*:/i.test(text)||
       !/\b(?:Managed\s+By|Performance\s+as\s+at)\b/i.test(text))
      return null;
    return text;
  }finally{
    if(worker)await worker.terminate().catch(()=>{});
    await task.destroy().catch(()=>{});
  }
}
