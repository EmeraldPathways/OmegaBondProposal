import type {Portfolio} from "../types";
import {isAllocationComplete} from "../allocation-precision";

/** Fund-level cumulative returns from a single identified performance workbook.
 * These are NOT verified, date-aligned portfolio unit-price observations.
 */
export type FundReportedPerformance={
  reported_returns?:Record<string,number|null>|null;
  evidence?:{
    displayedReturnsSource?:string|null;
    publishedPerformance?:{
      source?:string|null;
      importId?:string|null;
      returnConvention?:string|null;
      asOf?:string|null;
      asOfPrecision?:string|null;
      feeBasis?:string|null;
    }|null;
  }|null;
};
export type ReturnPeriod="threeYear"|"fiveYear"|"tenYear";
export type WeightedPublishedReturn={
  status:"available"|"empty"|"incomplete"|"insufficient"|"incompatible";
  returnPct:number|null;
  covered:number;
  selected:number;
};

/** An indicative allocation-weighted sum of published fund cumulative returns.
 * Requires every positive-weight fund, the same source workbook and compatible
 * return conventions, reporting dates and fee-basis metadata. Unknown dates
 * and fees are not represented as verified: the UI must label values indicative.
 * Missing returns must never be treated as zero or reweighted over other funds.
 */
export function weightedPublishedPortfolioReturn(
  portfolio:Pick<Portfolio,"weights">,
  reported:Record<string,FundReportedPerformance|undefined>,
  period:ReturnPeriod
):WeightedPublishedReturn{
  const holdings=Object.entries(portfolio.weights).filter(([,weight])=>weight>0);
  const selected=holdings.length;
  const base={returnPct:null,covered:0,selected};
  if(!selected)return {...base,status:"empty"};
  if(!isAllocationComplete(portfolio.weights))
    return {...base,status:"incomplete"};

  let covered=0;
  let weighted=0;
  const sources:{importId:string;asOf:string;precision:string;feeBasis:string}[]=[];
  for(const [id,weight] of holdings){
    const item=reported[id];
    const metadata=item?.evidence?.publishedPerformance;
    const value=item?.reported_returns?.[period];
    if(item?.evidence?.displayedReturnsSource!=="uploaded_workbook"||
      metadata?.source!=="uploaded_workbook"||
      metadata.returnConvention!=="cumulative"||
      !metadata.importId||typeof value!=="number"||!Number.isFinite(value)||
      value < -100){
      continue;
    }
    covered++;
    weighted+=weight*value/100;
    sources.push({
      importId:metadata.importId,
      asOf:metadata.asOf??"",
      precision:metadata.asOfPrecision??"",
      feeBasis:metadata.feeBasis??"not_stated"
    });
  }
  if(covered!==selected)
    return {...base,covered,status:"insufficient"};
  const first=sources[0];
  if(sources.some(source=>source.importId!==first.importId||
      source.asOf!==first.asOf||source.precision!==first.precision||
      source.feeBasis!==first.feeBasis))
    return {...base,covered,status:"incompatible"};
  return {...base,covered,status:"available",returnPct:weighted};
}
