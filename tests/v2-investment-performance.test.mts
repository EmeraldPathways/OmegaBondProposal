import test from "node:test";
import assert from "node:assert/strict";
import {
  type InvestmentRecord, calculatePerformance, valuationAt,
  portfolioChartSeries, checkPolicyValuations
} from "../src/lib/v2-investment-performance";

const base = (): InvestmentRecord => ({
  clientName:"Example (test only)",policyName:"Test pension",provider:"Test",
  policyNumber:"",policyType:"Pension",investmentDate:"2022-01-01",originalInvestment:500000,
  funds:[],flows:[],valuations:[
    {id:"end",date:"2026-11-26",fundId:null,value:675000}
  ]
});
const close=(actual:number|null,expected:number)=>assert.ok(actual!==null&&Math.abs(actual-expected)<1e-8,"Expected "+expected+", got "+actual);

test("lump sum uses true cumulative nonannualised return",()=>{
  const result=calculatePerformance(base(),"2022-01-01","2026-11-26");
  assert.equal(result.available,true);
  assert.equal(result.gain,175000);
  close(result.cumulativeReturnPct,35);
});
test("contribution changes gains and Modified Dietz denominator, not return as profit",()=>{
  const r=base();
  r.flows.push({id:"contribution",date:"2024-01-01",kind:"contribution",amount:100000,fundId:null,note:""});
  const result=calculatePerformance(r,"2022-01-01","2026-11-26");
  const w=(Date.parse("2026-11-26")-Date.parse("2024-01-01"))/(Date.parse("2026-11-26")-Date.parse("2022-01-01"));
  assert.equal(result.gain,75000);
  close(result.cumulativeReturnPct,75000/(500000+w*100000)*100);
});
test("withdrawal is added back when calculating investment gain",()=>{
  const r=base();r.valuations[0].value=550000;
  r.flows=[{id:"draw",date:"2024-01-01",kind:"withdrawal",amount:50000,fundId:null,note:""}];
  const result=calculatePerformance(r,"2022-01-01","2026-11-26");
  const w=(Date.parse("2026-11-26")-Date.parse("2024-01-01"))/(Date.parse("2026-11-26")-Date.parse("2022-01-01"));
  assert.equal(result.gain,100000);
  close(result.cumulativeReturnPct,100000/(500000-w*50000)*100);
});
test("dates outside selected reporting window do not enter cash flows",()=>{
  const r=base();
  r.valuations.push({id:"interim",date:"2024-01-01",fundId:null,value:550000});
  r.flows=[
    {id:"a",date:"2023-01-01",fundId:null,kind:"contribution",amount:25000,note:""},
    {id:"b",date:"2025-01-01",fundId:null,kind:"withdrawal",amount:10000,note:""}
  ];
  const result=calculatePerformance(r,"2024-01-01","2026-11-26");
  assert.equal(result.contributions,0);
  assert.equal(result.withdrawals,10000);
  assert.equal(result.gain,135000);
});
test("end-date cash flows get zero time weight",()=>{
  const r=base();
  r.flows.push({id:"a",date:"2026-11-26",fundId:null,kind:"contribution",amount:50000,note:""});
  const result=calculatePerformance(r,"2022-01-01","2026-11-26");
  assert.equal(result.weightedCapital,500000);
  close(result.cumulativeReturnPct,25);
});
test("missing valuations are never interpolated",()=>{
  const r=base();
  const result=calculatePerformance(r,"2024-01-01","2026-11-26");
  assert.equal(result.available,false);assert.equal(result.cumulativeReturnPct,null);
});
test("fund-level returns require allocations of policy-level flows",()=>{
  const r=base();
  r.funds=[{id:"fund1",name:"Fund 1",initialAmount:500000}];
  r.valuations.push({id:"fend",date:"2026-11-26",fundId:"fund1",value:675000});
  r.flows=[{id:"c",date:"2025-01-01",fundId:null,kind:"contribution",amount:10000,note:""}];
  assert.equal(calculatePerformance(r,"2022-01-01","2026-11-26").available,true);
  assert.equal(calculatePerformance(r,"2022-01-01","2026-11-26","fund1").available,false);
});
test("fund-only snapshots can determine portfolio total",()=>{
  const r=base();r.valuations=[];
  r.funds=[
    {id:"a",name:"A",initialAmount:200000},
    {id:"b",name:"B",initialAmount:300000}
  ];
  r.valuations.push({id:"a1",date:"2026-11-26",fundId:"a",value:300000});
  r.valuations.push({id:"b1",date:"2026-11-26",fundId:"b",value:375000});
  assert.equal(valuationAt(r,"2026-11-26"),675000);
  assert.equal(calculatePerformance(r,"2022-01-01","2026-11-26").gain,175000);
});
test("policy and fund valuation reconciliation warning is explicit",()=>{
  const r=base();r.funds=[{id:"a",name:"A",initialAmount:500000}];
  r.valuations.push({id:"fend",date:"2026-11-26",fundId:"a",value:670000});
  assert.ok(checkPolicyValuations(r,"2026-11-26"));
});
test("recorded chart points are sorted and never fabricated",()=>{
  const r=base();
  r.valuations.push({id:"mid",date:"2024-01-01",fundId:null,value:550000});
  const points=portfolioChartSeries(r);
  assert.deepEqual(points.map(p=>p.date),["2022-01-01","2024-01-01","2026-11-26"]);
});
test("cash-flow-date at start is already included in opening snapshot",()=>{
  const r=base();
  r.flows.push({id:"startflow",date:"2022-01-01",fundId:null,kind:"contribution",amount:10000,note:""});
  const p=calculatePerformance(r,"2022-01-01","2026-11-26");
  assert.equal(p.contributions,0); assert.equal(p.gain,175000);
});
