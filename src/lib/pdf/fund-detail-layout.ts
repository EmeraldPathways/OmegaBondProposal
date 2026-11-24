/**
 * Consistent A4 fund-detail card layout.
 * Narrative copy is abridged only for print; the source factsheet remains in Neon.
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

type NarrativePart={label:string;text:string;limit:number};
function clean(value:string):string{return value.replace(/\s+/g," ").trim();}
export function wordCount(value:string):number{
  const normalized=clean(value);
  return normalized?normalized.split(" ").length:0;
}
export function abbreviateWords(value:string,maxWords:number):string{
  const words=clean(value).split(" ").filter(Boolean);
  const limit=Math.max(0,Math.floor(maxWords));
  if(!limit)return "";
  if(words.length<=limit)return words.join(" ");
  return words.slice(0,limit).join(" ").replace(/(?:\s*[·•,;:\-])+$/,"")+"…";
}
export function fundCardNarrative(fields:{
  objective?:string|null;description?:string|null;strategy?:string|null;
  riskFactors?:string[];riskDisclosure?:string|null;chargesDisclosure?:string|null;
}):{label:string;text:string}[]{
  const primary=fields.objective||fields.description||"Information unavailable";
  const extras: NarrativePart[]=[
    {label:"Fund description",text:primary,limit:58},
    {label:"Investment approach",text:fields.strategy??"",limit:22},
    {label:"Key risks",text:(fields.riskFactors??[]).join("; "),limit:14},
    {label:"Risk information",text:fields.riskDisclosure??"",limit:12},
    {label:"Charges information",text:fields.chargesDisclosure??"",limit:12},
  ];
  if(fields.description&&fields.objective&&
    clean(fields.description)!==clean(fields.objective))
    extras.push({label:"Additional description",text:fields.description,limit:12});
  const output:{label:string;text:string}[]=[];
  let remaining=FUND_CARD_NARRATIVE_WORDS;
  for(const part of extras){
    if(remaining<=0)break;
    const text=abbreviateWords(part.text,Math.min(remaining,part.limit));
    if(!text)continue;
    output.push({label:part.label,text});
    remaining-=wordCount(text);
  }
  return output;
}
