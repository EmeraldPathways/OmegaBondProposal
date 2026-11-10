import type { PricePoint } from "./types";
/** Parses CSV with RFC-style double quoted fields; accepts a header and daily/monthly prices. */
export function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let cell="",row:string[]=[],quoted=false;
  for (let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){
      if(quoted && input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(c===',' && !quoted){row.push(cell.trim());cell="";}
    else if((c==='\n'||c==='\r') && !quoted){
      if(c==='\r'&&input[i+1]==='\n')i++;
      row.push(cell.trim()); if(row.some(x=>x))rows.push(row);
      row=[];cell="";
    }else cell+=c;
  }
  if(quoted)throw new Error("Unclosed quotation mark in CSV.");
  row.push(cell.trim());if(row.some(x=>x)) rows.push(row);
  return rows;
}
export function parsePriceCSV(input: string): {prices:PricePoint[]; rejected:string[]} {
  const rows=parseCSV(input.replace(/^\uFEFF/,""));
  if(rows.length<2)throw new Error("Include a heading row and at least one price row.");
  const headers=rows[0].map(h=>h.toLowerCase().replace(/[\s_-]+/g,""));
  const di=headers.findIndex(h=>["date","pricedate","valuationdate"].includes(h));
  const pi=headers.findIndex(h=>["price","unitprice","nav","value"].includes(h));
  if(di<0||pi<0)throw new Error("CSV must have 'date' and 'price' (or 'unit_price') headings.");
  const rejected:string[]=[];
  const observed=new Map<string,number>();
  rows.slice(1).forEach((cells,i)=>{
    const date=cells[di],value=Number(cells[pi]);
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(date??"") &&
      !Number.isNaN(Date.parse(date+"T00:00:00Z")) &&
      new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date;
    if(!valid||!Number.isFinite(value)||value<=0) { rejected.push("Row "+(i+2)+": invalid date or price");return; }
    if(observed.has(date)) {rejected.push("Row "+(i+2)+": duplicate date "+date);return;}
    observed.set(date,value);
  });
  return {prices:[...observed].map(([date,price])=>({date,price})).sort((a,b)=>a.date.localeCompare(b.date)),rejected};
}
export function monthlyPrices(prices: PricePoint[]): PricePoint[] {
  const months=new Map<string,PricePoint>();
  for(const p of [...prices].sort((a,b)=>a.date.localeCompare(b.date)))months.set(p.date.slice(0,7),p);
  return [...months.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
