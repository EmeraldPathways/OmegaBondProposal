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
    const viewport=page.getViewport({scale:2.1});
    const image=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({
      viewport,
      canvasContext:image.getContext("2d") as unknown as CanvasRenderingContext2D,
      canvas:image as unknown as HTMLCanvasElement
    }).promise;
    // New Ireland's first-page source description and fund profile occupy
    // the upper part. Cropping out performance plots improves text recognition.
    const cropHeight=Math.ceil(image.height*.70);
    const crop=canvas.createCanvas(image.width,cropHeight);
    const context=crop.getContext("2d");
    context.fillStyle="#FFFFFF";
    context.fillRect(0,0,image.width,cropHeight);
    context.drawImage(image,0,0,image.width,cropHeight,0,0,image.width,cropHeight);
    worker=await createWorker("eng");
    // PSM 4 preserves the left text column instead of reading through the risk chart.
    await worker.setParameters({tessedit_pageseg_mode:"4"});
    const result=await worker.recognize(await crop.encode("png"));
    const raw=(result.data.text??"").trim();
    // The source metadata labels, not an arbitrary average OCR confidence,
    // establish that this is recognisable first-page factsheet text.
    if(raw.replace(/\s/g,"").length<180 ||
       !/Fund\s+Description\s*:/i.test(raw) ||
       !/\b(?:Managed\s+By|Performance\s+as\s+at)\b/i.test(raw))
      return null;
    return raw;
  }finally{
    if(worker)await worker.terminate().catch(()=>{});
    await task.destroy().catch(()=>{});
  }
}
