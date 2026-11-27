import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCombinedPortfolio,reconcileStatementTotals,portfolioWarnings,type InvestmentCase
} from "../src/lib/v2-policy-portfolios";

const initial=():InvestmentCase=>({
  id:"11111111-1111-4111-8111-111111111111",
  clientName:"Illustrative Client",policyName:"Pension A",provider:"Example Provider",
  policyNumber:"X",policyType:"Pension",investmentDate:"2022-01-01",
  originalInvestment:1000,portfolioGroup:"Retirement",
  funds:[],flows:[],valuations:[{id:"A1",date:"2026-11-26",fundId:null,value:1300}]
});
const second=():InvestmentCase=>({
  ...initial(),
  id:"22222222-2222-4222-8222-222222222222",
  policyName:"Pension B",policyNumber:"Y",originalInvestment:500,
  valuations:[{id:"B1",date:"2026-11-26",fundId:null,value:600}]
});
test("combined investment gain is calculated from summed actual values, not average returns",()=>{
  const a=initial(),b=second();
  a.flows.push({id:"a-c",date:"2024-01-01",fundId:null,kind:"contribution",amount:200,note:""});
  b.flows.push({id:"b-w",date:"2025-01-01",fundId:null,kind:"withdrawal",amount:50,note:""});
  const result=calculateCombinedPortfolio([a,b],"2022-01-01","2026-11-26");
  assert.equal(result.available,true);
  assert.equal(result.openingValue,1500);
  assert.equal(result.closingValue,1900);
  assert.equal(result.contributions,200);
  assert.equal(result.withdrawals,50);
  assert.equal(result.gain,250);
  const dur=Date.parse("2026-11-26")-Date.parse("2022-01-01");
  const w1=(Date.parse("2026-11-26")-Date.parse("2024-01-01"))/dur;
  const w2=(Date.parse("2026-11-26")-Date.parse("2025-01-01"))/dur;
  const expected=250/(1500+200*w1-50*w2)*100;
  assert.ok(Math.abs((result.cumulativeReturnPct??0)-expected)<1e-8);
});
test("portfolio report refuses incomplete valuation for any selected policy",()=>{
  const b=second();b.valuations=[];
  const result=calculateCombinedPortfolio([initial(),b],"2022-01-01","2026-11-26");
  assert.equal(result.available,false);assert.equal(result.cumulativeReturnPct,null);
  assert.match(result.reason,/Pension B/);
});
test("portfolio report refuses mixed clients and duplicated policies",()=>{
  const a=initial(),b=second();b.clientName="Unrelated client";
  assert.equal(calculateCombinedPortfolio([a,b],"2022-01-01","2026-11-26").available,false);
  assert.equal(calculateCombinedPortfolio([a,a],"2022-01-01","2026-11-26").available,false);
});
test("statement contributions include original amount once and reconcile actual dated payments",()=>{
  const record=initial();
  record.statementAsOf="2026-11-26";
  record.statementContributions=1200;
  record.statementWithdrawals=50;
  record.flows.push({id:"c",date:"2024-01-01",fundId:null,kind:"contribution",amount:200,note:""});
  record.flows.push({id:"w",date:"2025-01-01",fundId:null,kind:"withdrawal",amount:50,note:""});
  const checks=reconcileStatementTotals(record);
  assert.equal(checks.length,2);
  assert.ok(checks.every(c=>c.matches));
  record.statementWithdrawals=60;
  assert.equal(reconcileStatementTotals(record)[1].difference,-10);
  assert.equal(portfolioWarnings([record],"2022-01-01","2026-11-26").length,1);
});
test("different statement as-of date does not block unrelated shorter report",()=>{
  const record=initial();
  record.statementAsOf="2026-11-26";record.statementContributions=5000;
  assert.equal(portfolioWarnings([record],"2022-01-01","2025-01-01").length,0);
});
