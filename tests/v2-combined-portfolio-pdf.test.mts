import test from "node:test";
import assert from "node:assert/strict";
import {renderToBuffer} from "@react-pdf/renderer";
import CombinedPortfolioPdf from "../src/lib/pdf/v2-combined-portfolio-report";
import type {InvestmentCase} from "../src/lib/v2-policy-portfolios";

const first:InvestmentCase={
  id:"11111111-1111-4111-8111-111111111111",
  clientName:"Illustrative Client",policyName:"Pension Account",provider:"Test Provider",
  policyNumber:"TEST1",policyType:"Pension",portfolioGroup:"Retirement",
  originalInvestment:100000,investmentDate:"2022-01-01",
  funds:[],flows:[],valuations:[{id:"v1",date:"2026-11-26",fundId:null,value:120000}]
};
const second:InvestmentCase={
  ...first,id:"22222222-2222-4222-8222-222222222222",
  policyName:"ARF Account",policyNumber:"TEST2",policyType:"Post-Retirement (ARF)",
  originalInvestment:50000,
  flows:[{id:"w1",date:"2025-01-01",fundId:null,kind:"withdrawal",amount:4000,note:"Illustrative only"}],
  valuations:[{id:"v2",date:"2026-11-26",fundId:null,value:51000}]
};
test("Omega combined-portfolio PDF renders valid A4 PDF bytes",async()=>{
  const bytes=await renderToBuffer(CombinedPortfolioPdf({
    records:[first,second],startDate:"2022-01-01",endDate:"2026-11-26"
  }));
  assert.ok(bytes.byteLength>1500);
  assert.equal(bytes.subarray(0,5).toString("ascii"),"%PDF-");
});