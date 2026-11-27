import test from "node:test";
import assert from "node:assert/strict";
import {renderToBuffer} from "@react-pdf/renderer";
import PerformancePdf from "../src/lib/pdf/v2-performance-report";
import type {InvestmentRecord} from "../src/lib/v2-investment-performance";

const record:InvestmentRecord={
  clientName:"Illustrative test record",policyName:"Illustrative pension",provider:"Test Provider",
  policyNumber:"TEST-ONLY",policyType:"Pension",investmentDate:"2022-01-01",
  originalInvestment:100000,
  funds:[{id:"f1",name:"Illustrative Fund",initialAmount:100000}],
  valuations:[
    {id:"v1",date:"2022-01-01",fundId:"f1",value:100000},
    {id:"v2",date:"2026-11-26",fundId:"f1",value:127500}
  ],
  flows:[
    {id:"c1",date:"2024-01-01",kind:"contribution",amount:10000,fundId:"f1",note:"Monthly contribution group"},
    {id:"w1",date:"2025-01-01",kind:"withdrawal",amount:2500,fundId:"f1",note:"Withdrawal"}
  ]
};
for(const reportType of ["performance","withdrawals"] as const){
  test("V2 "+reportType+" PDF renders valid PDF bytes",async()=>{
    const bytes=await renderToBuffer(PerformancePdf({
      record,startDate:"2022-01-01",endDate:"2026-11-26",reportType
    }));
    assert.ok(bytes.byteLength>1500);
    assert.equal(bytes.subarray(0,5).toString("ascii"),"%PDF-");
  });
}
