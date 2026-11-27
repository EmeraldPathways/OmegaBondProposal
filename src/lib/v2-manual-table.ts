import type {FundPosition,FlowEntry,ValuationEntry} from "@/lib/v2-investment-performance";
import {isValidDate} from "@/lib/v2-investment-performance";

export type TableParse<T>={rows:T[];errors:string[];skipped:number};
export type DraftValuation=Omit<ValuationEntry,"id">;
export type DraftFlow=Omit<FlowEntry,"id">;
const DAY_MS=24*60*60*1000;
const datePrefix=/^(?:value\s*(?:at|@)\s*|valuation\s*(?:at|@)\s*)/i;
const isBlank=(v:string)=>v.trim()===""||/^(?:—|-|n\/a|na)$/i.test(v.trim());

/** Excel stores whole days from 1899-12-30; spreadsheets' formatted dates
 * are also accepted, but ambiguous American MM/DD/YYYY is not. */
export function parseManualDate(raw:string):string|null{
  const value=raw.trim().replace(datePrefix,"").trim();
  if(isValidDate(value))return value;
  const euro=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/;
  const m=value.match(euro);
  if(m){
    const s=m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
    return isValidDate(s)?s:null;
  }
  if(/^\d{5}(?:\.0+)?$/.test(value)){
    const serial=Number(value);
    if(serial<20000||serial>90000)return null;
    const iso=new Date(Date.UTC(1899,11,30)+serial*DAY_MS).toISOString().slice(0,10);
    return isValidDate(iso)?iso:null;
  }
  return null;
}
export function parseEuroAmount(raw:string):number|null{
  if(isBlank(raw))return null;
  let v=raw.trim().replace(/[€£\s]/g,"");
  if(v.startsWith("+"))v=v.slice(1);
  // Reject decimal comma formats that could be interpreted as different totals.
  if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(v))return null;
  const value=Number(v.replace(/,/g,""));
  return Number.isFinite(value)&&value>=0&&value<=1e12?value:null;
}
export function findFundId(label:string,funds:FundPosition[]):string|null|undefined{
  const key=label.trim().replace(/\s+/g," ").toLocaleLowerCase("en-IE");
  if(!key||/^(?:policy|whole policy|total policy|unallocated)$/i.test(key))return null;
  const matches=funds.filter(f=>f.name.trim().replace(/\s+/g," ").toLocaleLowerCase("en-IE")===key);
  return matches.length===1?matches[0].id:undefined;
}
const splitRows=(text:string)=>text.replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.split("\t").map(v=>v.trim())).filter(r=>r.some(v=>v.length>0));
const error=(errors:string[],line:number,message:string)=>errors.push("Row "+line+": "+message);
const valuationHeader=(row:string[])=>row.some(v=>/^(?:date|holding|fund|market\s*value|valuation|amount)$/i.test(v.trim()));
const transactionHeader=(row:string[])=>row.some(v=>/^(?:date|type|holding|fund|amount|note|notes)$/i.test(v.trim()));

/** Paste as Date | Holding | Market value, or Date | Market value (policy). */
export function parseValuationTable(text:string,funds:FundPosition[]):TableParse<DraftValuation>{
  const source=splitRows(text),rows:DraftValuation[]=[],errors:string[]=[];
  let skipped=0;
  source.forEach((cols,index)=>{
    const line=index+1;
    if(index===0&&valuationHeader(cols)){skipped++;return;}
    if(cols.length<2||cols.length>3){error(errors,line,"Use Date, Holding, Value or Date, Value columns.");return;}
    const date=parseManualDate(cols[0]);
    if(!date){error(errors,line,"Invalid date; use DD/MM/YYYY, YYYY-MM-DD or an Excel date serial.");return;}
    const amountRaw=cols.at(-1)!;
    const value=parseEuroAmount(amountRaw);
    if(value===null){error(errors,line,"Valuation must be a nonnegative euro amount, not blank.");return;}
    const fundId=cols.length===3?findFundId(cols[1],funds):null;
    if(fundId===undefined){error(errors,line,"Holding is not a unique fund name in this policy.");return;}
    rows.push({date,fundId,value});
  });
  const keys=rows.map(r=>r.date+":"+String(r.fundId));
  if(new Set(keys).size!==keys.length)errors.push("Duplicate valuation dates for the same holding in pasted rows.");
  return {rows,errors,skipped};
}

/** Paste fund statement columns as Fund | Value @ DD/MM/YYYY | Value @ DD/MM/YYYY ... */
export function parseValuationMatrix(text:string,funds:FundPosition[]):TableParse<DraftValuation>{
  const source=splitRows(text),rows:DraftValuation[]=[],errors:string[]=[];
  if(source.length<2)return {rows,errors:["Paste a header row and at least one fund row."],skipped:0};
  const header=source[0];
  if(header.length<2||header.length>60)return {rows,errors:["The matrix must include a fund column and dated valuation columns."],skipped:0};
  const days=header.slice(1).map(parseManualDate);
  if(days.some(d=>d===null)||new Set(days).size!==days.length)
    return {rows,errors:["Column headings must be unique dates, such as Value @ 26/11/2026."],skipped:0};
  let skipped=1;
  for(let i=1;i<source.length;i++){
    const cols=source[i],label=cols[0]??"";
    if(/^(?:total value:?|performance:?|notes:?|e&oe)$/i.test(label)){skipped++;continue;}
    const fundId=findFundId(label,funds);
    if(fundId===undefined){error(errors,i+1,"Fund name does not match exactly one holding in this policy.");continue;}
    if(cols.length>header.length){error(errors,i+1,"More values than the number of date columns.");continue;}
    cols.slice(1).forEach((raw,col)=>{
      if(isBlank(raw))return; // Preserve missing source observations, never turn into 0.
      const value=parseEuroAmount(raw);
      if(value===null)error(errors,i+1,"Invalid euro valuation for "+header[col+1]+".");
      else rows.push({date:days[col]!,fundId,value});
    });
  }
  const keys=rows.map(r=>r.date+":"+String(r.fundId));
  if(new Set(keys).size!==keys.length)errors.push("Duplicate fund valuations on the same date.");
  if(!rows.length&&errors.length===0)errors.push("No dated valuations were found.");
  return {rows,errors,skipped};
}

function parseFlowType(value:string):"contribution"|"withdrawal"|null{
  const v=value.trim().toLowerCase();
  if(/^(?:contribution|deposit|addition|additional investment|premium|investment)$/.test(v))return "contribution";
  if(/^(?:withdrawal|drawdown|payment out|encashment|distribution)$/.test(v))return "withdrawal";
  return null;
}
/** Paste Date | Type | Holding | Amount | Notes (notes optional). */
export function parseCashFlowTable(text:string,funds:FundPosition[]):TableParse<DraftFlow>{
  const source=splitRows(text),rows:DraftFlow[]=[],errors:string[]=[];
  let skipped=0;
  source.forEach((cols,index)=>{
    const line=index+1;
    if(index===0&&transactionHeader(cols)){skipped++;return;}
    if(cols.length<3||cols.length>5){error(errors,line,"Use Date, Type, Holding, Amount, Notes columns.");return;}
    const date=parseManualDate(cols[0]);
    const kind=parseFlowType(cols[1]);
    if(!date){error(errors,line,"Invalid transaction date.");return;}
    if(!kind){error(errors,line,"Type must be Contribution or Withdrawal.");return;}
    const hasHolding=cols.length>=4;
    const fundId=hasHolding?findFundId(cols[2],funds):null;
    if(fundId===undefined){error(errors,line,"Holding is not a unique fund name in this policy.");return;}
    const amount=parseEuroAmount(cols[hasHolding?3:2]);
    if(amount===null||amount<=0){error(errors,line,"Transaction amount must be positive.");return;}
    const note=hasHolding?(cols[4]??""):"";
    if(note.length>250){error(errors,line,"Transaction notes exceed 250 characters.");return;}
    rows.push({date,kind,fundId,amount,note});
  });
  return {rows,errors,skipped};
}
