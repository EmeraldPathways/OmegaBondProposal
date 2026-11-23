import type {SourceGrowthSeries,ChartPoint} from "@/lib/reconciliation/chart-digitize";

export type ChartedFund={
  id:string;name:string;weight:number;
  growthChart?:SourceGrowthSeries|null
};
export type PortfolioChart={
  dates:string[];
  fundLines:{id:string;name:string;weight:number;values:number[]}[];
  portfolioLine:number[]|null;
  allFundsCovered:boolean;
  missingFunds:string[];
  start:string;
  end:string;
  caveat:string
};
const monthlyMap=(values:ChartPoint[])=>new Map(values.map(p=>[p.date,p.value]));
/**
 * Rebase the chart-traced source curves to index 100 on their actual common
 * month; combine weights as a buy-and-hold initial allocation without
 * inventing rebalancing or claiming these are verified NAV observations.
 * Return null rather than filling missing dates, histories or currencies.
 */
export function reconstructPortfolioGrowth(funds:ChartedFund[]):PortfolioChart|null{
  const included=funds.filter(f=>f.growthChart?.estimated &&
    f.growthChart.currency==="EUR" &&
    f.growthChart.observations.length>=9);
  if(!included.length)return null;
  const maps=included.map(f=>monthlyMap(f.growthChart!.observations));
  const dates=[...maps[0].keys()].filter(date=>maps.every(m=>m.has(date))).sort();
  const missingFunds=funds.filter(f=>!included.some(x=>x.id===f.id)).map(f=>f.name);
  if(dates.length<9)return null;
  const baseDate=dates[0];
  const lines=included.map((f,index)=>{
    const m=maps[index],initial=m.get(baseDate)!;
    return {
      id:f.id,name:f.name,weight:f.weight,
      values:dates.map(date=>Number((100*m.get(date)!/initial).toFixed(3)))
    };
  });
  const allFundsCovered=missingFunds.length===0;
  const weightSum=funds.reduce((s,f)=>s+f.weight,0);
  const portfolioLine=allFundsCovered&&Math.abs(weightSum-100)<.005
    ?dates.map((_,i)=>Number(
        (lines.reduce((s,line)=>s+(line.weight/100)*line.values[i],0)).toFixed(3)
      )):null;
  return {
    dates, fundLines:lines,portfolioLine,allFundsCovered,missingFunds,
    start:dates[0],end:dates.at(-1)!,
    caveat:"Estimated from digitized provider PDF graphs. Not official unit prices, "+
      "verified portfolio returns or workbook performance. "+
      "Composite is an illustrative initial-weight, buy-and-hold reconstruction, "+
      "without fees or rebalancing. Only common dates are plotted."
  };
}
