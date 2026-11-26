import test from "node:test";
import assert from "node:assert/strict";
import {
  FUND_RISK_DATA,getFundRiskRating,riskRatingLabel,RISK_RATING_CAVEAT
} from "../src/lib/fund-risk-ratings.ts";

test("107 entries follow the uploaded provider tables exactly by count",()=>{
  assert.equal(FUND_RISK_DATA.length,107);
  const counts=Object.groupBy(FUND_RISK_DATA,x=>x.provider);
  assert.deepEqual(Object.fromEntries(
    Object.entries(counts).map(([key,rows])=>[key,rows?.length])
  ),{"Aviva":25,"New Ireland":40,"Standard Life":14,"Zurich":28});
  const unique=new Set(FUND_RISK_DATA.map(x=>x.provider+"|"+x.name));
  assert.equal(unique.size,107);
});
test("106 numeric ratings and one explicitly unverified lifecycle fund",()=>{
  assert.equal(FUND_RISK_DATA.filter(x=>x.rating!==null).length,106);
  assert.equal(FUND_RISK_DATA.filter(x=>x.rating===null).length,1);
  assert.ok(FUND_RISK_DATA.every(x=>x.rating===null||
    Number.isInteger(x.rating)&&x.rating>=1&&x.rating<=7));
  const iris=getFundRiskRating({provider:"New Ireland",name:"New Ireland Passive IRIS 2033"});
  assert.equal(iris?.rating,null);
  assert.equal(riskRatingLabel(iris!),"Not verified");
});
test("documented ratings match selected entries in each provider table",()=>{
  const examples=[
    ["Aviva","Aviva Fixed ESG 60 Series 1",4],
    ["Aviva","Aviva Cash Fund",1],
    ["New Ireland","New Ireland BNYM Absolute Ret Bond",3],
    ["New Ireland","New Ireland PRIME 5",5],
    ["Standard Life","Standard Life Vanguard Global Bond Index Fund",3],
    ["Standard Life","Standard Life Vanguard Global Stock Index Fund",5],
    ["Zurich","Zurich Gold",5],
    ["Zurich","Zurich Prisma 2",2],
    ["Zurich","Zurich SuperCAPP",2]
  ] as const;
  for(const [provider,name,rating] of examples){
    assert.equal(getFundRiskRating({provider,name})?.rating,rating,name);
    assert.equal(riskRatingLabel({provider,name}),rating+"/7");
  }
  assert.equal(getFundRiskRating({provider:"Zurich",name:"Zurich Unknown Fund"}),undefined);
});
test("minor formatting differences do not silently change a fund risk identity",()=>{
  assert.equal(getFundRiskRating({provider:"New Ireland",name:"New Ireland European Equity"})?.rating,6);
  assert.equal(getFundRiskRating({provider:"ZURICH",name:"Zurich Prisma MAX"})?.rating,5);
  assert.match(RISK_RATING_CAVEAT,/not directly comparable/);
});
