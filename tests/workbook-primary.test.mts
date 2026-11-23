import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {APPROVED_FUNDS} from "../src/lib/approved-funds.ts";
import {workbookFundNames,workbookReturnRows,verifyWorkbookConsistency,matchWorkbookReturn} from "../src/lib/reconciliation/workbook-source.ts";
import {reconcilePdfOnly} from "../src/lib/reconciliation/pdf-only.ts";
import type {FactSheetData} from "../src/lib/reconciliation/engine.ts";

function fixture(){
  const book=new ExcelJS.Workbook();
  const master=book.addWorksheet("FUNDS");
  master.addRow(["Provider","Fund"]);
  const sheetNames:Record<string,string>={
    Aviva:"AVIVA",Zurich:"ZURICH",
    "New Ireland":"New Ireland","Standard Life":"STANDARD"
  };
  for(const name of Object.values(sheetNames)){
    const sheet=book.addWorksheet(name);
    sheet.addRow(["Name","YTD","1m","3m","6m","1yr","3yrs","5yrs","10yrs","Since launch"]);
  }
  const expected:Record<string,number>={
    "Aviva":25,"Zurich":28,"New Ireland":40,"Standard Life":14
  };
  const selected=APPROVED_FUNDS.filter((fund,index)=>
    APPROVED_FUNDS.slice(0,index+1).filter(f=>f.provider===fund.provider).length<=expected[fund.provider]);
  for(const fund of selected){
    const name=fund.id===APPROVED_FUNDS[0].id?"Corrected Official Fund Name":fund.name;
    master.addRow([fund.provider,name]);
    const row=book.getWorksheet(sheetNames[fund.provider])!.addRow(
      [name,12.34,null,null,null,14.56,8.12,null,null,null]
    );
    if(fund.id===APPROVED_FUNDS[0].id)
      row.getCell(2).numFmt='0.00"%"';
  }
  return book;
}
test("Updated workbook is authoritative for exactly 107 names",()=>{
  const book=fixture();
  const funds=workbookFundNames(book);
  assert.equal(funds.length,107);
  assert.notEqual(funds[0].id,APPROVED_FUNDS[0].id);
  assert.equal(funds[0].name,"Corrected Official Fund Name");
  assert.deepEqual(new Set(funds.map(f=>f.id)).size,107);
});
test("Exact provider and name selects the updated performance row",()=>{
  const book=fixture();
  const funds=workbookFundNames(book);
  const rows=workbookReturnRows(book);
  verifyWorkbookConsistency(funds,rows);
  const matched=matchWorkbookReturn(funds[0],rows);
  assert.ok(matched);
  assert.equal(matched.sourceName,"Corrected Official Fund Name");
  assert.equal(matched.returns.ytd,12.34);
  assert.equal(matched.returns.oneYear,14.56);
  assert.equal(matched.returns.tenYear,null);
  const missing=matchWorkbookReturn({...funds[0],name:"No such fund"},rows);
  assert.equal(missing,null);
});
test("Duplicate workbook performance labels must not select an arbitrary row",()=>{
  const book=fixture();
  const f=workbookFundNames(book)[0];
  book.getWorksheet("AVIVA")!.addRow([f.name,1,2,3,4,5,6,7,8,9]);
  assert.equal(matchWorkbookReturn(f,workbookReturnRows(book)),null);
});
test("A renamed PDF cannot override contradictory printed identity",()=>{
  const f={id:"test",provider:"Aviva" as const,name:"Aviva Fixed ESG 80 Series 1"};
  const pdf={importId:"pdf",filename:"Aviva - Aviva Fixed ESG 80 Series 1.pdf",
    providerHint:"Aviva",title:"Aviva Fixed ESG 60 Series 1"} as FactSheetData;
  assert.equal(reconcilePdfOnly(f,[pdf]).factsheetIdentityApproved,false);
});
test("Renamed PDF can assist matching when internally printed title supports it",()=>{
  const f={id:"test",provider:"Aviva" as const,name:"Aviva Fixed ESG 60 Series 1"};
  const pdf={importId:"pdf",filename:"Aviva - Aviva Fixed ESG 60 Series 1.pdf",
    providerHint:"Aviva",title:"Aviva Fixed ESG 60 Series 1"} as FactSheetData;
  assert.equal(reconcilePdfOnly(f,[pdf]).factsheetIdentityApproved,true);
});

test("Workbook fails before data is activated if a provider performance row is missing",()=>{
  const book=fixture();
  book.getWorksheet("AVIVA")!.getRow(2).getCell(1).value="Misnamed Performance Fund";
  const names=workbookFundNames(book),rows=workbookReturnRows(book);
  assert.throws(()=>verifyWorkbookConsistency(names,rows),/Missing or duplicated performance row/);
});
test("Removing a FUNDS record without removing its return row is rejected",()=>{
  const book=fixture();
  const sheet=book.getWorksheet("FUNDS")!;
  sheet.spliceRows(2,1);
  assert.throws(()=>workbookFundNames(book),/107 funds/);
});
test("Names and IDs remain stable when the workbook FUNDS rows are reordered",()=>{
  const book=fixture();
  const before=workbookFundNames(book);
  const sheet=book.getWorksheet("FUNDS")!;
  const a=sheet.getRow(2),b=sheet.getRow(3);
  const valuesA=[a.getCell(1).value,a.getCell(2).value];
  a.getCell(1).value=b.getCell(1).value;
  a.getCell(2).value=b.getCell(2).value;
  b.getCell(1).value=valuesA[0];
  b.getCell(2).value=valuesA[1];
  const after=workbookFundNames(book);
  assert.deepEqual(new Set(after.map(f=>f.id)),new Set(before.map(f=>f.id)));
});
