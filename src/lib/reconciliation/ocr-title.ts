import { similarity } from "./engine";
import type { ApprovedFund } from "@/lib/approved-funds";

export type OcrIdentityCandidate={
  title:string;
  score:number;
  confidence:number;
  proof:string;
};

/** Return only words observed on the PDF page. Never derive a title from the filename. */
export function ocrTitleFromPage(
  rawText:string,
  provider:string,
  approvedFunds:ApprovedFund[],
  confidence:number
):OcrIdentityCandidate|null{
  if(!Number.isFinite(confidence)||confidence<65)return null;
  const lines=rawText.split(/\r?\n/).map(x=>
    x.replace(/^[^a-zA-Z0-9]+/g,"").replace(/[|•]+/g," ")
      .replace(/\s+/g," ").trim()).filter(Boolean).slice(0,15);
  const acceptable=(line:string)=>
    line.length>=6&&line.length<=110&&
    !/^(fund description|risk profile|performance factsheet|new ireland|assurance|managed by|style|fund size|asset mix|tax|objective|at a glance)\b/i.test(line)&&
    !/(\b(?:equities|bonds|asset classes|invests|manages|corporate|geographic regions|aims to|portfolio|review committee)\b)/i.test(line);
  const shortlist=approvedFunds.filter(f=>f.provider===provider);
  const candidates:{title:string;score:number;idx:number;fundId:string}[]=[];
  for(let idx=0;idx<lines.length;idx++){
    const candidate=lines[idx].replace(/\s+[|—\-]+\s*$/, "").trim();
    if(!acceptable(candidate))continue;
    for(const fund of shortlist){
      const score=similarity(fund.name,candidate);
      if(score>=.62)candidates.push({title:candidate,score,idx,fundId:fund.id});
    }
  }
  candidates.sort((a,b)=>b.score-a.score || a.idx-b.idx);
  if(!candidates.length)return null;
  const best=candidates[0];
  // If the same OCR title resembles more than one shortlisted fund, retain
  // the literal title and let the later reconciler resolve duplicate claims.
  const titleAlternatives=candidates.filter(c=>c.title!==best.title);
  if(titleAlternatives[0] && best.score-titleAlternatives[0].score<.07)return null;
  return {title:best.title,score:Math.round(best.score*1000)/1000,
    confidence:Math.round(confidence),
    proof:"OCR page 1 (image-based PDF, local Tesseract); original text: "+best.title};
}
