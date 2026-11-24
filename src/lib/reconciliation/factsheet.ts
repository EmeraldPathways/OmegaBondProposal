import { extractText, getDocumentProxy } from "unpdf";
import type { FactSheetData } from "./engine";
import { parsePdfPerformance } from "./pdf-performance";
import {extractFundContent,CONTENT_METADATA_VERSION} from "./factsheet-content";

const DATE = /(?:\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b)/i;
function first(pattern:RegExp,text:string):string|null {
  const hit=pattern.exec(text);return hit?.[1]?.replace(/\s+/g," ").trim()||null;
}
function number(pattern:RegExp,text:string):number|null {
  const hit=first(pattern,text);
  if(!hit)return null;
  const n=Number(hit.replace(/[%,]/g,""));return Number.isFinite(n)?n:null;
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
    const match=/^\s*(?:\d{1,2}\s+)?([A¶»§q«^