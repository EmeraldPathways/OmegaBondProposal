import test from "node:test";
import assert from "node:assert/strict";
import {ocrTitleFromPage} from "../src/lib/reconciliation/ocr-title.ts";
import type {ApprovedFund} from "../src/lib/approved-funds.ts";
const funds:ApprovedFund[]=[
  {id:"ni-ethical",provider:"New Ireland",name:"Ethical Managed"},
  {id:"ni-equity",provider:"New Ireland",name:"Ethical Equity"},
  {id:"ni-pension",provider:"New Ireland",name:"Pension Innovator"},
];
test("OCR extracts a printed internal fund title without consulting filename",()=>{
 const text="” Ethical Managed Fund\nVY\n1 NEW IRELAND Performance Factsheet\nASSURANCE\nFund Description: Risk Profile:\n";
 const candidate=ocrTitleFromPage(text,"New Ireland",funds,80);
 assert.equal(candidate?.title,"Ethical Managed Fund");
 assert.ok((candidate?.score??0)>=.95);
});
test("Low OCR confidence cannot establish identity",()=>{
 assert.equal(ocrTitleFromPage("Ethical Managed Fund\nNEW IRELAND","New Ireland",funds,44),null);
});
test("Provider header and section headings cannot establish a fund identity",()=>{
 assert.equal(ocrTitleFromPage("NEW IRELAND\nPerformance Factsheet\nFund Description: Risk Profile","New Ireland",funds,95),null);
});
test("OCR does not invent a missing title from the approved shortlist",()=>{
 assert.equal(ocrTitleFromPage("FUNDS ARE SUBJECT TO MARKET RISK","New Ireland",funds,95),null);
});
