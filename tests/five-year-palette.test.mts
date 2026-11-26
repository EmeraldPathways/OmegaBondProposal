import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CHART_COLORS,FIVE_YEAR_CHART_COLORS}
  from "../src/lib/pdf/five-year-monthly-chart.tsx";

const expected=[
  "#1F77B4","#FF7F0E","#2CA02C","#D62728","#9467BD",
  "#8C564B","#E377C2","#7F7F7F","#BCBD22","#17BECF"
];
test("five-year performance chart uses the requested ten distinct colours",()=>{
  assert.deepEqual([...FIVE_YEAR_CHART_COLORS],expected);
  assert.equal(new Set(FIVE_YEAR_CHART_COLORS).size,10);
  for(const count of [1,3,5,9,10,11,20]){
    const chosen=Array.from({length:count},(_,i)=>
      FIVE_YEAR_CHART_COLORS[i%FIVE_YEAR_CHART_COLORS.length]);
    assert.deepEqual(chosen.slice(0,Math.min(count,10)),expected.slice(0,Math.min(count,10)));
    if(count>10)assert.equal(chosen[10],expected[0]);
  }
});
test("performance line and legend share the same palette without altering thickness",()=>{
  const text=readFileSync(new URL("../src/lib/pdf/five-year-monthly-chart.tsx",import.meta.url),"utf8");
  assert.match(text,/stroke=\{FIVE_YEAR_CHART_COLORS\[i%FIVE_YEAR_CHART_COLORS\.length\]\}/);
  assert.match(text,/backgroundColor:FIVE_YEAR_CHART_COLORS\[i%FIVE_YEAR_CHART_COLORS\.length\]/);
  assert.match(text,/strokeWidth=\{2\.1\} strokeLinecap="round" strokeLinejoin="round"/);
});
test("portfolio allocation palette remains unchanged",()=>{
  assert.deepEqual(CHART_COLORS,[
    "#671E27","#A8995F","#647579","#809485","#AC7471",
    "#9A9C94","#977F70","#76808B","#B27F68","#526177"
  ]);
});
