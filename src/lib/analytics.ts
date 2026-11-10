import type { Fund, Portfolio, Performance, SeriesPoint } from "./types";
const finite = (n: number) => Number.isFinite(n);
export function sumWeights(p: Portfolio): number {
  return Object.values(p.weights).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}
export function isValidPortfolio(p: Portfolio, funds: Fund[]): boolean {
  const ids = new Set(funds.map(f=>f.id));
  return Math.abs(sumWeights(p) - 100) < 0.00001 &&
    Object.entries(p.weights).every(([id, weight])=>ids.has(id) && finite(weight) && weight>=0 && weight<=100);
}
/** Buy and hold in EUR, assuming aligned dates and already price-adjusted share/unit values.
 * Prices may already contain fund-level costs; this method does NOT deduct fees a second time.
 * All compared funds must share a total-return-equivalent price basis to be truly comparable.
 */
export function portfolioSeries(portfolio: Portfolio, funds: Fund[], investment = 100000): SeriesPoint[] {
  if (!finite(investment) || investment <= 0 || !isValidPortfolio(portfolio,funds)) return [];
  const holdings = Object.entries(portfolio.weights).filter(([,w])=>w>0).map(([id, weight])=>{
    const fund = funds.find(f=>f.id===id);
    return { fund,weight };
  });
  if (holdings.some(h=>!h.fund || h.fund.currency!=="EUR")) return [];
  const lookups = holdings.map(h=>new Map((h.fund as Fund).prices.map(pt=>[pt.date,pt.price])));
  const shared = [...lookups[0].keys()].filter(date=>lookups.every(map=>map.has(date))).sort();
  if (shared.length < 2) return [];
  const initial = shared[0];
  const units = holdings.map((h,i)=>{
    const price=lookups[i].get(initial) ?? 0;
    return price > 0 ? (investment*h.weight/100)/price : NaN;
  });
  if (units.some(u=>!finite(u))) return [];
  return shared.map(date=>({
    date,
    value: lookups.reduce((total,map,i)=>total+units[i]*(map.get(date)??0),0)
  }));
}
export function metrics(series: SeriesPoint[], years = 5): Performance | null {
  if (series.length<13 || !finite(years) || years<=0) return null;
  const end=series[series.length-1];
  const target=new Date(end.date+"T00:00:00Z");
  target.setUTCFullYear(target.getUTCFullYear()-years);
  const min=target.getTime();
  const candidates=series.filter(p=>new Date(p.date+"T00:00:00Z").getTime()>=min);
  if (candidates.length<13) return null;
  const start=candidates[0];
  const actualYears=(new Date(end.date+"T00:00:00Z").getTime()-new Date(start.date+"T00:00:00Z").getTime())/(365.25*86400000);
  // Do not label a materially shorter history as an N-year return.
  if (actualYears < years-0.12 || start.value<=0 || end.value<=0) return null;
  const returns = candidates.slice(1).map((p,i)=>p.value/candidates[i].value-1);
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const sampleVariance=returns.length>1?returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1):0;
  // Monthly input only; imported daily/weekly values must first be normalised to a monthly series.
  const volatilityPct=Math.sqrt(sampleVariance)*Math.sqrt(12)*100;
  const ratio=end.value/start.value;
  return {startDate:start.date,endDate:end.date,first:start.value,last:end.value,gain:end.value-start.value,returnPct:(ratio-1)*100,cagrPct:(ratio**(1/actualYears)-1)*100,volatilityPct};
}
export function blendedFee(p: Portfolio, funds: Fund[]): number | null {
  const applied=Object.entries(p.weights).filter(([,weight])=>weight>0);
  if (applied.some(([id])=>funds.find(f=>f.id===id)?.fee == null)) return null;
  return applied.reduce((s,[id,w])=>s+(funds.find(f=>f.id===id)?.fee??0)*w/100,0);
}
export function fmtEuro(n: number): string {return new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);}
export function fmtPercent(n: number | null, signed=false): string {return n == null || !finite(n)?"—":(signed && n>0?"+":"")+n.toFixed(2)+"%";}
