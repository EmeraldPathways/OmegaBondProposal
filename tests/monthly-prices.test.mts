import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {brotliDecompressSync} from "node:zlib";
import ExcelJS from "exceljs";
import {validatePriceMatrix,pricesFromWorkbook,parseFiveYearLabel}
  from "../src/lib/reconciliation/monthly-prices.ts";

const source=JSON.parse(brotliDecompressSync(readFileSync(
  new URL("../scripts/seeds/omega-prices-nov-2026.json.br",import.meta.url)
)).toString("utf8")) as {
  sourceSha256:string;headers:string[];funds:[string,string,(number|null)[]][];
};
const approved=source.funds.map(([provider,name],i)=>({
  id:"fund-"+String(i).padStart(3,"0"),
  provider:provider as "Aviva"|"Zurich"|"New Ireland"|"Standard Life",name
}));
test("the uploaded PRICES sheet has 107 exact funds and 6,314 real observations",()=>{
  const parsed=validatePriceMatrix(source.headers,source.funds.map(([provider,name,values])=>
    ({provider,name,values})),approved);
  assert.equal(parsed.fundCount,107);
  assert.equal(parsed.periods.length,61);
  assert.equal(parsed.pointCount,6314);
  assert.equal(parsed.missingCount,213);
  assert.equal(parsed.start,"2021-11-30");
  assert.equal(parsed.end,"2026-11-24");
  assert.equal(parsed.funds.filter(f=>f.points.length===61).length,92);
  assert.equal(parsed.funds.filter(f=>f.points.length<61).length,15);
  assert.equal(parsed.funds.every(f=>f.points.length>0),true);
  assert.match(source.sourceSha256,/^[a-f0-9]{64}$/);
});
test("specific reporting date is not misread as month-end",()=>{
  assert.deepEqual(parseFiveYearLabel("5Y 24-Nov-26"),
    {label:"5Y 24-Nov-26",date:"2026-11-24"});
  assert.deepEqual(parseFiveYearLabel("5Y Feb-24"),
    {label:"5Y Feb-24",date:"2024-02-29"});
});
test("no guessed historical values or duplicate fund names are allowed",()=>{
  const base=source.funds.map(([provider,name,values])=>({provider,name,values}));
  const original=validatePriceMatrix(source.headers,base,approved);
  const a=original.funds.find(f=>f.name==="Aviva Concept K Series 1");
  assert.ok(a);
  assert.equal(a!.points.length,38);
  assert.equal(a!.points[0].date,"2023-10-31");
  const bad=[...base];
  bad[1]={...bad[0]};
  assert.throws(()=>validatePriceMatrix(source.headers,bad,approved),/duplicate fund/i);
  assert.throws(()=>validatePriceMatrix(source.headers,base.slice(1),approved),/one row per FUNDS/);
  const wrongHeaders=[...source.headers];wrongHeaders[15]=wrongHeaders[14];
  assert.throws(()=>validatePriceMatrix(wrongHeaders,base,approved),/chronological/);
});
test("ExcelJS monthly update uses only PRICES, not the FUNDS PRICES tab",()=>{
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet("PRICES");
  sheet.addRow(["Broker","Fund Name",...source.headers]);
  for(const [provider,name,values] of source.funds)
    sheet.addRow([provider,name,...values]);
  const parsed=pricesFromWorkbook(book,approved);
  assert.equal(parsed.pointCount,6314);
  assert.equal(parsed.fundCount,107);
  book.getWorksheet("PRICES")!.name="NOT PRICES";
  assert.throws(()=>pricesFromWorkbook(book,approved),/PRICES worksheet/);
});

