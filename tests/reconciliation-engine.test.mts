import test from "node:test";
import assert from "node:assert/strict";
import {normalName,reconcileOne,similarity,classSignals} from "../src/lib/reconciliation/engine.ts";
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
    assert.equal(result.status,"auto_matched",selected+" was incorrectly rejected");
    assert.equal(result.workbookRow?.sourceName,selected);
  }
});

test("New Ireland factsheet (6) matches its workbook S6 series, but not S2",()=>{
  assert.equal(normalName("Alternative Energy (6)"),normalName("New Ireland Alternative Energy S6"));
  const valid=reconcileOne(approved("New Ireland","Alternative Energy Fund"),
    [row("New Ireland","New Ireland Alternative Energy S6")],
    [pdf("New Ireland","Alternative Energy (6)")]);
  assert.equal(valid.status,"auto_matched");
  const invalid=reconcileOne(approved("New Ireland","Cash"),
    [row("New Ireland","New Ireland Cash S6")],
    [pdf("New Ireland","Cash (Series 2)")]);
  assert.notEqual(invalid.status,"auto_matched");
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
  assert.notEqual(mismatch.status,"auto_matched");
  const series=reconcileOne(approved("Aviva","Av Multi-Asset ESG Act 3"),
    [row("Aviva","Aviva Multi Asset ESG Active 3 Series 1")],
    [pdf("Aviva","Aviva Multi-Asset ESG Active 3 Series B")]);
  assert.notEqual(series.status,"auto_matched");
});

test("Contradictory PDF filenames cannot generate automatic matches",()=>{
  const name="Aviva Fixed ESG 60 Series 1";
  const result=reconcileOne(approved("Aviva","Aviva Fixed ESG 60 Ser 1"),
    [row("Aviva",name)],
    [pdf("Aviva",name,["Filename and PDF title contradiction"])]);
  assert.notEqual(result.status,"auto_matched");
});

test("No factsheet never auto-verifies a workbook row",()=>{
  const x=reconcileOne(approved("New Ireland","Ethical Equity"),
    [row("New Ireland","New Ireland Ethical Equity S6")],[]);
  assert.notEqual(x.status,"auto_matched");
});

test("Duplicate exactly equivalent workbook rows are not auto-matched",()=>{
  const name="Standard Life Euro Global Liquidity";
  const x=reconcileOne(approved("Standard Life",name),
    [row("Standard Life",name,2),row("Standard Life",name,3)],
    [pdf("Standard Life",name)]);
  assert.equal(x.status,"needs_review");
});
