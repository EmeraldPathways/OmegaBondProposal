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
async function renderCount(n:number){
  const funds=history.funds.slice(0,n).map((f,i)=>({
    id:f.fundId,name:f.name,provider:f.provider,
    weight:i===n-1?100-Math.floor(100/n)*(n-1):Math.floor(100/n),
    allocatedAmount:i===n-1?100000-1000*Math.floor(100/n)*(n-1):1000*Math.floor(100/n),
    returns,priceHistory:f.points,factsheet:card
  }));
  const data:WorkbookProposalData={
    client:"Test Client",adviser:"Omega Financial",objective:"Long-term growth",
    investment:100000,workbookFilename:"Monthly workbook",preparedDate:"24 November 2026",
    portfolios:[{id:"a",title:"Proposed Portfolio",description:"Sample",funds}]
  };
  const bytes=await renderToBuffer(Proposal({data}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  const texts:string[]=[];
  for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i);
    const info=await page.getTextContent();
    texts.push(info.items.map(item=>"str" in item?item.str:"").join(" "));
  }
  return {pages:doc.numPages,texts};
}
test("three-fund proposal restores the chart to page 2 and retains full-width fund details",async()=>{
  const sample=await renderCount(3);
  assert.equal(sample.pages,3,"Cover, performance charts, three full-width fund cards");
  assert.match(sample.texts[0],/Fund allocations and reported cumulative returns/);
  assert.match(sample.texts[1],/Five-year fund performance/);
  assert.match(sample.texts[1],/Initial investment breakdown/);
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
  assert.ok(sample.texts[1].includes(history.funds[0].name));
  assert.ok(sample.texts[1].includes(history.funds[4].name));
  assert.ok(sample.texts[2].includes(history.funds[0].name));
  assert.ok(sample.texts[2].includes(history.funds[2].name));
  assert.ok(sample.texts[3].includes(history.funds[3].name));
  assert.ok(sample.texts[3].includes(history.funds[4].name));
  assert.ok(!sample.texts[2].includes("Five-year fund performance"));
  assert.ok(!sample.texts[3].includes("Five-year fund performance"));
});
test("eight selected funds use dedicated allocations, two chart pages and 3+3+2 details",async()=>{
  const sample=await renderCount(8);
  assert.equal(sample.pages,7,"Cover, full returns, two charts and three detail pages.");
  assert.ok(!sample.texts[0].includes("Fund allocations and reported cumulative returns"));
  assert.match(sample.texts[1],/Fund allocations and reported cumulative returns/);
  assert.match(sample.texts[2],/Five-year fund performance/);
  assert.match(sample.texts[3],/Five-year fund performance/);
  for(let i=0;i<8;i++)
    assert.ok(sample.texts[Math.floor(i/3)+4].includes(history.funds[i].name),
      "Missing details for "+history.funds[i].name);
});
