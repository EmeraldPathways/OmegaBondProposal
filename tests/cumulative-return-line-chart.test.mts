import test from "node:test";
import assert from "node:assert/strict";
import {
  CUMULATIVE_PERIODS,cumulativeReturnValues,contiguousReturnSegments,
  cumulativeChartDomain,chartFundGroups
} from "../src/lib/pdf/cumulative-return-chart.ts";

test("exactly four discrete 1-, 3-, 5- and 10-year workbook horizons are plotted",()=>{
  assert.deepEqual(CUMULATIVE_PERIODS.map(p=>p.key),
    ["oneYear","threeYear","fiveYear","tenYear"]);
  const values=cumulativeReturnValues({
    oneYear:8.24,threeYear:37.61,fiveYear:52.75,tenYear:121.50
  });
  assert.deepEqual(values,[8.24,37.61,52.75,121.5]);
});
test("missing/invalid periods are blank, not filled with zero or interpolated",()=>{
  const values=cumulativeReturnValues({
    oneYear:0,threeYear:null,fiveYear:28.1,tenYear:undefined
  });
  assert.deepEqual(values,[0,null,28.1,null]);
  assert.deepEqual(contiguousReturnSegments(values),[]);
});
test("line segments break where a period is unavailable",()=>{
  assert.deepEqual(contiguousReturnSegments([12,20,null,58]),[[0,1]]);
  assert.deepEqual(contiguousReturnSegments([null,20,35,60]),[[1,2,3]]);
  assert.deepEqual(contiguousReturnSegments([12,20,35,60]),[[0,1,2,3]]);
});
test("axis domain includes zero and negative workbook percentages",()=>{
  const domain=cumulativeChartDomain([[12,-3,22,95],[null,7,21,null]]);
  assert.ok(domain.min<0&&domain.max>95);
  assert.ok(domain.max>domain.min);
  assert.deepEqual(cumulativeChartDomain([[null,null,null,null]]),{min:-5,max:5});
});
test("every selected fund has a place in a chart, even in 30-fund portfolios",()=>{
  const funds=Array.from({length:30},(_,i)=>({id:"fund-"+i}));
  const groups=chartFundGroups(funds,8);
  assert.deepEqual(groups.map(x=>x.length),[8,8,8,6]);
  assert.deepEqual(groups.flat().map(x=>x.id),funds.map(x=>x.id));
});
