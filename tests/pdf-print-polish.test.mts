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
  assert.match(source,/rating!==null\?<Rect/);
  assert.match(source,/stroke="#101010" strokeWidth=\{2\.2\}/);
  assert.match(source,/>Risk Rating<\/Text>/);
  assert.doesNotMatch(source,/Risk rating: \{rating===null/);
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
  assert.match(source,/<DoughnutCenterText percentage=\{portfolioWeight\}\/>/);
  assert.match(source,/<DoughnutCenterText percentage=\{percentageAllocated\}\/>/);
  assert.match(source,/x=\{82\} y=\{81\} textAnchor="middle"/);
  assert.match(source,/x=\{82\} y=\{95\} textAnchor="middle"/);
  assert.match(source,/fontSize:compactAllocationNameSize\(f\.name\),width:"72%"/);
  assert.doesNotMatch(source,/\{f\.name\} \(\{f\.weight\.toFixed\(2\)\}%\)/);
  assert.doesNotMatch(source,/position:"absolute",top:26,left:12/);
});


test("axis zero is independent of the original PRICES series values",async()=>{
  const {brotliDecompressSync}=await import("node:zlib");
  const {validatePriceMatrix}=await import("../src/lib/reconciliation/monthly-prices.ts");
  const fixture=JSON.parse(brotliDecompressSync(readFileSync(
    new URL("../scripts/seeds/omega-prices-nov-2026.json.br",import.meta.url)
  )).toString("utf8")) as {
    headers:string[];
    funds:[string,string,(number|string|null)[]][];
  };
  const names=[
    "Aviva Concept K Series 1",
    "Zurich Cautiously Managed",
    "Aviva Global Emerging Market Equity Fund Series C",
    "Standard Life Ireland MyFolio Active I",
    "New Ireland Pension Passive Multi-Asset"
  ];
  const approved=fixture.funds.map(([provider,name],i)=>({
    id:"fund-"+i,provider:provider as "Aviva"|"Zurich"|"New Ireland"|"Standard Life",name
  }));
  const verified=validatePriceMatrix(fixture.headers,
    fixture.funds.map(([provider,name,values])=>({provider,name,values})),approved);
  const observed:{name:string;date:string;returnPct:number}[]=[];
  for(const name of names){
    const row=fixture.funds.find(([,label])=>label===name);
    assert.ok(row,"Expected source row for "+name);
    const fund=verified.funds.find(x=>x.name===name);
    assert.ok(fund,"Expected parsed data for "+name);
    const first=fund.points[0];
    const ix=fixture.headers.findIndex(h=>h===first.label);
    assert.ok(ix>=0);
    const raw=Number(row[2][ix]);
    assert.equal(first.returnPct,raw,"The first plotted return must be taken unchanged from PRICES.");
    observed.push({name,date:first.date,returnPct:first.returnPct});
  }
  assert.equal(observed.length,5);
  const chart=readFileSync(new URL("../src/lib/pdf/five-year-monthly-chart.tsx",import.meta.url),"utf8");
  assert.match(chart,/const values=points\.map\(point=>point\.returnPct\)/);
  assert.match(chart,/axisY\(point\.returnPct\)/);
  assert.doesNotMatch(chart,/point\.returnPct\s*-\s*(?:first|start|initial|baseline)/i);
  console.log("Raw first PRICES observations (no chart rebasing): "+JSON.stringify(observed));
});

test("Amount breakdown prints full long fund names on a single row alongside amounts",async()=>{
  const {renderToBuffer}=await import("@react-pdf/renderer");
  const {getDocumentProxy}=await import("unpdf");
  const {default:Proposal}=await import("../src/lib/pdf/workbook-proposal.tsx");
  const names=[
    ["Aviva","Aviva Concept K Series 1"],
    ["Zurich","Zurich Cautiously Managed"],
    ["Aviva","Aviva Global Emerging Market Equity Fund Series C"],
    ["Standard Life","Standard Life Ireland MyFolio Active I"],
    ["New Ireland","New Ireland Pension Passive Multi-Asset"]
  ];
  const funds=names.map(([provider,name],i)=>({
    provider,name,id:"test-"+i,weight:20,allocatedAmount:98000,
    returns:{ytd:null,oneMonth:null,threeMonth:null,sixMonth:null,oneYear:2,
      threeYear:6,fiveYear:14,tenYear:null,sinceLaunch:null},
    priceHistory:Array.from({length:6},(_,j)=>({
      label:"Test",date:"2026-"+String(j+1).padStart(2,"0")+"-28",
      returnPct:5+i+j*2
    })),
    factsheet:{filename:name+".pdf",title:name,date:null,objective:"The fund seeks growth.",
      strategy:null,moneyMateId:null,baseCurrency:"EUR",riskRating:null,amcPct:null,
      civPct:null,chartPages:[]}
  }));
  const bytes=await renderToBuffer(Proposal({data:{
    client:"Print layout sample",adviser:"Omega Financial",
    objective:"Portfolio example.",investment:490000,
    workbookFilename:"Review",preparedDate:"27 Nov 2026",
    portfolios:[{id:"a",title:"Portfolio A",description:"",funds}]
  }}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  try{
    const page=await doc.getPage(2);
    const extracted=await page.getTextContent();
    const items=extracted.items.filter((item):item is typeof item & {
      str:string;transform:number[];width:number
    }=>"str" in item&&"transform" in item&&"width" in item);
    const start=items.findIndex(item=>item.str==="Amount breakdown");
    assert.ok(start>=0,"Expected a compact amount breakdown section.");
    const amountItems=items.slice(start+1);
    const euros=amountItems.filter(item=>item.str.includes("€98,000.00"));
    assert.equal(euros.length,5);
    for(const [,name] of names){
      const matches=amountItems.filter(item=>item.str===name);
      assert.equal(matches.length,1,"Fund name should print in one line in breakdown: "+name);
      const label=matches[0];
      const amount=euros.find(item=>Math.abs(item.transform[5]-label.transform[5])<3);
      assert.ok(amount,"Fund and amount must share one row: "+name);
      assert.ok(label.transform[4]+label.width<=amount.transform[4]+1,
        "Fund name overlaps euro value in the Amount breakdown: "+name);
    }
  }finally{await doc.destroy();}
});
