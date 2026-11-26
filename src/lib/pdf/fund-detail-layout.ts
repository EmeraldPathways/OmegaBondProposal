/**
 * Consistent A4 fund-detail card layout.
 * Print text is selected verbatim from source-backed metadata. Never cut a
 * sentence at a word count or invent claims to complete a source fragment.
 * The original extracted document remains unchanged in Neon.
 */
export const FUNDS_PER_DETAIL_PAGE=3;
export const FUND_CARD_NARRATIVE_WORDS=85;
export const COVER_FUND_ROW_LIMITS:Record<number,number>={1:8,2:6,3:4};

export function firstPageFundLimit(portfolioCount:number):number{
  return COVER_FUND_ROW_LIMITS[Math.max(1,Math.min(portfolioCount,3))]??8;
}
export function paginateFundDetails<T>(items:readonly T[]):T[][]{
  const pages:T[][]=[];
  for(let start=0;start<items.length;start+=FUNDS_PER_DETAIL_PAGE)
    pages.push(items.slice(start,start+FUNDS_PER_DETAIL_PAGE));
  return pages;
}

type NarrativePart={label:string;value:string;limit:number;kind?:"sentences"|"list"};
function clean(value:string):string{return value.replace(/\s+/g," ").trim();}
export function wordCount(value:string):number{
  const normalized=clean(value);
  return normalized?normalized.split(" ").length:0;
}

/** Legacy word abbreviator is retained for non-fund-text callers only. */
export function abbreviateWords(value:string,maxWords:number):string{
  const words=clean(value).split(" ").filter(Boolean);
  const limit=Math.max(0,Math.floor(maxWords));
  if(!limit)return "";
  if(words.length<=limit)return words.join(" ");
  return words.slice(0,limit).join(" ").replace(/(?:\s*[·•,;:\-])+$/,"")+"…";
}

/** Exclude the known malformed New Ireland general risk-category heading.
 * It is unrelated to fund-specific risk and starts in the middle of a phrase.
 */
function printableRiskDisclosure(value:string|null|undefined):string{
  const text=clean(value??"");
  if(/^of investing at new ireland we classify our wide range of funds\b/i.test(text))
    return "";
  return text;
}

const trailingConnector=/\b(?:and|or|to|of|the|a|an|in|on|by|for|with|from|as|at|its|their|including|such as|which|that|through|between|into|is|are)\s*$/i;
const leadingFragment=/^(?:of investing at new ireland|and\s|or\s|which\s|that\s|including\s)/i;
function canUseSourceFragment(text:string):boolean{
  return Boolean(text)&&!leadingFragment.test(text)&&
    !trailingConnector.test(text)&&
    !/[,:;\-–—…]$/.test(text)&&
    !/\.{2,}$/.test(text);
}

/** Whole, readable source sentences only, up to a print word budget.
 * A short, complete-looking source phrase without punctuation can acquire a
 * final full stop; a longer unfinished phrase is never presented as a claim.
 */
export function completeSourceSentences(value:string|null|undefined,maxWords:number):string{
  const source=clean(value??"");
  if(!source||maxWords<1||leadingFragment.test(source))return "";
  const parts=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(source)]
    .map(item=>clean(item.segment)).filter(Boolean);
  const included:string[]=[];
  let used=0;
  for(let i=0;i<parts.length;i++){
    const part=parts[i];
    const count=wordCount(part);
    if(used+count>maxWords)break;
    const complete=/[.!?][”"')\]]?$/.test(part)&&!/[.…]{2,}$/.test(part);
    if(!complete){
      // A single short label or complete-looking source phrase can be punctuated
      // without changing its factual meaning. Multi-part dangling tails cannot.
      if(i===0&&parts.length===1&&count<=maxWords&&
        count<=22&&canUseSourceFragment(part)){
        included.push(part+".");
      }
      break;
    }
    included.push(part);
    used+=count;
  }
  return included.join(" ");
}

/** Fund metadata consists of independent labelled fields, not free prose.
 * Include or omit each whole item; do not print half of a fund manager name,
 * risk profile or asset classification at the 58-word boundary.
 */
export function wholeMetadataItems(items:(string|null|undefined)[],limit:number):string{
  const output:string[]=[];
  let remaining=Math.max(0,Math.floor(limit));
  for(const item of items){
    const value=clean(item??"");
    const words=wordCount(value);
    if(!words||words>remaining||/[,:;·\-–—…]$/.test(value))continue;
    output.push(value);
    remaining-=words;
  }
  return output.join(" · ");
}

function wholeRiskFactors(factors:readonly string[],maxWords:number):string{
  const output:string[]=[];
  let remaining=maxWords;
  for(const raw of factors){
    const factor=clean(raw);
    const count=wordCount(factor);
    if(!factor||count>remaining||!canUseSourceFragment(factor))continue;
    output.push(factor);
    remaining-=count;
  }
  return output.join("; ");
}

export function fundCardNarrative(fields:{
  objective?:string|null;description?:string|null;strategy?:string|null;
  riskFactors?:string[];riskDisclosure?:string|null;chargesDisclosure?:string|null;
}):{label:string;text:string}[]{
  const primaryCandidates=[fields.objective,fields.description];
  const primary=primaryCandidates.map(s=>completeSourceSentences(s,58))
    .find(Boolean)??"";
  const extras:NarrativePart[]=[
    {label:"Fund description",value:primary||"Information unavailable.",limit:58},
    {label:"Investment approach",value:fields.strategy??"",limit:22},
    {label:"Key risks",value:(fields.riskFactors??[]).join("; "),limit:14,kind:"list"},
    {label:"Risk information",value:printableRiskDisclosure(fields.riskDisclosure),limit:12},
    {label:"Charges information",value:fields.chargesDisclosure??"",limit:12}
  ];
  if(fields.description&&fields.objective&&
    clean(fields.description)!==clean(fields.objective))
    extras.push({label:"Additional description",value:fields.description,limit:12});
  const output:{label:string;text:string}[]=[];
  let remaining=FUND_CARD_NARRATIVE_WORDS;
  for(const part of extras){
    if(remaining<=0)break;
    const limit=Math.min(remaining,part.limit);
    const text=part.kind==="list"?
      wholeRiskFactors(fields.riskFactors??[],limit):
      part.label==="Fund description"?
        completeSourceSentences(part.value,limit):
        completeSourceSentences(part.value,limit);
    if(!text)continue;
    output.push({label:part.label,text});
    remaining-=wordCount(text);
  }
  return output;
}

/**
 * Temporary review-stage copy: ONE paragraph taken from the stored provider
 * factsheet objective (or description if the objective is unusable).
 * Reject OCR/footer fragments and never end on a partial sentence.
 * No external research, interpretation or financial claims are introduced.
 */
export function originalFactsheetParagraph(fields:{
  objective?:string|null;description?:string|null;
}):string{
  const suspicious=/\b(?:ENENENE\w*|veer\s+ow|v=\s*von|investir\s+primarily|expos\s+to|as\s+yc\s+move|Cumulati\b)\b/i;
  const spillover=/\b(?:Ata\s+Glance|At\s+a\s+Glance|Total\s+Fund\s+Size|Launch\s+Date|NEW\s+IRELAND.S\s+RISK\s+RATING|Risk\s+Profile:\s+NEW\s+IRELAND|Risk\s+profile\s+NEW\s+IRELAND)\b/i;
  const cleanSource=(value:string|null|undefined)=>{
    let t=clean(value??"").replace(/^[•●▪\-–]\s*/,"");
    // Zurich's equity-exposure metadata is occasionally appended before
    // the description by the PDF extractor.
    t=t.replace(/^Indicative equity (?:exposure|range):\s*.*?\b(?=(?:The|This|Our)\s+[A-Z])/i,"");
    t=t.replace(/^Risk Profile\s+(?=(?:The|This)\s+[a-z])/i,"");
    const marker=spillover.exec(t);
    if(marker&&marker.index>0)t=t.slice(0,marker.index).trim();
    t=t.replace(/\b(?:Very Low|Low(?: to Medium)?|Medium(?: to High)?|High)\s+Risk\s*$/i,"").trim();
    return t;
  };
  const fullStop=/[.!?][”"')\]]?$/;
  const options=[fields.objective,fields.description];
  for(const candidate of options){
    const text=cleanSource(candidate);
    if(!text||leadingFragment.test(text))continue;
    const segments=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(text)]
      .map(x=>clean(x.segment)).filter(Boolean);
    const accepted:string[]=[];
    let total=0;
    for(const segment of segments){
      const size=wordCount(segment);
      if(total+size>260)break; // enough for the longest current source paragraph
      if(suspicious.test(segment))continue;
      if(fullStop.test(segment)&&!/[.…]{2,}$/.test(segment)){
        accepted.push(segment);total+=size;continue;
      }
      // Only a short, single-sentence objective may lack a full stop.
      if(segments.length===1&&size<=55&&canUseSourceFragment(segment)&&
        !/[\u2026]|(?:\b(?:d[eé]du|an|in|by)\s*)$/i.test(segment)){
        accepted.push(segment+".");
      }
      break;
    }
    if(accepted.length)return accepted.join(" ");
  }
  return "";
}
