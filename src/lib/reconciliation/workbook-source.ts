import ExcelJS from "exceljs";
import {APPROVED_FUNDS,type ApprovedFund} from "@/lib/approved-funds";
import {HORIZONS,normalName,type WorkbookEntry,type ReportedReturns} from "./engine";

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

/** The FUNDS worksheet, not the old hard-coded names, controls all 115 names.
 * Stable IDs are assigned by provider row order, retaining portfolio references.
 * Do not reorder funds when correcting names. */
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
    const count=(counters.get(provider)??0)+1;
    counters.set(provider,count);
    const template=APPROVED_FUNDS.filter(f=>f.provider===provider)[count-1];
    if(!template)throw new Error("FUNDS has too many "+provider+" rows.");
    const identity=provider+"|"+normalName(name);
    if(seen.has(identity))throw new Error("Duplicate fund name in FUNDS: "+name);
    seen.add(identity);
    all.push({...template,name});
  }
  if(all.length!==115 ||
      Object.keys(sheets).some(p=>counters.get(p)!==APPROVED_FUNDS.filter(f=>f.provider===p).length))
    throw new Error("FUNDS must contain the original 115 funds with the same provider counts (Aviva 30, Zurich 29, New Ireland 42, Standard Life 14).");
  return all;
}

/** Provider sheets carry the returns. They must not be inferred from the PDF,
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

/** Unique normalized name AND provider match. Ambiguous or absent workbook rows
 * never receive invented or neighbouring performance values. */
export function matchWorkbookReturn(fund:ApprovedFund,rows:WorkbookEntry[]):WorkbookEntry|null{
  const key=normalName(fund.name);
  const matches=rows.filter(r=>r.provider===fund.provider&&normalName(r.sourceName)===key);
  return matches.length===1?matches[0]:null;
}
