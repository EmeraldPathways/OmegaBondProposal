/** Extract labelled, source-supported narrative fields without inferring missing values. */
export const CONTENT_METADATA_VERSION=6;

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
  const description=labelled(pages,/\bFund Description\s*:\s*|\bFund Description\s*\n/i,
    /\b(?:Managed By\s*:|Style\s*:|Asset Mix\s*:|Yearly Investment Performance|Fund Performance|Sector Average)\b/i,1500);
  result.description=add("description",description);
  if(provider==="New Ireland"&&result.description){
    // Side-by-side PDF columns can leave the risk-profile label immediately
    // after the Fund Description heading. Retain the real fund narrative.
    result.description=result.description
      .replace(/^Risk\s+Profile\s*:\s*/i,"")
      .replace(/\s+(?:Medium\s+to\s+High|Low\s+to\s+Medium|Very\s+High|High|Medium|Low)\s+Risk\s*$/i,"")
      .trim()||null;
  }

  // Aviva's one-to-seven colour bar often has no text-based selected value.
  // Record only printed risk wording and factors, never guess the highlighted score.
  const risks=labelled(pages,/\b(?:Risk Factors|Key Risks|Risk Profile\s*:|Investment Risks|Risk Considerations)\b/i,
    /\b(?:ADDITIONAL INFORMATION|Standard Charges|CONTACT US|Fund Performance)\b/i,1400);
  result.riskDisclosure=add("riskDisclosure",risks);
  const riskSection=pages.filter(p=>/\b(?:RISKS|Risk Factors|Risk Profile|Risk Rating|Risk Considerations)\b/i.test(p)).join("\n");
  const factors=[
    ["Market Fluctuations",/\bMarket Fluctuations\b/i],
    ["Capital and returns are not guaranteed",/\bCapital and returns are not guaranteed\b/i],
    ["Counterparty Risk",/\bCounterparty Risk\b/i],
    ["Liquidity Risk",/\bLiquidity Risk\b/i],
    ["Derivatives Risk",/\bDerivatives?\s+Risks?\b/i],
    ["Currency Risk",/\bCurrency Risk\b/i],
    ["Inflation Risk",/\bInflation Risk\b/i]
  ] as const;
  result.riskFactors=factors.filter(([,pattern])=>pattern.test(riskSection)).map(([name])=>name);
  if(result.riskFactors.length){
    result.fieldPages.riskFactors=pages.map((p,i)=>/\bRisk Factors\b/i.test(p)?i+1:null)
      .filter((i):i is number=>i!==null);
  }
  const charges=labelled(pages,
    /\b(?:Standard Charges|Charges and Fees|Costs and Charges|Fees and Charges)\b/i,
    /\b(?:ADDITIONAL INFORMATION|CONTACT US|FUND MANAGER INFORMATION)\b/i,1400);
  result.chargesDisclosure=add("chargesDisclosure",charges);
  if(!result.chargesDisclosure && provider==="Standard Life"){
    const fees=labelled(pages,/\bAnnual Management Charge\b/i,STOP,450);
    result.chargesDisclosure=add("chargesDisclosure",fees);
  }
  return result;
}
