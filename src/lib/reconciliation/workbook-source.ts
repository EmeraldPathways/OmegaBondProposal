import ExcelJS from "exceljs";
import {createHash} from "node:crypto";
import type {ApprovedFund} from "@/lib/approved-funds";
import {HORIZONS,type WorkbookEntry,type ReportedReturns} from "./engine";

const sheets:Record<string,string>={
  "Aviva":"AVIVA","Zurich":"ZURICH",
  "New Ireland":"New Ireland","Standard Life":"STANDARD"
};
const safe=(cell:ExcelJS.Cell):string=>{
  if(typeof cell.value==="number")return String(cell.value);
  if(typeof cell.value==="string")return cell.value.trim();
  return cell.text?.trim()??"";
};
const percent=(cell:ExcelJS.Cell):number|null=>{
  const value=cell.value;
  if(typeof value==="number"){
    // A true spreadsheet percentage is a fraction. A numeric cell labelled
    // with a literal percent sign already holds percentage points.
    return Number.isFinite(value)?
      (/%/.test(cell.numFmt??"")&&!/\"%\"/.test(cell.numFmt??"")?value*100:value):null;
  }
  const str=safe(cell).replace(/[%,]/g,"").trim();
  if(!str||/^(?:-|—|n\/a)$/i.test(str))return null;
  const result=Number(str);
  return Number.isFinite(result)?result:null;
};

export const CURRENT_FUND_COUNTS:Record<string,number>={
  "Aviva":25,"Zurich":28,"New Ireland":40,"Standard Life":14
};
export const CURRENT_FUND_TOTAL=107;

/** Names are authoritative: do not alias "Tech" to "Technology" or drop "Fund".
 * Such abbreviations are only safe for proposing PDF candidates, not identity. */
export function workbookNameKey(name:string):string{
  return name.normalize("NFKC").toLowerCase().replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function fundId(provider:string,name:string):string{
  const prefix=provider.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  const digest=createHash("sha256").update(provider+"|"+workbookNameKey(name)).digest("hex").slice(0,16);
  return prefix+"-"+digest;
}

/** The corrected workbook is the source of all 107 current fund identities.
 * IDs are name-based rather than based on the old 115-name list or worksheet
 * row positions, so reordering provider rows cannot assign a wrong fund ID. */
export function workbookFundNames(book:ExcelJS.Workbook):ApprovedFund[]{
  const master=book.getWorksheet("FUNDS");
  if(!master)throw new Error("Updated workbook must include a FUNDS worksheet.");
  const counters=new Map<string,number>();
  const all:ApprovedFund[]=[];
  const seen=new Set<string>();
  for(let row=2;row<=master.rowCount;row++){
    const provider=safe(master.getRow(row).getCell(1));
    const name=safe(master.getRow(row).getCell(2));
    if(!provider&&!name)continue;
    if(!Object.hasOwn(sheets,provider)||!name||name.length>220)
      throw new Error("FUNDS row "+row+" must contain a valid provider and fund name.");
    counters.set(provider,(counters.get(provider)??0)+1);
    const identity=provider+"|"+workbookNameKey(name);
    if(seen.has(identity))throw new Error("Duplicate fund name in FUNDS: "+name);
    seen.add(identity);
    all.push({id:fundId(provider,name),provider:provider as ApprovedFund["provider"],name});
  }
  if(all.length!==CURRENT_FUND_TOTAL ||
      Object.keys(CURRENT_FUND_COUNTS).some(p=>counters.get(p)!==CURRENT_FUND_COUNTS[p]))
    throw new Error("FUNDS must list 107 funds: Aviva 25, Zurich 28, New Ireland 40, Standard Life 14.");
  return all;
}

/** Provider sheets carry cumulative period returns, including 3/5/10 years. They must not be inferred from the PDF,
 * uploaded filenames or older workbook imports. */
export function workbookReturnRows(book:ExcelJS.Workbook):WorkbookEntry[]{
  const results:WorkbookEntry[]=[];
  for(const [provider,sheetName] of Object.entries(sheets)){
    const sheet=book.getWorksheet(sheetName);
    if(!sheet)throw new Error("Missing provider worksheet: "+sheetName);
    const header=sheet.getRow(1);
    if(safe(header.getCell(1)).toLowerCase()!=="name"||
        safe(header.getCell(9)).toLowerCase()!=="10yrs")
      throw new Error("Unexpected performance headings in "+sheetName);
    for(let row=2;row<=sheet.rowCount;row++){
      const name=safe(sheet.getRow(row).getCell(1));
      if(!name)continue;
      const returns={} as ReportedReturns;
      HORIZONS.forEach((period,index)=>{returns[period]=percent(sheet.getRow(row).getCell(index+2))});
      results.push({provider,sourceName:name,rowNumber:row,returns});
    }
  }
  return results;
}

/** Reject incomplete, duplicated or unmatched provider performance rows.
 * All names must be in the FUNDS list and all FUNDS names must have one row. */
export function verifyWorkbookConsistency(funds:ApprovedFund[],rows:WorkbookEntry[]):void{
  if(rows.length!==funds.length)
    throw new Error("Provider performance sheets must contain exactly "+funds.length+" fund rows.");
  const counts=new Map<string,number>();
  for(const row of rows){
    const identity=row.provider+"|"+workbookNameKey(row.sourceName);
    counts.set(identity,(counts.get(identity)??0)+1);
  }
  for(const fund of funds){
    const key=fund.provider+"|"+workbookNameKey(fund.name);
    if(counts.get(key)!==1)
      throw new Error("Missing or duplicated performance row for "+fund.provider+" / "+fund.name);
  }
  if([...counts].some(([key,count])=>count!==1||!funds.some(f=>f.provider+"|"+workbookNameKey(f.name)===key)))
    throw new Error("Provider sheets include duplicates or fund names not listed in FUNDS.");
}

/** Unique normalized name AND provider match. Ambiguous or absent workbook rows
 * never receive invented or neighbouring performance values. */
export function matchWorkbookReturn(fund:ApprovedFund,rows:WorkbookEntry[]):WorkbookEntry|null{
  const key=workbookNameKey(fund.name);
  const matches=rows.filter(r=>r.provider===fund.provider&&workbookNameKey(r.sourceName)===key);
  return matches.length===1?matches[0]:null;
}
