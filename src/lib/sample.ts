import type { Fund, Portfolio } from "./types";

// IMPORTANT: these numbers are generated, synthetic examples — never sourced market data.
const start = new Date(Date.UTC(2016, 0, 31));
function dates() {
  const result: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const y = start.getUTCFullYear(), m = start.getUTCMonth() + i;
    result.push(new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10));
  }
  return result;
}
const allDates = dates();
function generatePrices(seed: number, yearly: number, movement: number) {
  let value = 1.0 + seed * 0.025;
  return allDates.map((date, i) => {
    if (i !== 0) {
      const wave = Math.sin((i + 3) * (seed + 1) * 0.48) * 0.009 + Math.cos((i + seed) * 0.17) * 0.006;
      value *= 1 + (yearly / 12) + wave * movement;
    }
    return { date, price: Number(value.toFixed(7)) };
  });
}
const source = "synthetic" as const;
export const demoFunds: Fund[] = [
  { id:"f1",name:"Balanced Multi-Asset Strategy",provider:"Example Asset Management",code:"DEMO-001",category:"Multi-Asset",currency:"EUR",risk:4,fee:1.1,source,prices:generatePrices(1,0.046,0.85) },
  { id:"f2",name:"Global Defensive Return",provider:"Example Investments",code:"DEMO-002",category:"Absolute Return",currency:"EUR",risk:3,fee:0.88,source,prices:generatePrices(2,0.03,0.45) },
  { id:"f3",name:"International Equity Growth",provider:"Example Asset Management",code:"DEMO-003",category:"Equities",currency:"EUR",risk:5,fee:1.25,source,prices:generatePrices(3,0.079,1.8) },
  { id:"f4",name:"Diversified Fixed Income",provider:"Example Funds",code:"DEMO-004",category:"Fixed Income",currency:"EUR",risk:2,fee:0.63,source,prices:generatePrices(4,0.021,0.35) },
  { id:"f5",name:"Sustainable Growth Allocation",provider:"Example Investments",code:"DEMO-005",category:"Multi-Asset",currency:"EUR",risk:4,fee:1.05,source,prices:generatePrices(5,0.054,1.1) },
  { id:"f6",name:"European Capital Preservation",provider:"Example Funds",code:"DEMO-006",category:"Defensive",currency:"EUR",risk:2,fee:0.55,source,prices:generatePrices(6,0.014,0.24) },
];
export const demoPortfolios: Portfolio[] = [
  {id:"a",title:"Balanced Growth",description:"Diversified growth with defensive exposure",weights:{f1:40,f2:25,f3:15,f4:20}},
  {id:"b",title:"Growth Focus",description:"Higher allocation to global equities",weights:{f1:20,f3:45,f5:25,f4:10}},
  {id:"c",title:"Capital Stability",description:"Lower volatility allocation",weights:{f2:35,f4:35,f6:20,f1:10}},
];
