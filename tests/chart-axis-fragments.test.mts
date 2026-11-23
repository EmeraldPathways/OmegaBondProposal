import test from "node:test";
import assert from "node:assert/strict";
import {expandAxisAnchors,dateAnchorsFromPdfText} from "../src/lib/reconciliation/chart-digitize.ts";

test("disjoint PDF text operators for half-year date ticks are recombined",()=>{
  const samples=[
    {label:"Jul",x:249,y:506,width:13},
    {label:"'22",x:264,y:506,width:13},
    {label:"Jan",x:282,y:506,width:13},
    {label:"'23",x:297,y:506,width:14},
    {label:"Jul",x:316,y:506,width:13},
    {label:"'23",x:331,y:506,width:14},
  ];
  const expanded=expandAxisAnchors(samples);
  assert.ok(expanded.some(x=>x.label==="Jul '22"));
  assert.ok(expanded.some(x=>x.label==="Jan '23"));
  assert.ok(expanded.some(x=>x.label==="Jul '23"));
});
test("split euro ticks and date ticks are kept as possible label candidates",()=>{
  const pieces=[
    {label:"€",x:221,y:400,width:6},{label:"10,000",x:228,y:400,width:28},
    {label:"2017",x:265,y:510,width:18},{label:"2018",x:315,y:510,width:18},
    {label:"2019",x:365,y:510,width:18}
  ];
  const expanded=expandAxisAnchors(pieces);
  assert.ok(expanded.some(x=>x.label==="€ 10,000"));
  assert.ok(expanded.some(x=>x.label==="2017"));
  assert.ok(expanded.some(x=>x.label==="2019"));
});

test("a single PDF text item containing all x-axis labels yields separate positioned ticks",()=>{
  const anchors=dateAnchorsFromPdfText([
    {label:"Jul '22  Jan '23  Jul '23  Jan '24  Jul '24  Jan '25  Jul '25",
      x:240,y:510,width:300}
  ]);
  assert.equal(anchors.length,7);
  assert.ok(anchors.every((x,i)=>i===0||anchors[i-1].x<x.x));
  assert.ok(anchors[0].value<anchors.at(-1)!.value);
  assert.ok(anchors.at(-1)!.x>470);
});
test("a single PDF text item containing year-only labels yields a linear calendar axis",()=>{
  const anchors=dateAnchorsFromPdfText([
    {label:"2017 2018 2019 2020 2021 2022 2023 2024 2025 2026",
      x:239,y:569,width:300}
  ]);
  assert.equal(anchors.length,10);
  assert.equal(new Date(anchors[0].value).getUTCFullYear(),2017);
  assert.equal(new Date(anchors.at(-1)!.value).getUTCFullYear(),2026);
});
