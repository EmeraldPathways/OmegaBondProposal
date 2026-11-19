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
  let result=name.toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  for(const [pattern,replace] of aliases)result=result.replace(pattern,replace);
  return result.replace(/\s+/g," ").trim();
}
export function classSignals(name:string):Set<string>{
  const s=" "+normalName(name)+" ";
  const result=new Set<string>();
  for(const match of s.matchAll(/\bseries\s+([a-z0-9]+)\b/g))result.add("series:"+match[1]);
  for(const match of s.matchAll(/\b(s[0-9]{1,2})\b/g))result.add("class:"+match[1]);
  if(/\bpension\b/.test(s))result.add("basis:pension");
  if(/\bgrowth\b/.test(s) && /\b(group|pension|zurich)\b/i.test(name))result.add("basis:growth");
  if(/\b(group)\b/.test(s))result.add("basis:group");
  return result;
}
function tokens(name:string):Set<string>{return new Set(normalName(name).split(" ").filter(t=>t.length>1));}
function bigrams(name:string):Set<string>{
  const str=normalName(name).replace(/\s/g,"");
  return new Set(Array.from({length:Math.max(0,str.length-1)},(_,i)=>str.slice(i,i+2)));
}
export function similarity(approvedName:string,sourceName:string):number{
  const a=normalName(approvedName),b=normalName(sourceName);
  if(!a||!b)return 0;
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
  const fr=rank(providerFacts,f=>f.title??f.filename,fund.name);
  const topFact=fr[0];
  const factClear=!!topFact && topFact.score>=.82 && 
    (fr.length===1 || topFact.score-fr[1].score>=.10) &&
    !!topFact.item.title && topFact.item.extractionWarnings.every(w=>!w.includes("contradiction"));
  const perfTarget=factClear?topFact.item.title!:fund.name;
  const ranked=rank(providerRows,r=>r.sourceName,perfTarget);
  // The factsheet title can contain a provider wrapper; re-rank against the
  // exact Omega label if it produces no clear winner.
  const shortlistRank=rank(providerRows,r=>r.sourceName,fund.name);
  const candidates=ranked.length&&ranked[0].score>=.7?ranked:shortlistRank;
  const best=candidates[0],runner=candidates[1];
  const rowClear=!!best && best.score>=.88 && 
    (!runner || best.score-runner.score>=.11) &&
    isClassConsistent(fund.name,best.item.sourceName) &&
    (!factClear||isClassConsistent(topFact.item.title!,best.item.sourceName));
  const evidenceExact=Boolean(factClear&&rowClear &&
    normalName(topFact.item.title!)===normalName(best.item.sourceName));
  // Both independently sourced identities must corroborate each other.
  // If the workbook does not specify an as-of date/return basis,
  // "auto_matched" means identity only; it NEVER approves investment returns.
  const auto=Boolean(evidenceExact && best && topFact && best.score>=.92);
  const status:Review["status"]=auto?"auto_matched":
    (topFact||best)?"needs_review":"unmatched";
  const reason=auto?
    "Factsheet title and workbook series agree exactly; identity matched. Return basis and as-of date still need approval.":
    !topFact?"No securely identified provider factsheet for this shortlisted fund.":
    !factClear?"Factsheet title ambiguous or requires manual identity review.":
    !best?"No plausible published-performance row found in workbook.":
    !rowClear?"Potential multiple share classes or close performance rows; do not guess.":
    "Factsheet and workbook names differ or return-basis evidence remains incomplete.";
  return {
    fundId:fund.id,provider:fund.provider,name:fund.name,status,
    score:Math.round(1000*Math.min(best?.score??0,topFact?.score??0))/1000,
    reason,workbookRow:best?.item??null,
    factsheet:topFact?.item??null,
    alternativeRows:(candidates.slice(0,5).map(v=>v.item)),
    alternativeFactsheets:fr.slice(0,5).map(v=>({importId:v.item.importId,title:v.item.title,filename:v.item.filename})),
  };
}
