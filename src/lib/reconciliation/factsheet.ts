import { extractText, getDocumentProxy } from "unpdf";
import type { FactSheetData } from "./engine";
import { parsePdfPerformance } from "./pdf-performance";

const DATE = /(?:\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b)/i;
function first(pattern:RegExp,text:string):string|null {
  const hit=pattern.exec(text);return hit?.[1]?.replace(/\s+/g," ").trim()||null;
}
function number(pattern:RegExp,text:string):number|null {
  const hit=first(pattern,text);
  if(!hit)return null;
  const n=Number(hit.replace(/[%,]/g,""));return Number.isFinite(n)?n:null;
}
/** A fund description is taken exclusively from the source text or OCR.
 * Clean OCR column headings, never generate descriptive wording. */
export function cleanSourceDescription(raw:string|null,provider:string|null):string|null{
  if(!raw)return null;
  let v=raw.replace(/\s+/g," ").trim();
  if(provider==="New Ireland"){
    v=v.replace(/^Risk\s+Profile\s*:\s*/i,"")
      .replace(/\bSFDR\s+Classification\s*:\s*$/i,"")
      .replace(/\s+(?:Very\s+High|Medium\s+to\s+High|Low\s+to\s+Medium|High|Medium|Low)\s+Risk\s*$/i,"");
  }
  return v.length>=35?v:null;
}
function section(text:string,start:RegExp,end:RegExp,limit=1400):string|null{
  const match=start.exec(text);if(!match)return null;
  const rem=text.slice(match.index+match[0].length);
  const stop=end.exec(rem);
  return rem.slice(0,Math.max(0,Math.min(stop?.index??limit,limit)))
    .replace(/\s+/g," ").trim()||null;
}
function candidates(text:string,start:RegExp,end:RegExp):{name:string;percentage:number}[]{
  const a=start.exec(text);if(!a)return [];
  const rest=text.slice(a.index+a[0].length);
  const finish=end.exec(rest);
  const sample=rest.slice(0,Math.min(finish?.index??3000,3000));
  const results:{name:string;percentage:number}[]=[];
  for(const line of sample.split(/\n/g)){
    const match=/^\s*(?:\d{1,2}\s+)?([A-Za-z][^\d\n]{2,100}?)\s+(\d{1,3}(?:\.\d{1,3})?)\s*%\s*$/.exec(line.trim());
    if(!match)continue;
    const value=Number(match[2]);
    if(value<=100 && !/^(total|source|other\s*return|gross|net)$/i.test(match[1].trim()))
      results.push({name:match[1].trim(),percentage:value});
  }
  return results.slice(0,35);
}
function detectProvider(text:string,filename:string):string|null{
  const intro=text.slice(0,2500).toLowerCase();
  // Classify the issuing provider from the document's content first.
  // The upload filename is at most a provider-folder fallback; never use it
  // to establish the fund identity or selected share class.
  if(/\bzurich life\b|\bzurich\s+fund\s+factsheet\b/.test(intro))return "Zurich";
  if(/\bnew ireland assurance\b|\bnew ireland\b/.test(intro)||
     /\bnew ireland assurance company\b/i.test(text) ||
     /^new\s+ireland(?:[\s_-]|$)/i.test(filename))
    return "New Ireland";
  if(/\bstandard life\b/.test(intro))return "Standard Life";
  if(/\baviva\b/.test(intro))return "Aviva";
  // Some Aviva white-label sheets show only the Aviva-style wrapper and
  // MoneyMate/AMC/CIV fields, with no issuer name in the extracted header.
  if(/\bMoneyMate\s+ID\b/i.test(text) &&
     /\bCIV\s+Charge\b/i.test(text) &&
     /\bAMC\b/i.test(text) &&
     /\bRetirement\s*\|\s*Investments\s*\|\s*Insurance\b/i.test(text))
    return "Aviva";
  const prefix=filename.toLowerCase().split(/\s*[-_]\s*/)[0].trim();
  const known:Record<string,string>={"aviva":"Aviva","zurich":"Zurich","standard life":"Standard Life","new ireland":"New Ireland"};
  if(known[prefix])return known[prefix];
  return null;
}
function titleAviva(text:string):string|null{
  const labelled=first(/Fund Factsheet\s*\n\s*([^\n]{5,125})/i,text)?.replace(DATE,"").trim();
  if(labelled)return labelled;
  // A few source sheets omit "Fund Factsheet" but print a clear fund title
  // and Series designation immediately below the provider's masthead.
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,10);
  const title=lines.find(x=>/\bFund\b/i.test(x) && /\bSeries\s+[A-Za-z0-9]+\b/i.test(x) &&
    DATE.test(x) && !/\bperformance\b/i.test(x));
  return title?.replace(DATE,"").replace(/\s+/g," ").trim()||null;
}
function titleNewIreland(text:string):string|null{
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const idx=lines.findIndex(x=>/^Performance Factsheet$/i.test(x));
  // Provider's official title is immediately ABOVE the "Performance Factsheet" heading.
  if(idx>0 && idx<5 && lines[idx-1].length>2 && lines[idx-1].length<130)return lines[idx-1];
  return null;
}
function titleStandardLife(text:string):string|null{
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  // Standard Life uses a quarterly masthead: Q4, 2026, [title line 1],
  // [title line 2], October 2026. Do not extract the date as the fund title.
  const datePos=lines.findIndex(x=>/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}$/i.test(x));
  if(datePos<2 || datePos>8)return null;
  const before=lines.slice(Math.max(0,datePos-3),datePos).filter(x=>!/^Q[1-4]$/i.test(x)&&!/^20\d{2}$/.test(x));
  if(!before.length)return null;
  const title=before.join(" ").replace(/\s+/g," ").replace(/\s+Fund$/i,"").trim();
  return /standard life|myfolio|vanguard|liquidity/i.test(title)&&title.length>8?title:null;
}
function titleZurich(text:string):string|null{
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const intro=lines.slice(0,52);
  const start=intro.findIndex(x=>/^Fund Description$/i.test(x));
  const firstLines=start>=0?intro.slice(start+1):intro;
  for(const line of firstLines){
    // Examples: "The Cautiously Managed Fund is an" and
    // "5 ★ 5 Americas Fund is an actively".
    const m=/^(?:The\s+)?(.{3,95}?\bFund)\s+(?:is|invests|aims|has|provides)\b/i.exec(line);
    if(m){
      const name=m[1].replace(/★/g,"Star").replace(/\s+/g," ").trim();
      if(!/^(The|a|an|our|your|this|exactly)\b/i.test(name) &&
        !/\b(this|the)\s+fund\b/i.test(name))return name;
    }
  }
  // Repeated standalone fund name often appears before graph/table legends.
  for(const line of lines.slice(0,90)){
    if(line.length>7&&line.length<85&&/ Fund$/i.test(line)&&
      !/^(The|a|an|our|your|this|sector|average|investment|risk) Fund$/i.test(line))
      return line.replace(/★/g,"Star").trim();
  }
  return null;
}
function titleGeneric(text:string,provider:string|null):string|null{
  if(provider==="Aviva")return titleAviva(text);
  if(provider==="Zurich")return titleZurich(text);
  if(provider==="New Ireland")return titleNewIreland(text);
  if(provider==="Standard Life")return titleStandardLife(text);
  const beginning=text.slice(0,2200);
  const name=first(/(?:Fund Name|Fund):\s*([^\r\n]{5,140})/i,beginning);
  return name&&!/^\d|performance|month|year/i.test(name)?name:null;
}
function chartReferences(pages:string[]):FactSheetData["chartReferences"]{
  const out:FactSheetData["chartReferences"]=[];
  const needles=[
    ["Historical growth chart",/growth of\s*[€£$]|growth of investment|growth chart|fund performance graph|past performance chart/i],
    ["Asset allocation chart",/asset mix|asset allocation|assets by type/i],
    ["Geographic allocation chart",/regional allocation|geographic allocation|country exposure/i],
    ["Sector breakdown chart",/sector breakdown|sector allocation/i]
  ] as const;
  for(let i=0;i<pages.length;i++){
    for(const [label,pattern] of needles)if(pattern.test(pages[i]))out.push({page:i+1,label,source:"original_pdf"});
  }
  return out;
}
export function parseFactsheetText(params:{
  importId:string; filename:string; pages:string[];
}):FactSheetData{
  const {importId,filename,pages}=params;
  const text=pages.join("\n");
  const provider=detectProvider(text,filename);
  const title=titleGeneric(pages[0]??"",provider);
  const warnings:string[]=[];
  if(!provider)warnings.push("Provider identity not supported by the document.");
  if(!title)warnings.push("Official fund title not reliably located.");
  if(text.replace(/\s/g,"").length<250)warnings.push("PDF has insufficient extractable text; OCR/manual review may be required.");
  // The archive filename is never used to determine or validate the fund's
  // official name. Provider-specific titles come from PDF page content only.
  const firstPage=pages[0]??"";
  return {
    importId,filename,providerHint:provider,title,metadataVersion:6,
    moneyMateId:first(/MoneyMate\s*ID\s*[:\s]*(\d{5,12})/i,text),
    asOf:provider==="New Ireland"
      ?first(/\bPerformance\s+as\s+at\s+(\d{1,2}\s+[A-Za-z]+\s+20\d{2})\b/i,text)
      :provider==="Zurich"
      ?first(/\bCumulative\s+Performance\s*\(to\s*(\d{1,2}\/\d{1,2}\/20\d{2})\)/i,text)
      :((firstPage.match(DATE)?.[0])??
        (provider==="Standard Life"?first(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\b/i,firstPage):null)),
    launchDate:first(/Fund Launch Date\s*[:\s]*([A-Za-z]{3,9}\s+20\d{2})/i,text),
    baseCurrency:first(/Base Currency\s*[:\s]*([A-Z]{3})/i,text),
    amcPct:number(/\bAMC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i,text)??
      (provider==="Standard Life"?number(/\bAnnual\s+Management\s+Charge\s+(\d+(?:\.\d+)?)\s*%/i,text):null),
    expenseRatioPct:provider==="Standard Life"?
      number(/\bTotal\s+Expense\s+Ratio\s+(\d+(?:\.\d+)?)\s*%/i,text):null,
    civPct:number(/\bCIV\s+Charge\s*:?\s*(\d+(?:\.\d+)?)\s*%/i,text),
    // The Aviva 1–7 graphic is a scale, not an identifiable selected rating;
    // do not derive risk just from the 1 2 3 4 5 6 7 labels.
    riskRating:number(/\bThe Fund has a risk rating of\s+([1-7])\b/i,text)??
      (provider==="Standard Life"?number(/\bVolatility\s+Rating\s*\(\s*1\s*[-–]\s*7\s*\)\s*([1-7])\b/i,text):null)??
      number(/\b(?:SRI|SRRI|Risk rating|Risk indicator)\s*[:=]\s*([1-7])\s*(?:\/\s*7)?\b/i,text),
    // New Ireland publishes named categories (e.g. Low to Medium Risk),
    // not an equivalent provider-confirmed 1–7 numeric score.
    riskProfile:provider==="New Ireland"
      ?(first(/\bRisk\s+Profile\s*:\s*(Low\s+to\s+Medium\s+Risk|Medium\s+to\s+High\s+Risk|Low\s+Risk|Medium\s+Risk|High\s+Risk|Very\s+High\s+Risk|Very\s+Low\s+Risk)\b/i,text) ??
        (()=>{const nearby=section(text,/\bFund\s+Description\s*:/i,/\bManaged\s+By\s*:/i,1900)??"";
          const matches=[...nearby.matchAll(/\b(Low\s+to\s+Medium\s+Risk|Medium\s+to\s+High\s+Risk|Very\s+High\s+Risk|Very\s+Low\s+Risk|High\s+Risk|Medium\s+Risk|Low\s+Risk)\b/gi)];
          return matches.at(-1)?.[1]??null;
        })()):null,
    managedBy:provider==="New Ireland"
      ?section(text,/\bManaged\s+By\s*:\s*/i,/\bStyle\s*:/i,230)
      :provider==="Standard Life"
      ?section(text,/\bFund\s+Manager\(s\)\s*/i,/\bSFDR\s+Product\s+Category\b/i,240)
      :provider==="Zurich"
      ?first(/\bThis\s+fund\s+is\s+managed\s+by\s+(Zurich Life)\b/i,text):null,
    managementStyle:provider==="New Ireland"
      ?section(text,/\bStyle\s*:\s*/i,/\bAsset\s+Mix\s*:/i,230)
      :provider==="Standard Life"
      ?first(/\bInvestment\s+Style\s+(Active|Passive|Blended)\b/i,text):null,
    assetMix:provider==="New Ireland"
      ?section(text,/\bAsset\s+Mix\s*:\s*/i,/\b(?:SFDR(?:\*\s*Classification)?|Tax|Risk\s+Profile)\s*:/i,300):null,
    taxStatus:provider==="New Ireland"?first(/\bTax\s*:\s*(Gross|Net)\b/i,text):null,
    equityRange:provider==="Zurich"
      ?first(/\bIndicative\s+equity\s+range\s*:\s*(\d{1,3}%\s*[-–]\s*\d{1,3}%)/i,text):null,
    sfdrClass:provider==="Zurich"
      ?first(/\bSFDR\s+Class\s+(Article\s+[689])\b/i,text):null,
    objective:provider==="New Ireland"
      ?cleanSourceDescription(
        section(text,/\bFund\s+Description\s*:\s*/i,
          /\b(?:Managed\s+By|Style|Asset\s+Mix)\s*:/i,1600),"New Ireland")
      :provider==="Zurich"
      ?section(text,/\bFund Description\b/i,
          /\bYearly Investment Performance\b|\bFund Performance\b|\bSector Average\b|\bPerformance Table\b/i,1300)
          ?.replace(/^Indicative equity range:\s*\d{1,3}%\s*[-–]\s*\d{1,3}%\s+of the value of the fund\s*/i,"")
          .trim()||null
      :provider==="Standard Life"
      ?section(text,/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i,
          /\bThe value of investments\b|\bFund performance\b/i,1300)
      :section(text,/\bFund Objective\b/i,/\bFund Strategy\b|FUND PERFORMANCE|FUND MANAGER INFORMATION/i),
    strategy:section(text,/\bFund Strategy\b/i,/FUND PERFORMANCE|FUND MANAGER INFORMATION|Annualised Return/i,1800),
    holdings:candidates(text,/\bTop 10 Holdings\b/i,/\bRegional Allocation\b|ASSET MIX|SECTOR BREAKDOWN/i),
    allocations:candidates(text,/\bASSET MIX\b/i,/\bSECTOR BREAKDOWN\b|RISKS\b|CHARGES\b/i),
    chartReferences:chartReferences(pages),
    performance:parsePdfPerformance({provider,title,pages}),
    pageCount:pages.length,
    extractionWarnings:warnings,
    titleEvidence:title?"PDF page 1: "+title:null,
    sourceText:text.slice(0,55000),
    extractionMethod:"pdf_text",
  };
}
export async function extractFundFactsheet(params:{
  importId:string;filename:string;data:Uint8Array;ocrFallback?:boolean
}):Promise<FactSheetData>{
  // Parsing is limited to 12 pages; reject encrypted/oversized documents in caller.
  const doc=await getDocumentProxy(params.data,{maxImageSize:16_777_216});
  try{
    if(doc.numPages>12)throw new Error("Factsheet has more than 12 pages and requires manual review.");
    const extracted=await extractText(doc);
    let pages=Array.isArray(extracted.text)?extracted.text:[extracted.text];
    let ocrUsed=false;
    // Some official New Ireland factsheets contain only rasterized text.
    // Try the actual first-page pixels when the native PDF text is empty.
    if(params.ocrFallback && pages.join("").replace(/\s/g,"").length<220){
      try{
        const {readScannedFactsheetPage}=await import("./factsheet-ocr");
        const recovered=await readScannedFactsheetPage(params.data);
        if(recovered&&recovered.replace(/\s/g,"").length>=180){
          pages=[recovered,...pages.slice(1)];
          ocrUsed=true;
        }
      }catch{
        // OCR is optional; never fill unreadable details from guessed values.
      }
    }
    const parsed=parseFactsheetText({importId:params.importId,filename:params.filename,pages});
    parsed.extractionMethod=ocrUsed?"ocr_first_page":"pdf_text";
    // Zurich writes its description in the left-hand column beside a graph.
    // PDF text extraction can interleave performance-chart ticks and returns.
    if(parsed.providerHint==="Zurich"){
      try{
        const page=await doc.getPage(1);
        const text=await page.getTextContent();
        const width=page.getViewport({scale:1}).width;
        const tokens=text.items.flatMap(item=>{
          if(!("str" in item)||!item.str?.trim()||!item.transform)return[];
          return [{s:String(item.str).trim(),
            x:item.transform[4],y:item.transform[5]}];
        }).filter(t=>t.x>=0&&t.x<width*.40);
        const heading=tokens.find(t=>/^Fund Description$/i.test(t.s));
        if(heading){
          const lines=tokens.filter(t=>t.y<heading.y-8&&t.y>18)
            .sort((a,b)=>b.y-a.y||a.x-b.x)
            .filter(t=>!/^[-+]?\d+(?:\.\d+)?%$/.test(t.s))
            .filter(t=>!/^(?:Nov|Sep|Feb|Jan|May|Aug)\s*\d{2}$/i.test(t.s));
          const left=lines.map(t=>t.s).join(" ");
          const cleaned=left.split(/\b(?:Notes\s*:|Asset\s+Distribution|Sector\s+Average)\b/i)[0]
            .replace(/^\s*(?:(?:-?\d+(?:\.\d+)?%\s*)|(?:Indicative\s+equity\s+(?:range|exposure)[^.!?]{0,115}))+/i,"")
            .replace(/\s+/g," ").trim();
          if(cleaned.length>=45 && /\b(fund|invest|equity|bond|returns)\b/i.test(cleaned))
            parsed.objective=cleaned.slice(0,1300);
        }
      }catch{
        // Keep the ordinary textual extraction when column isolation fails.
      }
    }
    return parsed;
  }finally{
    const disposable=doc as unknown as { destroy?:()=>Promise<void> };
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
}
