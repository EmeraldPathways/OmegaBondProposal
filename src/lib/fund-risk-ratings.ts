/** Adviser-supplied 107-fund 1–7 risk ratings, 26 November 2026.
 *
 * Ratings and source notes originate from "Funds rating .docx".
 * Provider scales are NOT independently calibrated or comparable.
 * Original parsed factsheet values in Neon are not overwritten.
 * 106 ratings available; New Ireland Passive IRIS 2033 is unverified.
 */
export type RiskProvider="Aviva"|"New Ireland"|"Standard Life"|"Zurich";
export type FundRiskEntry={
  provider:RiskProvider;
  name:string;
  rating:number|null;
  source:string;
  asOf:string;
};
const PROVIDER_SOURCE:Record<RiskProvider,{source:string;asOf:string}>={
  "Aviva":{
    source:"Original stored Aviva factsheet, 1–7 graphic, usually page 2",
    asOf:"2026 source review"
  },
  "New Ireland":{
    source:"New Ireland fund risk categories and original provider factsheets",
    asOf:"2026 source review"
  },
  "Standard Life":{
    source:"Standard Life monthly fund performance table",
    asOf:"30 September 2026"
  },
  "Zurich":{
    source:"Zurich Fund Guide (with 5 Star 5 Americas and SuperCAPP exceptions)",
    asOf:"31 March 2025, except as individually sourced"
  }
};
export const FUND_RISK_DATA:readonly FundRiskEntry[]=[
  {provider:"Aviva",name:"Aviva AIMS Target Return Series B",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Cantor Fitzgerald Multi Asset 30",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Cantor Fitzgerald Multi Asset 50",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Cantor Fitzgerald Multi Asset 70",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Cash Fund",rating:1,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Concept K Series 1",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Emerging Markets Equity Index Fund",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Euro Eq ESG Passive Fund",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Fix Alloc ESG 80",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Fixed ESG 60 Series 1",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Global Emerging Market Equity Fund Series C",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Global Leaders Equity Fund Series 1",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva High Yield Equity Series B",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Irish Property Series B",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Irish Property Series M",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva L&G Multi-Index III B",rating:3,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva L&G Multi-Index IV Series B",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva L&G Multi-Index V B",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Active 3 Series B",rating:3,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Active 4 Series B",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Active 5 Series B",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Passive Plus 3 Series 1",rating:3,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Passive Plus 4 Series 1",rating:4,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Multi Asset ESG Passive Plus 5 Series 1",rating:5,...PROVIDER_SOURCE["Aviva"]},
  {provider:"Aviva",name:"Aviva Stewardship Ethical",rating:6,...PROVIDER_SOURCE["Aviva"]},
  {provider:"New Ireland",name:"New Ireland Alternative Energy Fund",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland BNYM Absolute Ret Bond",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland BNYM Global Real Ret Bond",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Balanced Managed",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Cash",rating:1,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Elements",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Ethical Equity",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Ethical Managed",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Euopean Equity",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Evergreen",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Goodbody Dividend Income 3",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Goodbody Dividend Income 4",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Goodbody Dividend Income 6",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Goodbody Global Leaders",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Goodbody Small Companies",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland High Yield Equity",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Income & Growth",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Indexed All Equity",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Innovator",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland KBI Alternate Energy",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland KBI Pension Managed",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland KBI Water",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PBIS Exempt Dynamic",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PRIME 3",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PRIME 4",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PRIME 5",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PRIME Equities",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Passive IRIS 2033",rating:null,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Pension Innovator",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Pension Passive Multi-Asset",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Pru Cautious",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland PruFund Growth",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Sentinel",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Tech Indexed",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Technology Indexed Fund",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland Water",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland World Index (Unhedged)",rating:6,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland iFunds 3",rating:3,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland iFunds 4",rating:4,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"New Ireland",name:"New Ireland iFunds 5",rating:5,...PROVIDER_SOURCE["New Ireland"]},
  {provider:"Standard Life",name:"Standard Life Euro Global Liquidity",rating:1,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Active I",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Active II",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Active III",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Active IV",rating:5,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Active V",rating:5,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Market I",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Market II",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Market III",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Market IV",rating:4,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Ireland MyFolio Market V",rating:5,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Vanguard Global Bond Index Fund",rating:3,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Vanguard Global Stock Index Fund",rating:5,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Standard Life",name:"Standard Life Vanguard US 500 Stock Index Fund",rating:5,...PROVIDER_SOURCE["Standard Life"]},
  {provider:"Zurich",name:"Zurich 5 Star 5 Americas",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich 5 Star 5 Asia Pacific",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich 5 Star 5 Europe",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich 5 Star 5 Global",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Active Asset Allocation",rating:4,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Active Fixed Income",rating:3,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Balanced",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Cash",rating:1,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Cautiously Managed",rating:4,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Dividend Growth",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Dynamic",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Eurozone Equity",rating:6,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Global Select Growth",rating:6,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Gold",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Indexed Emerging Mkts Equity",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Indexed European ExUK Property",rating:6,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Indexed Eurozone Equity",rating:6,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Indexed Global Equity",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Indexed Top Tech 100",rating:6,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich International Equity",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Long Bond",rating:4,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Performance",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Prisma 2",rating:2,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Prisma 3",rating:3,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Prisma 4",rating:4,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Prisma 5",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich Prisma MAX",rating:5,...PROVIDER_SOURCE["Zurich"]},
  {provider:"Zurich",name:"Zurich SuperCAPP",rating:2,...PROVIDER_SOURCE["Zurich"]},
];
const normalize=(value:string)=>value.normalize("NFKC").toLowerCase()
  .replace(/\beuopean\b/g,"european")
  .replace(/[^a-z0-9]+/g," ").trim();
const index=new Map(FUND_RISK_DATA.map(item=>[
  normalize(item.provider)+"|"+normalize(item.name),item
]));
if(index.size!==FUND_RISK_DATA.length)throw Error("Duplicate source fund risk records");
export function getFundRiskRating(fund:{provider:string;name:string}):FundRiskEntry|undefined{
  return index.get(normalize(fund.provider)+"|"+normalize(fund.name));
}
export function riskRatingLabel(fund:{provider:string;name:string}):string{
  const entry=getFundRiskRating(fund);
  return entry?.rating==null?"Not verified":entry.rating+"/7";
}
export const RISK_RATING_CAVEAT=
  "Risk ratings are provider-specific 1–7 scales and are not directly comparable between insurers; dates may differ.";
