/** Extract labelled, source-supported narrative fields without inferring missing values. */
export const CONTENT_METADATA_VERSION=7;

export type FundContent={
  description:string|null;
  riskFactors:string[];
  riskDisclosure:string|null;
  chargesDisclosure:string|null;
  fieldPages:Record<string,number[]>;
};

const squash=(value:string,max=1800)=>value.replace(/\s+/g," ").trim().slice(0,max)||null;
const STOP=/(?:\b(?:ADDITIONAL INFORMATION|FUND PERFORMANCE|FUND MANAGER INFORMATION|CONTACT US|DISCLAIMER|HOLDINGS|TOP 10 HOLDINGS|SECTOR BREAKDOWN)\b)/i;

function labelled(pages:string[],label:RegExp,end:RegExp,max=1800){
  for(let i=0;i<pages.length;i++){
    const page=pages[i],hit=label.exec(page);
    if(!hit)continue;
    const tail=page.slice(hit.index+hit[0].length);
    const stop=end.exec(tail);
    const excerpt=squash(tail.slice(0,Math.min(stop?.index??max,max)),max);
    if(excerpt && excerpt.length>=18)return {text:excerpt,page:i+1};
  }
  return null;
}
export function extractFundContent(pages:string[],provider:string|null):FundContent{
  const result:FundContent={description:null,riskFactors:[],riskDisclosure:null,
    chargesDisclosure:null,fieldPages:{}};
  const add=(name:string,value:{text:string;page:number}|null)=>{
    if(value){result.fieldPages[name]=[value.page];return value.text}
    return null;
  };
  // Two-column scans can put "Fund Description: Risk Profile:" on the
  // same OCR line. The right-column heading does not belong in the narrative¶»§q«^