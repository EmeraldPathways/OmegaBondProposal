import type ExcelJS from "exceljs";
import type {ApprovedFund} from "@/lib/approved-funds";
import {workbookNameKey} from "./workbook-source";

export type PricePeriod={date:string;label:string};
export type PriceHistoryPoint={date:string;label:string;returnPct:number};
export type FundPriceHistory={fundId:string;provider:string;name:string;points:PriceHistoryPoint[]};
export type PriceHistorySnapshot={
  periods:PricePeriod[];funds:FundPriceHistory[];
  fundCount:number;pointCount:number;missingCount:number;
  start:string;end:string;
};
export type PriceMatrixRow={provider:string;name:string;values:(number|string|null)[]};

const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function parseFiveYearLabel(label:string):PricePeriod{
  const value=label.trim();
  const matched=/^5Y\s+(?:(\d{1,2})-)?([A-Za-z]{3})-(\d{2})$/.exec(value);
  if(!matched)throw new Error("PRICES header must use 5Y Mon-YY or 5Y DD-Mon-YY: "+value);
  const month=months.findIndex(m=>m.toLowerCase()===matched[2].toLowerCase());
  if(month<0)throw new Error("Unknown PRICES month: "+value);
  const year=2000+Number(matched[3]);
  const day=matched[1]?Number(matched[1]):new Date(Date.UTC(year,month+1,0)).getUTCDate();
  if(day<1||day>new Date(Date.UTC(year,month+1,0)).getUTCDate())
    throw new Error("Invalid PRICES reporting date: "+value);
  return {label:value,date:new Date(Date.UTC(year,month,day)).toISOString().slice(0,10)};
}
function toNumericReturn(value:number|string|null):number|null{
  if(value==null||value===""||/^(?:-|—|n\/a)$/i.test(String(value).trim()))return null;
  const n=typeof value==="number"?value:Number(String(value).trim().replace(/[% ,]/g,""));
  if(!Number.isFinite(n)||n< -100||n>100000)
    throw new Error("PRICES contains a non-finite or out-of-range reported cumulative return.");
  return n;
}
export function validatePriceMatrix(
  headers:string[],rows:PriceMatrixRow[],active:readonly ApprovedFund[]
):PriceHistorySnapshot{
  if(headers.length<60||headers.length>64)
    throw new Error("PRICES requires a five-year monthly history (60–64 reporting columns).");
  const periods=headers.map(parseFiveYearLabel);
  const previous=new Set<string>();
  for(let i=0;i<periods.length;i++){
    const current=periods[i].date;
    if(previous.has(current)||i>0&&periods[i-1].date>=current)
      throw new Error("PRICES dates must be unique and strictly chronological.");
    previous.add(current);
  }
  const lookup=new Map(active.map(f=>[f.provider+"|"+workbookNameKey(f.name),f]));
  if(rows.length!==active.length)throw new Error(
    "PRICES must contain one row per FUNDS entry; expected "+active.length+" got "+rows.length);
  const visited=new Set<string>();
  const funds:FundPriceHistory[]=[];
  let pointCount=0;
  for(const row of rows){
    const key=row.provider+"|"+workbookNameKey(row.name);
    const fund=lookup.get(key);
    if(!fund)throw new Error("PRICES fund is not in the active FUNDS list: "+row.name);
    if(visited.has(key))throw new Error("PRICES contains duplicate fund: "+row.name);
    visited.add(key);
    if(row.values.length!==periods.length)
      throw new Error("PRICES column count mismatch for "+row.name);
    const points:PriceHistoryPoint[]=[];
    for(let i=0;i<periods.length;i++){
      const numeric=toNumericReturn(row.values[i]);
      if(numeric===null)continue;
      points.push({...periods[i],returnPct:numeric});
    }
    if(points.length===0||points[points.length-1]?.date!==periods[periods.length-1].date)
      throw new Error("PRICES must contain the latest observation for "+row.name);
    pointCount+=points.length;
    funds.push({fundId:fund.id,provider:fund.provider,name:fund.name,points});
  }
  if(visited.size!==lookup.size)throw new Error("PRICES omits one or more active funds.");
  return {periods,funds,pointCount,fundCount:funds.length,
    missingCount:periods.length*funds.length-pointCount,
    start:periods[0].date,end:periods[periods.length-1].date};
}
function cellValue(cell:ExcelJS.Cell):number|string|null{
  if(cell.value===null||cell.value===undefined)return null;
  if(typeof cell.value==="number"){
    const isPercentage=/%/.test(cell.numFmt??"")&&!/\"%\"/.test(cell.numFmt??"");
    return isPercentage?cell.value*100:cell.value;
  }
  if(typeof cell.value==="string")return cell.value.trim();
  return cell.text?.trim()??null;
}
export function pricesFromWorkbook(book:ExcelJS.Workbook,active:readonly ApprovedFund[]){
  const sheet=book.getWorksheet("PRICES");
  if(!sheet)throw new Error("Monthly workbook must contain its PRICES worksheet.");
  if(String(sheet.getCell(1,1).text).trim()!=="Broker"||
     String(sheet.getCell(1,2).text).trim()!=="Fund Name")
    throw new Error("PRICES must begin with Broker and Fund Name columns.");
  const headers:string[]=[];
  for(let col=3;col<=sheet.columnCount;col++){
    const value=String(sheet.getCell(1,col).text??"").trim();
    if(!value)break;
    headers.push(value);
  }
  const rows:PriceMatrixRow[]=[];
  for(let row=2;row<=sheet.rowCount;row++){
    const provider=String(sheet.getCell(row,1).text??"").trim();
    const name=String(sheet.getCell(row,2).text??"").trim();
    if(!provider&&!name)continue;
    rows.push({provider,name,values:headers.map((_,i)=>cellValue(sheet.getCell(row,i+3)))});
  }
  return validatePriceMatrix(headers,rows,active);
}

