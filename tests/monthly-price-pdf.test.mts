import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {brotliDecompressSync} from "node:zlib";
import {renderToBuffer} from "@react-pdf/renderer";
import {getDocumentProxy} from "unpdf";
import Proposal,{type WorkbookProposalData}
  from "../src/lib/pdf/workbook-proposal.tsx";
import {validatePriceMatrix} from "../src/lib/reconciliation/monthly-prices.ts";

const source=JSON.parse(brotliDecompressSync(readFileSync(
  new URL("../scripts/seeds/omega-prices-nov-2026.json.br",import.meta.url)
)).toString("utf8")) as {
  headers:string[];funds:[string,string,(number|null)[]][];
};
const active=source.funds.map(([provider,name],i)=>({
  id:"f-"+i,provider:provider as "Aviva"|"Zurich"|"New Ireland"|"Standard Life",name
}));
const history=validatePriceMatrix(source.headers,
  source.funds.map(([provider,name,values])=>({provider,name,values})),active);
const returns={ytd:10,oneMonth:1,threeMonth:2,sixMonth:5,
  oneYear:12,threeYear:34,fiveYear:55,tenYear:null,sinceLaunch:90};
const card={filename:"Official.pdf",title:null,date:"24 November 2026",
  objective:"Long-term diversified investment growth with exposure to global capital markets.",
  description:null,strategy:"Index and active holdings.",
  moneyMateId:null,baseCurrency:"EUR",riskRating:3,amcPct:null,civPct:null,
  chartPages:[]};
async function renderCount(n:number,proposalTitle?:string){
  const funds=history.funds.slice(0,n).map((f,i)=>({
    id:f.fundId,name:f.name,provider:f.provider,
    weight:i===n-1?100-Math.floor(100/n)*(n-1):Math.floor(100/n),
    allocatedAmount:i===n-1?100000-1000*Math.floor(100/n)*(n-1):1000*Math.floor(100/n),
    returns,priceHistory:f.points,factsheet:card
  }));
  const data:WorkbookProposalData={
    proposalTitle,
    client:"Test Client",adviser:"Omega Financial",objective:"Long-term growth",
    investment:100000,workbookFilename:"Monthly workbook",preparedDate:"24 November 2026",
    portfolios:[{id:"a",title:"Proposed Portfolio",description:"Sample",funds}]
  };
  const bytes=await renderToBuffer(Proposal({data}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  const texts:string[]=[];
  let chartTitleY:number|null=null;
  let chartPeriodY:number|null=null;
  const chartMarkers:{page:number;label:string;y:number}[]=[];
  for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i);
    const info=await page.getTextContent();
    for(const item of info.items){
      if(!("str" in item)||!("transform" in item))continue;
      if(item.str==="Five-year fund performance")chartTitleY=item.transform[5];
      if(/Five.year fund performance|HISTORICAL PERFORMANCE|Fund performance|OFM Financial|Proposed Portfolio/.test(item.str))
        chartMarkers.push({page:i,label:item.str.slice(0,90),y:item.transform[5]});
      if(item.str.startsWith("Reported cumulative returns (%)"))
        chartPeriodY=item.transform[5];
    }
    texts.push(info.items.map(item=>"str" in item?item.str:"").join(" "));
  }
  return {pages:doc.numPages,texts,chartTitleY,chartPeriodY,chartMarkers};
}
test("three-fund proposal restores the chart to page 2 and retains full-width fund details",async()=>{
  const sample=await renderCount(3);
  assert.equal(sample.pages,3,"Cover, performance charts, three full-width fund cards");
  assert.match(sample.texts[0],/Fund allocations and reported cumulative returns/);
  assert.match(sample.texts[1],/Five-year fund performance/);
  assert.match(sample.texts[1],/Amount breakdown/);
  assert.ok(!sample.texts[1].includes("Initial investment breakdown"));
  for(let i=0;i<3;i++){
    assert.ok(sample.texts[1].includes(history.funds[i].name),
      "The chart legend should identify "+history.funds[i].name);
    assert.ok(sample.texts[2].includes(history.funds[i].name),
      "The next page should contain the detail card for "+history.funds[i].name);
  }
  assert.ok(!sample.texts[2].includes("Five-year fund performance"),
    "Fund detail cards must not repeat the performance chart.");
});
test("five-fund proposal: page one allocations, page two full-size historical chart, then 3+2 details",async()=>{
  const sample=await renderCount(5);
  assert.equal(sample.pages,4,
    "Expected cover, dedicated full-size historical chart, three-fund details, two-fund details.");
  assert.match(sample.texts[0],/Fund allocations and reported cumulative returns/);
  assert.match(sample.texts[1],/Five-year fund performance/);
  assert.match(sample.texts[1],/Reported cumulative returns/);
  assert.match(sample.texts[1],/0%/,"Performance chart must have an explicit 0% tick.");
  assert.match(sample.texts[1],/Nov 2021/,"The axis must state the actual reporting month, not just 2021.");
  assert.match(sample.texts[1],/Nov 2026/,"The end-axis label must include the month.");
  assert.match(sample.texts[1],/Each line begins at its first available reporting date/,
    "The chart must explain source-limited fund start dates.");
  assert.ok(!sample.texts[2].includes("Funds 1–3 of 5"));
  assert.ok(!sample.texts[3].includes("Funds 4–5 of 5"));
  assert.ok(sample.texts[1].includes(history.funds[0].name));
  assert.ok(sample.texts[1].includes(history.funds[4].name));
  assert.ok(sample.texts[2].includes(history.funds[0].name));
  assert.ok(sample.texts[2].includes(history.funds[2].name));
  assert.ok(sample.texts[3].includes(history.funds[3].name));
  assert.ok(sample.texts[3].includes(history.funds[4].name));
  assert.ok(!sample.texts[2].includes("Five-year fund performance"));
  assert.ok(!sample.texts[3].includes("Five-year fund performance"));
});
test("eight selected funds use dedicated allocations, one combined chart and 3+3+2 details",async()=>{
  const sample=await renderCount(8);
  assert.equal(sample.pages,6,"Cover, full returns, one chart and three detail pages.");
  assert.ok(!sample.texts[0].includes("Fund allocations and reported cumulative returns"));
  assert.match(sample.texts[1],/Fund allocations and reported cumulative returns/);
  assert.match(sample.texts[2],/Five-year fund performance/);
  assert.ok(!sample.texts[2].includes("Funds represented in this chart"));
  for(let i=0;i<8;i++){
    assert.ok(sample.texts[2].includes(history.funds[i].name),
      "Combined chart must identify "+history.funds[i].name);
    assert.ok(sample.texts[Math.floor(i/3)+3].includes(history.funds[i].name),
      "Missing details for "+history.funds[i].name);
  }
});


test("PDF accepts a custom proposal title and removes repeated header/footer and cover date",async()=>{
  const customTitle="Private Client Investment Strategy and Fund Recommendations";
  const sample=await renderCount(5,customTitle);
  assert.equal(sample.pages,4,"Custom title should preserve five-fund pagination");
  const text=sample.texts[0].replace(/-\s+(?=[A-Za-z])/g,"");
  assert.ok(text.includes(customTitle),"Cover must use typed title");
  assert.match(sample.texts[0],/I N T R O D U C T I O N/,
    "Cover eyebrow must read INTRODUCTION");
  assert.ok(!sample.texts[0].includes("INVESTMENT BOND & PORTFOLIO ALLOCATION"));
  assert.ok(!sample.texts[0].includes("Prepared 24 November 2026"));
  for(const [i,page] of sample.texts.entries()){
    assert.ok(!page.includes("INVESTMENT BOND PROPOSAL"),
      "Remove fixed proposal label from every header/footer, page "+(i+1));
    assert.ok(!page.includes("Source: the current monthly workbook PRICES tab."),
      "Do not print workbook source disclaimer on chart pages");
  }
  assert.match(sample.texts[1],/Five-year fund performance/);
  assert.match(sample.texts[1],/Reported cumulative returns \(%\)/);
  assert.ok(sample.chartTitleY!==null&&sample.chartPeriodY!==null);
  assert.ok(Math.abs(sample.chartTitleY-sample.chartPeriodY)<3,
    "Reported cumulative returns and the five-year title must share one row");
});

test("the dedicated chart header stays at the same A4 top offset on page 2 or page 3",async()=>{
  const five=await renderCount(5);
  const nine=await renderCount(9);
  assert.match(five.texts[1],/Five-year fund performance/);
  assert.match(nine.texts[2],/Five-year fund performance/);
  assert.ok(five.chartTitleY!==null&&nine.chartTitleY!==null);
  assert.ok(Math.abs(five.chartTitleY-nine.chartTitleY)<1.5,
    `Chart title moved: page 2 y=${five.chartTitleY}, page 3 y=${nine.chartTitleY}. five markers=${JSON.stringify(five.chartMarkers)} nine markers=${JSON.stringify(nine.chartMarkers)}`);
  assert.ok(nine.chartTitleY>620&&nine.chartTitleY<730,
    "The chart content must stay near the top of the printed A4 sheet.");
});

test("a long custom title wraps without introducing extra pages",async()=>{
  const title="Personalised Investment Recommendation for Retirement Planning and Long-Term Capital Preservation";
  const sample=await renderCount(3,title);
  assert.equal(sample.pages,3);
  assert.ok(sample.texts[0].replace(/-\s+(?=[A-Za-z])/g,"").includes(title),
    "Long title should appear completely in the cover PDF");
});


test("both uploaded PDF portfolios start each fund at its first source observation",()=>{
  const selected=new Set([
    "Aviva Concept K Series 1",
    "New Ireland PBIS Exempt Dynamic",
    "New Ireland Goodbody Dividend Income 3",
    "Zurich Prisma 4",
    "New Ireland PRIME 5",
    "Aviva Multi Asset ESG Passive Plus 4 Series 1",
    "New Ireland Pension Passive Multi-Asset"
  ]);
  let seen=0;
  for(const [provider,name,values] of source.funds){
    if(!selected.has(name))continue;
    const validIndices=values.map((v,i)=>v===null?-1:i).filter(i=>i>=0);
    assert.ok(validIndices.length>1,name+" should have a source history");
    const firstIdx=validIndices[0];
    const actual=history.funds.find(f=>f.provider===provider&&f.name===name);
    assert.ok(actual,name+" must exist in the validated active snapshot");
    assert.equal(actual.points[0].date,history.periods[firstIdx].date,
      name+" line must start at the first non-empty uploaded date");
    assert.equal(actual.points[0].returnPct,values[firstIdx],
      name+" first plotted value must match the source (never fabricated 0%)");
    assert.ok(!actual.points.some(p=>p.date<actual.points[0].date),
      "No invented early observations for "+name);
    seen++;
  }
  assert.equal(seen,selected.size);
  const concept=history.funds.find(f=>f.name==="Aviva Concept K Series 1")!;
  assert.equal(concept.points[0].date,"2023-10-31");
  assert.equal(concept.points[0].returnPct,-1.2);
  assert.ok(history.funds.filter(f=>f.points[0].date==="2021-11-30").length>0,
    "Funds with actual Nov 2021 values legitimately appear at the left edge.");
});
