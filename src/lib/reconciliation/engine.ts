import type { ApprovedFund } from "@/lib/approved-funds";

export const HORIZONS = ["ytd","oneMonth","threeMonth","sixMonth","oneYear","threeYear","fiveYear","tenYear","sinceLaunch"] as const;
export type ReportedReturns = Record<(typeof HORIZONS)[number],number|null>;

export type WorkbookEntry = { provider:string; sourceName:string; rowNumber:number; returns:ReportedReturns };
export type FactSheetData = {
  importId:string; filename:string; providerHint:string|null; title:string|null; moneyMateId:string|null;
  asOf:string|null; launchDate:string|null; baseCurrency:string|null; amcPct:number|null;
  civPct:number|null; riskRating:number|null; objective:string|null; strategy:string|null;
  holdings:{name:string;percentage:number}[]; allocations:{name:string;percentage:number}[];
  chartReferences:{page:number;label:string;source:"original_pdf"}[];
  pageCount:number; extractionWarnings:string[]; titleEvidence:string|null;
};
export type Review = {
  fundId:string; provider:string; name:string; status:"auto_matched"|"needs_review"|"unmatched";
  score:number; reason:string; workbookRow:WorkbookEntry|null; factsheet:FactSheetData|null;
  alternativeRows:WorkbookEntry[]; alternativeFactsheets:{importId:string;title:string|null;filename:string}[];
};

// Provider-specific short names are used only to find candidates, not to infer a unit class.
const aliases:[RegExp,string][]=[
  [/\bcantor\s+fitz\b/g,"cantor fitzgerald"],
  [/\bmaf\b/g,"multi asset"], [/\bma\b/g,"multi asset"], [/\bact\b/g,"active"],
  [/\bfix\s+alloc\b/g,"fixed allocation"], [/\bser\b/g,"series"],
  [/\beq\b/g,"equity"], [/\bglo\b/g,"global"],
  [/\bemer\s+mar\b/g,"emerging markets"], [/\bexuk\b/g,"ex uk"],
  [/\binvest\b/g,"investment"], [/\bpn\b/g,"pension"], [/\bgr\b/g,"growth"],
  [/\bret\b/g,"return"], [/\btech\b/g,"technology"],
  [/\bbnym\b/g,"bny mellon"], [/\bprudential\b/g,"pru"],
  [/\bnew ireland\b/g,""], [/\bzurich life\b/g,""], [/\bstandard life\b/g,""],
  [/\baviva\b/g,""], [/\bfund\b/g,""], [/\blife\b/g,""],
];
export function normalName(name:string):string{
  let result=name.toLowerCase()
    .replace(/(\d)star\b/g,"$1 star")
    // New Ireland's "(6)" factsheet notation is the S6/Series 6 notation
    // used in its performance workbook. Preserve the class explicitly.
    .replace(/\(\s*([1-9]\d?)\s*\)/g," series $1 ")
    .replace(/\bs([1-9]\d?)\b/g," series $1 ")
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ").trim();
  for(const [pattern,replace] of aliases)result=result.replace(pattern,replace);
  return result.replace(/\b(series\s+\d{1,2})\s+\1\b/g,"$1")
    .replace(/\s+/g," ").trim();
}
export function classSignals(name:string):Set<string>{
  const normalized=" "+normalName(name)+" ";
  const result=new Set<string>();
  for(const match of normalized.matchAll(/\bseries\s+([a-z0-9]+)\b/g))result.add("series:"+match[1]);
  const raw=name.toLowerCase();
  if(/\b(pn|pension)\b/.test(raw))result.add("basis:pension");
  if(/\bgr\b/.test(raw))result.add("basis:growth");
  if(/\bgroup\b/.test(raw))result.add("basis:group");
  return result;
}
/** The published share class must be supported by the named PDF or shortlist. */
function signalsSupported(approved:string,pdfTitle:string,source:string):boolean{
  const named=new Set([...classSignals(approved),...classSignals(pdfTitle)]);
  return [...classSignals(source)].every(signal=>named.has(signal));
}
function tokens(name:string):Set<string>{return new Set(normalName(name).split(" ").filter(t=>t.length>1));}
function bigrams(name:string):Set<string>{
  const str=normalName(name).replace(/\s/g,"");
  return new Set(Array.from({length:Math.max(0,str.length-1)},(_,i)=>str.slice(i,i+2)));
}
export function similarity(approvedName:string,sourceName:string):number{
  const a=normalName(approvedName),b=normalName(sourceName);
  if(!a||!b)return 0;
  const numsA:string[]=a.match(/\d+/g)??[],numsB:string[]=b.match(/\d+/g)??[];
  // An ESG 80 factsheet must never be offered for ESG 60; the same applies
  // to Prisma levels and numbered Goodbody series.
  if(numsA.length&&numsB.length &&
    numsA.some(n=>!numsB.includes(n)) &&
    numsB.some(n=>!numsA.includes(n)))return 0;
  if(a===b)return 1;
  const x=tokens(approvedName),y=tokens(sourceName);
  const shared=[...x].filter(t=>y.has(t)).length;
  const jaccard=shared/Math.max(1,x.size+y.size-shared);
  const bx=bigrams(approvedName),by=bigrams(sourceName);
  const both=[...bx].filter(t=>by.has(t)).length;
  const dice=2*both/Math.max(1,bx.size+by.size);
  const contains=a.includes(b)||b.includes(a);
  let score=.62*jaccard+.38*dice+(contains?.07:0);
  const sigA=classSignals(approvedName),sigB=classSignals(sourceName);
  for(const pref of ["series:","class:"]){
    const aa=[...sigA].filter(t=>t.startsWith(pref)),bb=[...sigB].filter(t=>t.startsWith(pref));
    if(aa.length&&bb.length&&!aa.some(t=>bb.includes(t)))score-=.5;
  }
  if(sigA.has("basis:pension")&&!sigB.has("basis:pension"))score-=.13;
  return Math.max(0,Math.min(1,score));
}
function isClassConsistent(a:string,b:string):boolean{
  const x=classSignals(a),y=classSignals(b);
  for(const p of ["series:","class:"]){
    const aa=[...x].filter(t=>t.startsWith(p)),bb=[...y].filter(t=>t.startsWith(p));
    if(aa.length&&bb.length&&!aa.some(v=>bb.includes(v)))return false;
  }
  if(x.has("basis:pension")&&!y.has("basis:pension"))return false;
  return true;
}
function rank<T>(items:T[],getName:(v:T)=>string,target:string){
  return items.map(item=>({item,score:similarity(target,getName(item))}))
    .filter(x=>x.score>=.34).sort((a,b)=>b.score-a.score);
}
export function reconcileOne(fund:ApprovedFund,rows:WorkbookEntry[],factsheets:FactSheetData[]):Review{
  const providerRows=rows.filter(r=>r.provider===fund.provider);
  const providerFacts=factsheets.filter(f=>f.providerHint===fund.provider);

  const rankedFacts=rank(providerFacts,f=>f.title??f.filename,fund.name);
  const topFact=rankedFacts[0];
  const exactFact=Boolean(topFact?.item.title &&
    normalName(topFact.item.title)===normalName(fund.name));
  const exactFactCount=rankedFacts.filter(x=>x.item.title &&
    normalName(x.item.title)===normalName(fund.name)).length;
  const factUnique=exactFact ? exactFactCount===1 :
    rankedFacts.length===1 || (topFact && rankedFacts[1] && topFact.score-rankedFacts[1].score>=.10);
  const factClear=Boolean(topFact && topFact.score>=.74 && factUnique &&
    topFact.item.title && !topFact.item.extractionWarnings.some(w=>w.toLowerCase().includes("contradiction")));

  const target=factClear ? topFact.item.title! : fund.name;
  const candidates=rank(providerRows,r=>r.sourceName,target);
  const best=candidates[0];
  const exactRow=Boolean(best&&normalName(target)===normalName(best.item.sourceName));
  const duplicateExactRows=exactRow?
    candidates.filter(c=>normalName(c.item.sourceName)===normalName(target)).length:0;
  const runner=candidates[1];
  const rowUnique=exactRow ? duplicateExactRows===1 :
    candidates.length===1 || Boolean(best&&runner&&best.score-runner.score>=.11);
  const classConsistent=Boolean(best &&
    isClassConsistent(fund.name,best.item.sourceName) &&
    (!factClear||isClassConsistent(topFact.item.title!,best.item.sourceName)));
  const classDocumented=Boolean(best&&factClear&&
    signalsSupported(fund.name,topFact.item.title!,best.item.sourceName));
  const rowClear=Boolean(best && best.score>=.80 && rowUnique && classConsistent);
  const titleAgreement=Boolean(factClear && best &&
    normalName(topFact.item.title!)===normalName(best.item.sourceName));
  // Only corroborated series identities auto-match; reporting dates, return
  // basis and charges still need separate verification before client use.
  const auto=Boolean(titleAgreement && rowClear && classDocumented &&
    best!.score>=.84 && topFact!.score>=.74);

  const status:Review["status"]=auto?"auto_matched":
    (topFact||best)?"needs_review":"unmatched";
  const reason=auto?
    "Unique PDF title and workbook series agree, with documented class. Identity matched; published return basis and as-of date remain unapproved.":
    !topFact?"No matching factsheet title was found in the uploaded documents.":
    !factClear?"Factsheet identity is ambiguous, has a conflicting filename, or requires manual verification.":
    !best?"No plausible reported-performance row was found.":
    !classConsistent?"Published series/share class conflicts with the factsheet or shortlist.":
    !classDocumented?"Workbook identifies a share class not established by the factsheet or shortlist.":
    !rowUnique?"More than one plausible performance series remains; no automatic assignment.":
    "Document and workbook titles differ or require additional corroboration.";

  return {
    fundId:fund.id,provider:fund.provider,name:fund.name,status,
    score:Math.round(1000*Math.min(best?.score??0,topFact?.score??0))/1000,
    reason,
    // Tentative candidate only. Never treat it as an approved source record.
    workbookRow:best&&best.score>=.60?best.item:null,
    factsheet:topFact?.item??null,
    alternativeRows:candidates.slice(0,5).map(v=>v.item),
    alternativeFactsheets:rankedFacts.slice(0,5).map(v=>({
      importId:v.item.importId,title:v.item.title,filename:v.item.filename
    })),
  };
}
