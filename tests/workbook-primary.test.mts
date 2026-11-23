import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {APPROVED_FUNDS} from "../src/lib/approved-funds.ts";
import {workbookFundNames,workbookReturnRows,verifyWorkbookConsistency,matchWorkbookReturn,workbookNameKey,pdfFilenameFundKey} from "../src/lib/reconciliation/workbook-source.ts";
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
test("The exact PDF filename controls linking, even if the internal title differs",()=>{
  const f={id:"test",provider:"Aviva" as const,name:"Aviva Fixed ESG 80 Series 1"};
  const pdf={importId:"pdf",filename:"Aviva Fixed ESG 80 Series 1.pdf",
    providerHint:"Aviva",title:"Aviva Fixed ESG 60 Series 1"} as FactSheetData;
  assert.equal(reconcilePdfOnly(f,[pdf]).factsheetIdentityApproved,true);
});
test("An exact PDF filename links its corresponding workbook fund",()=>{
  const f={id:"test",provider:"Aviva" as const,name:"Aviva Fixed ESG 60 Series 1"};
  const pdf={importId:"pdf",filename:"Aviva Fixed ESG 60 Series 1.pdf",
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

test("Distinct New Ireland Tech and Technology funds retain separate workbook rows, IDs and returns",()=>{
  const book=fixture();
  const master=book.getWorksheet("FUNDS")!;
  const provider=book.getWorksheet("New Ireland")!;
  const names=["New Ireland Tech Indexed","New Ireland Technology Indexed Fund"];
  const masterRows:number[]=[];
  for(let row=2;row<=master.rowCount;row++){
    if(master.getRow(row).getCell(1).value==="New Ireland")masterRows.push(row);
  }
  assert.ok(masterRows.length>=2);
  names.forEach((name,i)=>{
    master.getRow(masterRows[i]).getCell(2).value=name;
    provider.getRow(i+2).getCell(1).value=name;
    provider.getRow(i+2).getCell(7).value=i?80.60:72.53;
  });
  const funds=workbookFundNames(book);
  const rows=workbookReturnRows(book);
  verifyWorkbookConsistency(funds,rows);
  assert.notEqual(workbookNameKey(names[0]),workbookNameKey(names[1]));
  const a=funds.find(f=>f.name===names[0]),b=funds.find(f=>f.name===names[1]);
  assert.ok(a&&b);
  assert.notEqual(a.id,b.id);
  assert.equal(matchWorkbookReturn(a,rows)?.returns.threeYear,72.53);
  assert.equal(matchWorkbookReturn(b,rows)?.returns.threeYear,80.60);
});
test("True duplicate workbook labels still fail validation",()=>{
  const book=fixture();
  const master=book.getWorksheet("FUNDS")!;
  master.getRow(3).getCell(2).value=master.getRow(2).getCell(2).value;
  assert.throws(()=>workbookFundNames(book),/Duplicate fund name/);
});

test("Two similarly named New Ireland PDF titles resolve to different funds without swapping their returns",()=>{
  const tech={id:"tech",provider:"New Ireland" as const,name:"New Ireland Tech Indexed"};
  const technology={id:"technology",provider:"New Ireland" as const,name:"New Ireland Technology Indexed Fund"};
  const pdfs=[
    {importId:"pdf-tech",filename:"New Ireland Tech Indexed.pdf",
      providerHint:"New Ireland",title:"New Ireland Tech Indexed"},
    {importId:"pdf-technology",filename:"New Ireland Technology Indexed Fund.pdf",
      providerHint:"New Ireland",title:"New Ireland Technology Indexed Fund"}
  ] as FactSheetData[];
  const a=reconcilePdfOnly(tech,pdfs);
  const b=reconcilePdfOnly(technology,pdfs);
  assert.equal(a.factsheetIdentityApproved,true);
  assert.equal(b.factsheetIdentityApproved,true);
  assert.equal(a.factsheet?.importId,"pdf-tech");
  assert.equal(b.factsheet?.importId,"pdf-technology");
});
test("Never auto-approve only the other alias-equivalent PDF",()=>{
  const tech={id:"tech",provider:"New Ireland" as const,name:"New Ireland Tech Indexed"};
  const unrelated={
    importId:"pdf-technology",filename:"New Ireland Technology Indexed Fund.pdf",
    providerHint:"New Ireland",title:"New Ireland Technology Indexed Fund"
  } as FactSheetData;
  const match=reconcilePdfOnly(tech,[unrelated]);
  assert.equal(match.factsheetIdentityApproved,false);
});

test("All 107 uniquely named PDFs link automatically using the workbook, not their printed titles",()=>{
  const book=fixture();
  // The user's actual November workbook prefixes provider names in every Fund
  // Name cell. The legacy shortlist fixture does not, and has repeated generic
  // labels (e.g. Cash) across providers.
  const counts=new Map<string,number>();
  const sheetNames:Record<string,string>={
    Aviva:"AVIVA",Zurich:"ZURICH",
    "New Ireland":"New Ireland","Standard Life":"STANDARD"
  };
  const master=book.getWorksheet("FUNDS")!;
  for(let row=2;row<=master.rowCount;row++){
    const provider=String(master.getRow(row).getCell(1).value);
    const name=String(master.getRow(row).getCell(2).value);
    const slot=(counts.get(provider)??0)+1;
    counts.set(provider,slot);
    const qualified=name.startsWith(provider+" ")?name:provider+" "+name;
    master.getRow(row).getCell(2).value=qualified;
    book.getWorksheet(sheetNames[provider])!.getRow(slot+1).getCell(1).value=qualified;
  }
  const funds=workbookFundNames(book),rows=workbookReturnRows(book);
  verifyWorkbookConsistency(funds,rows);
  const pdfs=funds.map((f,i)=>({
    importId:"pdf-"+i,filename:f.name+".pdf",
    // A missing or differing extracted title never changes the exact filename link.
    providerHint:null,title:i%2?"Unrelated printed title":null
  })) as FactSheetData[];
  const matches=funds.map(f=>reconcilePdfOnly(f,pdfs));
  assert.equal(matches.length,107);
  assert.ok(matches.every(r=>r.status==="auto_approved"&&r.factsheetIdentityApproved));
  assert.equal(new Set(matches.map(r=>r.factsheet!.importId)).size,107);
  assert.ok(funds.every(f=>matchWorkbookReturn(f,rows)!==null));
});
test("Duplicate PDF filenames are not silently auto-linked",()=>{
  const f={id:"aviva",provider:"Aviva" as const,name:"Aviva Cash Fund"};
  const pdfs=[
    {importId:"one",filename:"Aviva Cash Fund.pdf",providerHint:null,title:null},
    {importId:"two",filename:"Aviva Cash Fund.PDF",providerHint:null,title:null}
  ] as FactSheetData[];
  const match=reconcilePdfOnly(f,pdfs);
  assert.equal(match.factsheetIdentityApproved,false);
  assert.equal(match.status,"needs_review");
  assert.equal(match.factsheet,null);
});
test("A different series filename never receives an invented exact link",()=>{
  const f={id:"a",provider:"Aviva" as const,name:"Aviva Fixed ESG 80 Series 1"};
  const pdf={importId:"wrong",filename:"Aviva Fixed ESG 60 Series 1.pdf",
    providerHint:"Aviva",title:"Aviva Fixed ESG 80 Series 1"} as FactSheetData;
  assert.equal(reconcilePdfOnly(f,[pdf]).factsheetIdentityApproved,false);
});

test("Proposal filename verification uses the same extension-free identity as auto-matching",()=>{
  const name="Aviva Concept K Series 1";
  const filename="Aviva Concept K Series 1.pdf";
  assert.equal(pdfFilenameFundKey(filename),workbookNameKey(name));
  assert.equal(pdfFilenameFundKey("Aviva Concept K Series 1.PDF"),workbookNameKey(name));
  assert.notEqual(pdfFilenameFundKey("Aviva Concept K Series 2.pdf"),workbookNameKey(name));
  const result=reconcilePdfOnly(
    {id:"aviva-concept",provider:"Aviva",name},
    [{importId:"existing-pdf",filename,title:"Some other title",providerHint:null} as FactSheetData]
  );
  assert.equal(result.status,"auto_approved");
  assert.equal(result.factsheet?.importId,"existing-pdf");
});
test("Every selected user screenshot fund can be matched by its current exact PDF filename",()=>{
  const names=[
    "Standard Life Ireland MyFolio Active V","Zurich International Equity",
    "New Ireland Ethical Equity","Standard Life Ireland MyFolio Market V",
    "New Ireland Goodbody Small Companies","New Ireland PRIME 4",
    "Aviva Concept K Series 1","Aviva Cantor Fitzgerald Multi Asset 30",
    "Aviva L&G Multi-Index V B"
  ];
  for(const name of names){
    const filename=name+".pdf";
    assert.equal(pdfFilenameFundKey(filename),workbookNameKey(name),
      "A matching PDF must not fail the proposal's filename validation: "+name);
  }
});
