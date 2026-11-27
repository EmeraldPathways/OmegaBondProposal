import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performanceAxisTicks} from "../src/lib/pdf/five-year-monthly-chart.tsx";

test("zero is a labelled tick for positive, negative and mixed five-year returns",()=>{
  const cases=[
    [0,5,20,90],
    [-30,-12,-2,0],
    [-37,-2,0,45,95],
    [0,0,0],
    [-.1,0,.4]
  ];
  for(const sample of cases){
    const {ticks,domainMin,domainMax,step}=performanceAxisTicks(sample);
    assert.equal(ticks.length,6);
    assert.ok(ticks.some(tick=>tick===0),"0% tick missing for "+sample);
    assert.ok(domainMin<Math.min(...sample)&&domainMax>Math.max(...sample));
    assert.ok(ticks.every((value,i)=>i===0||Math.abs(value-ticks[i-1]-step)<1e-8));
  }
});
test("PDF seven-colour risk bar retains its selected 1–7 segment and meaningful label",()=>{

  const source=readFileSync(new URL("../src/lib/pdf/workbook-proposal.tsx",import.meta.url),"utf8");
  assert.match(source,/const rating=getFundRiskRating\(fund\)\?\.rating\?\?null/);
  assert.match(source,/PDF_RISK_COLORS\.map/);
  assert.match(source,/rating===i\+1\?<Rect/);
  assert.match(source,/stroke="#FFFFFF" strokeWidth=\{2\.8\}/);
  assert.match(source,/Not verified/);
  const match=source.match(/export const PDF_RISK_COLORS=\[([\s\S]*?)\] as const/);
  assert.ok(match);
  const hex=[...match[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map(m=>m[0]);
  assert.equal(hex.length,7);
  assert.equal(new Set(hex).size,7);
});
test("the compact second allocation legend is single-line and retains full fund names",()=>{

  const source=readFileSync(new URL("../src/lib/pdf/workbook-proposal.tsx",import.meta.url),"utf8");
  assert.match(source,/compactAllocationNameSize\(f\.name\)/);
  assert.match(source,/wrap=\{false\} hyphenationCallback=\{word=>\[word\]\}/);
  assert.match(source,/width:68,height:68,position:"relative"/);
  assert.doesNotMatch(source,/fontSize:expanded\?24:multiple\?13:17/);
});
