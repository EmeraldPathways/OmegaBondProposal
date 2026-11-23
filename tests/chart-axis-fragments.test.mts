import test from "node:test";
import assert from "node:assert/strict";
import {expandAxisAnchors} from "../src/lib/reconciliation/chart-digitize.ts";

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
