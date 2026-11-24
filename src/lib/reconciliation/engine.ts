import type {ConfirmedSourceAssociation} from "./user-confirmed-source";
import type { ApprovedFund } from "@/lib/approved-funds";
import type { PdfPerformance } from "./pdf-performance";

export const HORIZONS = ["ytd","oneMonth","threeMonth","sixMonth","oneYear","threeYear","fiveYear","tenYear","sinceLaunch"] as const;
export type ReportedReturns = Record<(typeof HORIZONS)[number],number|null>;

export type WorkbookEntry = { provider:string; sourceName:string; rowNumber:number; returns:ReportedReturns };
export type FactSheetData = {
  importId:string; filename:string; providerHint:string|null; title:string|null; moneyMateId:string|null;
  asOf:string|null; launchDate:string|null; baseCurrency:string|null; amcPct:number|null;
  civPct:number|null; riskRating:number|null; riskProfile?:string|null; managedBy?:string|null;
  managementStyle?:string|null; assetMix?:string|null; taxStatus?:string|null;
  expenseRatioPct?:number|null; equityRange?:string|null; sfdrClass?:string|null;
  metadataVersion?:number;
  confirmedSourceAssociation?:ConfirmedSourceAssociation;
  sourceText?:string|null;extractionMethod?:"pdf_text"|"ocr_first_page";
  description?:string|null; riskFactors?:string[]; riskDisclosure?:string|null;
  chargesDisclosure?:string|null; fieldPages?:Record<string,number[]>;
  objective:string|null; strategy:string|null;
  holdings:{name:string;percentage:number}[]; allocations:{name:string;percentage:number}[];
  chartReferences:{page:number;label:string;source:"original_pdf"}[];
  pageCount:number; extractionWarnings:string[]; titleEvidence:string|null;
  performance?:PdfPerformance|null;
};
export type Review = {
  fundId:string; provider:string; name:string; status:"auto_approved"|"suggested"|"needs_review"|"unmatched";
  score:number; factsheetScore:number; workbookScore:number; factsheetIdentityApproved:boolean; seriesIdentityApproved:boolean; reason:string; workbookRow:WorkbookEntry|null; factsheet:FactSheetData|null;
  alternativeRows:(WorkbookEntry & {score:number})[];
  alternativeFactsheets:{importId:string;title:string|null;filename:string;score:number}[];
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
    .filter(x=>x.score>=.26).sort((a,b)=>b.score-a.score);
}
/** Heuristic name/evidence score, not a calibrated probability of correctness. */
export function matchScore(fundName:string,pdfTitle:string,workbookName:string){
  const factsheetScore=similarity(fundName,pdfTitle);
  const workbookScore=similarity(pdfTitle,workbookName);
  const baseScore=similarity(fundName,workbookName);
  const consistent=isClassConsistent(fundName,workbookName) &&
    isClassConsistent(pdfTitle,workbookName) && signalsSupported(fundName,pdfTitle,workbookName);
  const joint=.35*factsheetScore+.45*workbookScore+.2*baseScore;
  return {
    factsheetScore:Math.round(factsheetScore*1000)/1000,
    workbookScore:Math.round(workbookScore*1000)/1000,
    score:Math.round(Math.max(0,Math.min(1,consistent?joint:Math.min(.49,joint*.65)))*1000)/1000,
    classConsistent:consistent
  };
}

export function reconcileOne(fund:ApprovedFund,rows:WorkbookEntry[],factsheets:FactSheetData[]):Review{
  const providerRows=rows.filter(r=>r.provider===fund.provider);
  const providerFacts=factsheets.filter(f=>f.providerHint===fund.provider && !!f.title?.trim());
  // Never score on the archive filename; internal PDF title is the only identity evidence.
  const rankedFacts=rank(providerFacts,f=>f.title!,fund.name);
  const topFact=rankedFacts[0];
  const factTitle=topFact?.item.title??"";
  const exactPdf=topFact ? normalName(factTitle)===normalName(fund.name) : false;
  const equalFacts=topFact ? rankedFacts.filter(f=>normalName(f.item.title!)===normalName(factTitle)).length : 0;
  const uniqueFact=!!topFact && equalFacts<=1 &&
    (exactPdf || !rankedFacts[1] || topFact.score-rankedFacts[1].score>=.025);

  // Once a plausible PDF title is present, rank workbook series against the printed
  // title. The shortlist remains an independent cross-check.
  const target=topFact && topFact.score>=.48 ? factTitle : fund.name;
  const rankedRows=rank(providerRows,r=>r.sourceName,target);
  const best=rankedRows[0],runner=rankedRows[1];
  const exactRow=!!best&&normalName(target)===normalName(best.item.sourceName);
  const identicalRows=best?
    rankedRows.filter(r=>normalName(r.item.sourceName)===normalName(best.item.sourceName)).length:0;
  const uniqueRow=!!best&&identicalRows===1 &&
    (exactRow || !runner || best.score-runner.score>=.025);

  const summary=topFact&&best ? matchScore(fund.name,factTitle,best.item.sourceName) : null;
  // Two independent internal-source identities must corroborate the same unique
  // fund and share class. An exact PDF↔workbook series is strong evidence even
  // when the shortlist uses an abbreviated display name.
  const exactSourceAgreement=!!best && normalName(factTitle)===normalName(best.item.sourceName);
  const factsheetIdentityApproved=Boolean(topFact && uniqueFact && topFact.score>=.65);
  const solid=!!summary && summary.classConsistent && uniqueFact && uniqueRow &&
    summary.factsheetScore>=.54 && summary.workbookScore>=.60 &&
    summary.score>=.63 && (exactSourceAgreement ||
      (summary.score>=.79 && summary.factsheetScore>=.72 && summary.workbookScore>=.72));
  const suggested=!!summary && summary.classConsistent &&
    summary.factsheetScore>=.32 && summary.workbookScore>=.34;
  const status:Review["status"]=solid?"auto_approved":
    suggested?"suggested":topFact||best?"needs_review":"unmatched";
  const reason=solid?
    "Automatically approved identity: distinct printed PDF fund title corroborates the unique workbook series, with no identified share-class conflict. You can override it. Return basis remains unapproved.":
    factsheetIdentityApproved && !solid?
    "Official PDF fund identity automatically approved. Workbook series/share class still needs review.":
    suggested?
    "Plausible PDF-title and workbook-series match; check exact share class before confirming.":
    topFact&&!best?"A PDF title was found but there is no comparable workbook performance row.":
    !topFact&&best?"Workbook candidate found, but no reliable fund title extracted from a PDF.":
    topFact&&best&&summary&&!summary.classConsistent?
      "Share class or pension/growth basis is not corroborated; manual review required.":
      topFact&&best?"Name evidence is weak or competing source rows remain; manual review required.":
      "No plausible PDF-title and performance-row combination found.";

  const rowCandidates=rankedRows.slice(0,10).map(v=>({
    ...v.item,score:Math.round(v.score*1000)/1000
  }));
  const pdfCandidates=rankedFacts.slice(0,10).map(v=>({
    importId:v.item.importId,title:v.item.title,filename:v.item.filename,
    score:Math.round(v.score*1000)/1000
  }));

  return {
    fundId:fund.id,provider:fund.provider,name:fund.name,status,
    score:summary?.score??Math.round(Math.min(topFact?.score??0,best?.score??0)*1000)/1000,
    factsheetScore:summary?.factsheetScore??topFact?.score??0,
    workbookScore:summary?.workbookScore??best?.score??0,
    factsheetIdentityApproved,seriesIdentityApproved:solid,
    reason,
    workbookRow:best && best.score>=.29?best.item:null,
    factsheet:topFact?.item??null,
    alternativeRows:rowCandidates,alternativeFactsheets:pdfCandidates
  };
}

/** Prevent any two approved identities from claiming the same factsheet or workbook series. */
export function downgradeDuplicateApprovals(reviews:Review[],reserved:{
  factsheetImportId:string|null;performanceImportId:string|null;rowNumber:number|null;fundId:string
}[]=[]):Review[]{
  const countPdf=new Map<string,Set<string>>();
  const countRows=new Map<string,Set<string>>();
  const add=(map:Map<string,Set<string>>,key:string,id:string)=>{
    const ids=map.get(key)??new Set<string>();ids.add(id);map.set(key,ids);
  };
  for(const review of reviews){
    if(review.factsheetIdentityApproved&&review.factsheet)add(countPdf,review.factsheet.importId,review.fundId);
    if(review.status==="auto_approved"&&review.workbookRow)add(countRows,review.provider+"|"+review.workbookRow.rowNumber,review.fundId);
  }
  for(const item of reserved){
    if(item.factsheetImportId)add(countPdf,item.factsheetImportId,item.fundId);
    if(item.performanceImportId&&item.rowNumber!=null){
      // Manual records reference the same published source workbook.
      const matched=reviews.find(r=>r.fundId===item.fundId);
      const provider=matched?.provider;
      if(provider)add(countRows,provider+"|"+item.rowNumber,item.fundId);
      else for(const review of reviews){
        if(review.workbookRow?.rowNumber===item.rowNumber)
          add(countRows,review.provider+"|"+item.rowNumber,item.fundId);
      }
    }
  }
  return reviews.map(r=>{
    const pdfConflict=!!r.factsheet && (countPdf.get(r.factsheet.importId)?.size??0)>1;
    const rowConflict=!!r.workbookRow && (countRows.get(r.provider+"|"+r.workbookRow.rowNumber)?.size??0)>1;
    if(!pdfConflict&&!rowConflict)return r;
    return {...r,factsheetIdentityApproved:pdfConflict?false:r.factsheetIdentityApproved,
      seriesIdentityApproved:false,
      status:r.status==="auto_approved"?"suggested" as const:r.status,
      reason:"Automatic approval withheld: another shortlisted fund shares this PDF or workbook series."};
  });
}
