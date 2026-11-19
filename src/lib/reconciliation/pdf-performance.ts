import type { ReportedReturns } from "./engine";

export type ReturnKind="period"|"annualised"|"not_reported";
export type PdfPerformanceStatus="extracted"|"not_published"|"needs_review";
export type PdfPerformance={
  source:"official_factsheet_pdf";
  status:PdfPerformanceStatus;
  asOf:string|null;
  asOfPrecision:"day"|"month"|"unknown";
  feeBasis:"gross_of_amc"|"net_of_amc"|"net_of_ter"|"before_full_policy_amc"|"not_stated";
  returns:ReportedReturns;
  cumulativeReturns:Partial<ReportedReturns>;
  returnKinds:Record<keyof ReportedReturns,ReturnKind>;
  calendarYearReturns:Record<string,number|null>;
  titleInReturnTable:string|null;
  page:number|null;
  evidenceHeading:string|null;
  notes:string[];
};
const emptyReturns=():ReportedReturns=>({
  ytd:null,oneMonth:null,threeMonth:null,sixMonth:null,
  oneYear:null,threeYear:null,fiveYear:null,tenYear:null,sinceLaunch:null
});
const NVAL=/^(?:[+-]?\d+(?:\.\d+)?%?|--|—|–|-|N\/A|NR)$/i;
function cells(line:string,size:number,requirePercent:boolean):Array<number|null>|null{
  const tokens=line.trim().split(/\s+/).filter(x=>NVAL.test(x));
  const values=tokens.slice(-size);
  if(values.length!==size)return null;
  if(requirePercent && !values.some(v=>v.includes("%")))return null;
  return values.map(v=>{
    if(/^(--|—|–|-|N\/A|NR)$/i.test(v))return null;
    const n=Number(v.replace("%",""));
    return Number.isFinite(n)&&Math.abs(n)<=10000?n:null;
  });
}
const linesOf=(pages:string[])=>pages.join("\n").split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
const pageNumber=(pages:string[],needle:string):number|null=>{
  const n=pages.findIndex(x=>x.includes(needle));
  return n===-1?null:n+1;
};
function nextValues(lines:string[],idx:number,size:number,requirePercent:boolean):Array<number|null>|null{
  if(idx<0)return null;
  // Most provider tables are one line. Standard Life has one or two name
  // lines before the numeric row, which may not contain percentage symbols.
  for(let n=idx+1;n<=Math.min(lines.length-1,idx+5);n++){
    const l=lines[n];
    if(/^(Source:|Sector Average|Calendar Year|Annualised Performance|Cumulative Performance|Growth of)/i.test(l))break;
    const result=cells(l,size,requirePercent);
    if(result && result.some(v=>v!==null))return result;
  }
  return null;
}
function set(
  dest:Partial<ReportedReturns>,vals:Array<number|null>|null,
  keys:(keyof ReportedReturns)[]
){if(!vals)return;keys.forEach((key,index)=>{dest[key]=vals[index]??null})}
function calendarReturns(lines:string[],marker:RegExp,years=5):Record<string,number|null>{
  const index=lines.findIndex(x=>marker.test(x));
  if(index<0)return {};
  const headings=(lines[index+1]??"").match(/\b20\d{2}\b/g)?.slice(0,years)??[];
  if(!headings.length)return {};
  const vals=nextValues(lines,index+1,headings.length,true);
  return vals?Object.fromEntries(headings.map((year,i)=>[year,vals[i]])):{};
}
const headerTitle=(header:string)=>header.split(/\s+[–—-]\s+/).slice(1).join(" – ").trim()||null;
export function parsePdfPerformance(params:{
  provider:string|null; title:string|null; pages:string[];
}):PdfPerformance{
  const {provider,title,pages}=params;
  const lines=linesOf(pages);
  const joined=lines.join("\n");
  const returns=emptyReturns();
  const cumulativeReturns:Partial<ReportedReturns>={};
  const notes:string[]=[];
  let asOf:string|null=null;
  let asOfPrecision:PdfPerformance["asOfPrecision"]="unknown";
  let tableTitle:string|null=null;
  let heading:string|null=null;
  let page:number|null=null;
  let feeBasis:PdfPerformance["feeBasis"]="not_stated";
  if(provider==="Aviva"){
    const idx=lines.findIndex(x=>/^Annualised Return to\s+\d{1,2}\s+\w+\s+20\d{2}\s*[–—-]/i.test(x));
    if(idx>=0){
      heading=lines[idx];tableTitle=headerTitle(heading);
      const date=/Annualised Return to\s+(\d{1,2}\s+\w+\s+20\d{2})/i.exec(heading);
      asOf=date?.[1]??null;asOfPrecision=asOf?"day":"unknown";
      const values=nextValues(lines,idx+1,7,true);
      set(returns,values,["oneMonth","threeMonth","ytd","oneYear","threeYear","fiveYear","tenYear"]);
      page=pageNumber(pages,lines[idx]);
    }
    feeBasis=/\bnet of\s+AMC\b/i.test(joined)?"net_of_amc":
      /\bgross of\s+AMC\b/i.test(joined)?"gross_of_amc":"not_stated";
  } else if(provider==="Zurich"){
    const cumulativeIndex=lines.findIndex(x=>/^Cumulative Performance \(to\s+\d{2}\/\d{2}\/20\d{2}\)/i.test(x));
    const annualIndex=lines.findIndex(x=>/^Annualised Performance \(to\s+\d{2}\/\d{2}\/20\d{2}\)/i.test(x));
    const cumulative=cumulativeIndex>=0?nextValues(lines,cumulativeIndex+1,5,true):null;
    const annual=annualIndex>=0?nextValues(lines,annualIndex+1,4,true):null;
    set(returns,cumulative,["threeMonth","sixMonth","oneYear","threeYear","fiveYear"]);
    if(cumulative)set(cumulativeReturns,cumulative,["threeMonth","sixMonth","oneYear","threeYear","fiveYear"]);
    // For 3/5 years, use the PDF's ANNUALISED table, not its cumulative return.
    returns.threeYear=null;returns.fiveYear=null;
    set(returns,annual,["threeYear","fiveYear","tenYear","sinceLaunch"]);
    const h=lines[annualIndex]??lines[cumulativeIndex]??"";
    heading=h||null;
    asOf=/\b(\d{2}\/\d{2}\/20\d{2})\b/.exec(h)?.[1]??null;
    asOfPrecision=asOf?"day":"unknown";
    page=heading?pageNumber(pages,heading):null;
    feeBasis=/before\s+the\s+full\s+AMC/i.test(joined)?"before_full_policy_amc":"not_stated";
    if(cumulativeIndex>=0 && annualIndex<0)notes.push("Annualised 3/5/10-year table not located; cumulative figures have not been substituted.");
  } else if(provider==="New Ireland"){
    const cumIdx=lines.findIndex(x=>/^Cumulative\s+1Mth\s+3Mth\s+YTD\s+1Yr/i.test(x));
    const annIdx=lines.findIndex(x=>/^Annualised\s+1Mth\s+3Mth\s+YTD\s+1Yr/i.test(x));
    const cumulative=cumIdx>=0?nextValues(lines,cumIdx,7,true):null;
    const annual=annIdx>=0?nextValues(lines,annIdx,7,true):null;
    if(cumulative)set(cumulativeReturns,cumulative,["oneMonth","threeMonth","ytd","oneYear","threeYear","fiveYear","tenYear"]);
    set(returns,cumulative,["oneMonth","threeMonth","ytd","oneYear","threeYear","fiveYear","tenYear"]);
    returns.threeYear=null;returns.fiveYear=null;returns.tenYear=null;
    if(annual){
      returns.threeYear=annual[4]??null;
      returns.fiveYear=annual[5]??null;
      returns.tenYear=annual[6]??null;
    }
    heading=lines[annIdx]??lines[cumIdx]??null;
    page=heading?pageNumber(pages,heading):null;
    const ending=/Fund Performance from\s+\d{2}-\d{2}-\d{4}\s+to\s+(\d{2}-\d{2}-20\d{2})/i.exec(joined);
    asOf=ending?.[1]??null;
    asOfPrecision=asOf?"day":"unknown";
    if(cumulative&&!annual)notes.push("Annualised period table not located; 3/5/10-year values withheld.");
  } else if(provider==="Standard Life"){
    const annualIdx=lines.findIndex(x=>/^Annualised Performance$/i.test(x));
    const values=annualIdx>=0?nextValues(lines,annualIdx+1,7,false):null;
    set(returns,values,["oneMonth","threeMonth","ytd","oneYear","threeYear","fiveYear","sinceLaunch"]);
    heading=annualIdx>=0?lines[annualIdx]:null;
    page=heading?pageNumber(pages,heading):null;
    // The publication gives a reporting MONTH on page 1; a separate
    // performance-chart date must not be silently treated as the table date.
    asOf=/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\b/i.exec(pages[0]??"")?.[1]??null;
    asOfPrecision=asOf?"month":"unknown";
    if(asOf)notes.push("Reporting month from PDF masthead; no exact daily as-of date stated for the annualised table.");
    feeBasis=/net of the fund.s Total Expense Ratio/i.test(joined)?"net_of_ter":"not_stated";
  } else {
    notes.push("No supported provider-specific table layout.");
  }
  const found=Object.values(returns).filter(v=>v!==null).length;
  if(!found)notes.push("No defensible numeric performance table extracted. Original PDF retained for review.");
  if(found&&!asOf)notes.push("No clearly identified performance reporting date.");
  if(!title)notes.push("Official title not identified; do not assign performance to a shortlisted fund.");
  if(provider==="Aviva" && tableTitle && title){
    const normal=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
    if(normal(tableTitle)!==normal(title))notes.push("Fund title in returns heading differs from PDF title; verify before use.");
  }
  const returnKinds=Object.fromEntries(
    Object.keys(returns).map(key=>[key,returns[key as keyof ReportedReturns]==null?
      "not_reported":(["threeYear","fiveYear","tenYear","sinceLaunch"].includes(key)?"annualised":"period")])
  ) as Record<keyof ReportedReturns,ReturnKind>;
  const status:PdfPerformanceStatus=!found?"not_published":
    !asOf||(provider==="Aviva"&&notes.some(n=>n.includes("differs")))?"needs_review":"extracted";
  return {
    source:"official_factsheet_pdf",status,asOf,asOfPrecision,feeBasis,
    returns,cumulativeReturns,returnKinds,calendarYearReturns:
      provider==="Aviva"?calendarReturns(lines,/^Calendar Year Return\s+[–—-]/i):
      provider==="New Ireland"?calendarReturns(lines,/^Calendar Year\s+2025/i,7):{},
    titleInReturnTable:tableTitle,page,evidenceHeading:heading,notes
  };
}
