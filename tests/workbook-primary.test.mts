import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {APPROVED_FUNDS} from "../src/lib/approved-funds.ts";
import {workbookFundNames,workbookReturnRows,matchWorkbookReturn} from "../src/lib/reconciliation/workbook-source.ts";
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
  for(const fund of APPROVED_FUNDS){
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
test("Updated workbook is authoritative for exactly 115 names",()=>{
  const book=fixture();
  const funds=workbookFundNames(book);
  assert.equal(funds.length,115);
  assert.equal(funds[0].id,APPROVED_FUNDS[0].id);
  assert.equal(funds[0].name,"Corrected Official Fund Name");
  assert.deepEqual(new Set(funds.map(f=>f.id)).size,115);
});
test("Exact provider and name selects the updated performance row",()=>{
  const book=fixture();
  const funds=workbookFundNames(book);
  const rows=workbookReturnRows(book);
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
