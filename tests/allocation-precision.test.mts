import test from "node:test";
import assert from "node:assert/strict";
import {allocateInvestment,allocationBasisPoints,displayAllocationTotal,
  isAllocationComplete,moneyCents,remainingAllocationPct,validInvestmentAmount,
  weightBasisPoints} from "../src/lib/allocation-precision.ts";

test("two-decimal weights sum precisely to 100.00%",()=>{
  const weights={first:40.8,second:5.81,third:0.76,last:52.63};
  assert.equal(allocationBasisPoints(weights),10000);
  assert.equal(displayAllocationTotal(weights),"100.00%");
  assert.equal(isAllocationComplete(weights),true);
  assert.equal(remainingAllocationPct(weights),0);
});
test("99.96 is not rounded up to 100.0 or accepted for export",()=>{
  const weights={a:40.8,b:5.81,c:0.76,d:52.59};
  assert.equal(displayAllocationTotal(weights),"99.96%");
  assert.equal(isAllocationComplete(weights),false);
  assert.ok(Math.abs((remainingAllocationPct(weights)??0)-0.04)<1e-10);
  assert.throws(()=>allocateInvestment(2_495_955.74,weights),/100.00/);
});
test("more than two decimals and invalid inputs are rejected",()=>{
  assert.equal(weightBasisPoints(33.333),null);
  assert.equal(isAllocationComplete({a:33.333,b:66.667}),false);
  assert.equal(isAllocationComplete({a:100.01}),false);
  assert.equal(isAllocationComplete({a:100,b:0}),true);
  assert.equal(moneyCents(2_495_955.741),null);
  assert.equal(validInvestmentAmount(2_495_955.74),true);
  assert.equal(validInvestmentAmount(0),false);
});
test("fund cent amounts sum to the exact two-decimal investment",()=>{
  const weights={a:40.8,b:5.81,c:0.76,d:52.63};
  const amounts=allocateInvestment(2_495_955.74,weights);
  assert.equal(Math.round(Object.values(amounts).reduce((a,b)=>a+b,0)*100),249595574);
  assert.equal(amounts.a,1_018_349.94);
  for(const amount of Object.values(amounts)){
    assert.ok(Math.abs(amount*100-Math.round(amount*100))<1e-6);
  }
});
test("largest remainder allocates indivisible cents deterministically",()=>{
  assert.deepEqual(allocateInvestment(0.01,{a:33.33,b:33.33,c:33.34}),
    {a:0,b:0,c:0.01});
  assert.deepEqual(allocateInvestment(100,{a:33.33,b:33.33,c:33.34}),
    {a:33.33,b:33.33,c:33.34});
});
