import test from "node:test";
import assert from "node:assert/strict";
import {normalName,reconcileOne,similarity,classSignals} from "../src/lib/reconciliation/engine.ts";
import { parseFactsheetText } from "../src/lib/reconciliation/factsheet.ts";
import type {WorkbookEntry,FactSheetData} from "../src/lib/reconciliation/engine.ts";
import type {ApprovedFund} from "../src/lib/approved-funds.ts";

const empty={ytd:null,oneMonth:null,threeMonth:null,sixMonth:null,oneYear:3.25,threeYear:5.12,fiveYear:null,tenYear:null,sinceLaunch:null};
const approved=(provider:string,name:string):ApprovedFund=>({provider:provider as ApprovedFund["provider"],name,id:"test"});
const row=(provider:string,sourceName:string,rowNumber=2):WorkbookEntry=>({provider,sourceName,rowNumber,returns:{...empty}});
const pdf=(provider:string,title:string,warnings:string[]=[]):FactSheetData=>({
  importId:title,filename:provider+" - "+title+".pdf",providerHint:provider,title,
  moneyMateId:null,asOf:null,launchDate:null,baseCurrency:null,
  amcPct:null,civPct:null,riskRating:null,objective:null,strategy:null,
  holdings:[],allocations:[],chartReferences:[],pageCount:2,
  extractionWarnings:warnings,titleEvidence:"PDF page 1: "+title
});

test("Exact Standard Life MyFolio titles override near-identical neighbouring levels",()=>{
  const names=["I","II","III","IV","V"].map(n=>"Standard Life Ireland MyFolio Active "+n);
  for(const selected of names){
    const result=reconcileOne(approved("Standard Life",selected),
      names.map((n,i)=>row("Standard Life",n,i+2)),
      names.map(n=>pdf("Standard Life",n)));
    assert.equal(result.status,"auto_approved",selected+" was incorrectly rejected");
    assert.equal(result.workbookRow?.sourceName,selected);
  }
});

test("New Ireland factsheet (6) matches its workbook S6 series, but not S2",()=>{
  assert.equal(normalName("Alternative Energy (6)"),normalName("New Ireland Alternative Energy S6"));
  const valid=reconcileOne(approved("New Ireland","Alternative Energy Fund"),
    [row("New Ireland","New Ireland Alternative Energy S6")],
    [pdf("New Ireland","Alternative Energy (6)")]);
  assert.equal(valid.status,"auto_approved");
  const invalid=reconcileOne(approved("New Ireland","Cash"),
    [row("New Ireland","New Ireland Cash S6")],
    [pdf("New Ireland","Cash (Series 2)")]);
  assert.notEqual(invalid.status,"auto_approved");
});

test("Zurich growth or pension performance variants need a supporting share-class identifier",()=>{
  const result=reconcileOne(approved("Zurich","Cautiously Managed"),
    [row("Zurich","Zurich Life Cautiously Managed Pn")],
    [pdf("Zurich","Cautiously Managed Fund")]);
  assert.equal(result.status,"needs_review");
  assert.ok(classSignals("Zurich Life Cautiously Managed Pn").has("basis:pension"));
});

test("ESG 80 must not be matched to ESG 60 and Series B cannot be replaced with Series 1",()=>{
  assert.equal(similarity("Aviva Fixed ESG 80 Series 1","Aviva Fixed ESG 60 Series 1"),0);
  const mismatch=reconcileOne(approved("Aviva","Aviva Fix Alloc ESG 80 Ser 1"),
    [row("Aviva","Aviva Fixed ESG 80 Series 1")],
    [pdf("Aviva","Aviva Fixed ESG 60 Series 1")]);
  assert.notEqual(mismatch.status,"auto_approved");
  const series=reconcileOne(approved("Aviva","Av Multi-Asset ESG Act 3"),
    [row("Aviva","Aviva Multi Asset ESG Active 3 Series 1")],
    [pdf("Aviva","Aviva Multi-Asset ESG Active 3 Series B")]);
  assert.notEqual(series.status,"auto_approved");
});

test("PDF official title establishes identity even when the archived filename is wrong",()=>{
  const title="Aviva Fixed ESG 60 Series 1";
  const misnamed=pdf("Aviva",title,["Filename and PDF title contradiction"]);
  misnamed.filename="Aviva - Fix Alloc ESG 80 Ser 1.pdf";
  const result=reconcileOne(approved("Aviva","Aviva Fixed ESG 60 Ser 1"),
    [row("Aviva",title)], [misnamed]);
  assert.equal(result.status,"auto_approved");
  assert.equal(result.factsheet?.title,title);
});

test("Filename alone is not evidence, even when it exactly matches the shortlist",()=>{
  const name="Standard Life Euro Global Liquidity";
  const untitled=pdf("Standard Life",name);
  untitled.title=null;
  const result=reconcileOne(approved("Standard Life",name),
    [row("Standard Life",name)], [untitled]);
  assert.notEqual(result.status,"auto_approved");
  assert.equal(result.factsheet,null);
});

test("No factsheet never auto-verifies a workbook row",()=>{
  const x=reconcileOne(approved("New Ireland","Ethical Equity"),
    [row("New Ireland","New Ireland Ethical Equity S6")],[]);
  assert.notEqual(x.status,"auto_approved");
});

test("Duplicate exactly equivalent workbook rows are not auto-matched",()=>{
  const name="Standard Life Euro Global Liquidity";
  const x=reconcileOne(approved("Standard Life",name),
    [row("Standard Life",name,2),row("Standard Life",name,3)],
    [pdf("Standard Life",name)]);
  assert.equal(x.status,"suggested");
  assert.notEqual(x.status,"auto_approved");
});

test("PDF internal title wins over deliberately misleading filename",()=>{
  const result=parseFactsheetText({
    importId:"pdf-test",
    filename:"Aviva - Fixed ESG 80 Ser 1.pdf",
    pages:["Fund Factsheet\nAviva Fixed ESG 60 Series 1\n09 November 2026\nMoneyMate ID 25001234\nFund Objective\nCapital growth."]
  });
  assert.equal(result.title,"Aviva Fixed ESG 60 Series 1");
  assert.equal(result.moneyMateId,"25001234");
  assert.ok(!result.extractionWarnings.some(w=>w.toLowerCase().includes("filename")));
});

test("Automatically approves independently corroborated unique internal PDF titles",()=>{
  const fund=approved("Standard Life","Standard Life Ireland MyFolio Market IV");
  const result=reconcileOne(fund,[row("Standard Life",fund.name)],[pdf("Standard Life",fund.name)]);
  assert.equal(result.status,"auto_approved");
});
test("Identity conflicts remain in manual queue",async()=>{
  const {downgradeDuplicateApprovals}=await import("../src/lib/reconciliation/engine.ts");
  const fundA=approved("New Ireland","PruFund Growth");fundA.id="a";
  const fundB=approved("New Ireland","PruFund Growth");fundB.id="b";
  const entries=[row("New Ireland","PruFund Growth")];
  const docs=[pdf("New Ireland","PruFund Growth")];
  const results=downgradeDuplicateApprovals([reconcileOne(fundA,entries,docs),reconcileOne(fundB,entries,docs)]);
  assert.equal(results.filter(r=>r.status==="auto_approved").length,0);
});

test("Factsheet identity can be automatically approved without guessing a missing share class",()=>{
 const fund=approved("New Ireland","Goodbody Global Leaders");
 const result=reconcileOne(fund,[row("New Ireland","Goodbody Global Leaders S6")],
 [pdf("New Ireland","Goodbody Global Leaders")]);
 assert.equal(result.factsheetIdentityApproved,true);
 assert.equal(result.seriesIdentityApproved,false);
 assert.notEqual(result.status,"auto_approved");
});
test("Shared PDF cannot auto-approve multiple distinct shortlisted funds",async()=>{
 const {downgradeDuplicateApprovals}=await import("../src/lib/reconciliation/engine.ts");
 const x=pdf("New Ireland","Alternative Energy (6)");
 const a=reconcileOne({id:"a",provider:"New Ireland",name:"Alternative Energy Fund"},
 [row("New Ireland","New Ireland Alternative Energy S6")],[x]);
 const b=reconcileOne({id:"b",provider:"New Ireland",name:"Alternative Energy Fund"},
 [row("New Ireland","New Ireland Alternative Energy S6")],[x]);
 assert.equal(downgradeDuplicateApprovals([a,b]).filter(r=>r.factsheetIdentityApproved).length,0);
});

test("Aviva white-label PDF uses printed fund title and MoneyMate template, not filename",()=>{
  const source=parseFactsheetText({
    importId:"aviva-white-label",
    filename:"incorrect-upload-name.pdf",
    pages:["| Retirement | Investments | Insurance |\nFund Factsheet\nCantor Fitzgerald Multi-Asset 70 Fund Series C 16 Nov 2026\nMoneyMate ID 25006053\nCIV Charge 0.18%\nAMC 0.50%"]
  });
  assert.equal(source.providerHint,"Aviva");
  assert.equal(source.title,"Cantor Fitzgerald Multi-Asset 70 Fund Series C");
  assert.equal(source.moneyMateId,"25006053");
});
test("Aviva without literal Fund Factsheet heading still recovers printed series title",()=>{
  const source=parseFactsheetText({
    importId:"aviva-aims",
    filename:"random-name.pdf",
    pages:["| Retirement | Investments | Insurance |\nAIMS Target Return Fund (Ireland) Series B 31 August 2026\nMoneyMate ID 25004802\nCIV Charge 0.11%\nAMC 1.10%"]
  });
  assert.equal(source.title,"AIMS Target Return Fund (Ireland) Series B");
  assert.equal(source.providerHint,"Aviva");
});
