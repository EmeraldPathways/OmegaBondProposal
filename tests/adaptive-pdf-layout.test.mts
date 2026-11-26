import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {brotliDecompressSync} from "node:zlib";
import {renderToBuffer} from "@react-pdf/renderer";
import {getDocumentProxy} from "unpdf";
import Proposal,{type WorkbookProposalData} from "../src/lib/pdf/workbook-proposal.tsx";
import {
  isExpandedPortfolio,splitPerformanceFundGroups,
  paginateExpandedFundDetails
} from "../src/lib/pdf/adaptive-fund-layout.ts";
import {validatePriceMatrix} from "../src/lib/reconciliation/monthly-prices.ts";

const raw=JSON.parse(brotliDecompressSync(readFileSync(
  new URL("../scripts/seeds/omega-prices-nov-2026.json.br",import.meta.url)
)).toString("utf8")) as {
  headers:string[];funds:[string,string,(number|null)[]][];
};
const active=raw.funds.map(([provider,name],index)=>({
  id:"priced-"+index,provider:provider as
    "Aviva"|"Zurich"|"New Ireland"|"Standard Life",name
}));
const priced=validatePriceMatrix(raw.headers,
  raw.funds.map(([provider,name,values])=>({provider,name,values})),active);
const returns={ytd:3,oneMonth:2,threeMonth:4,sixMonth:6,
  oneYear:12.5,threeYear:21.3,fiveYear:37.8,tenYear:83.9,sinceLaunch:90};
const longDescription=Array.from({length:110},(_,i)=>
  ["The fund invests in a diversified portfolio with exposure to global equities.",
  "Risk and returns vary with market conditions, sector and currency exposures.",
  "The fund may use a combination of active management and selected indexed holdings."][i%3]).join(" ");
const details={
  filename:"Official.pdf",title:"Official Fund",date:"24 November 2026",
  moneyMateId:null,baseCurrency:"EUR",riskRating:4,riskProfile:null,
  objective:"Growth through diversification with a long-term investment horizon.",
  description:longDescription,strategy:"Diversified selection of global assets.",
  managedBy:"Investment management team",managementStyle:"Diversified",
  assetMix:"Global equities and fixed interest",sfdrClass:"Article 8",
  riskFactors:["Market risk","Currency exposure"],riskDisclosure:null,
  chargesDisclosure:null,amcPct:0.6,civPct:0.1,chartPages:[]
};
async function renderPortfolio(fundCount:number){
  const weights=Array.from({length:fundCount},(_,i)=>
    i===fundCount-1?100-Math.floor(100/fundCount)*(fundCount-1):
      Math.floor(100/fundCount));
  const funds=priced.funds.slice(0,fundCount).map((record,i)=>({
    id:record.fundId,name:record.name,provider:record.provider,
    weight:weights[i],allocatedAmount:weights[i]*2000,
    priceHistory:record.points,returns,factsheet:details
  }));
  const data:WorkbookProposalData={
    client:"Example Client",adviser:"Omega Financial Management",
    objective:"Long-term growth with diversified holdings.",
    investment:200000,workbookFilename:"Monthly workbook",
    preparedDate:"26 November 2026",
    portfolios:[{id:"a",title:"Balanced Portfolio",description:"Sample",funds}]
  };
  const bytes=await renderToBuffer(Proposal({data}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  const pages:string[]=[];
  for(let page=1;page<=doc.numPages;page++){
    const content=await (await doc.getPage(page)).getTextContent();
    pages.push(content.items.map(item=>"str" in item?item.str:"").join(" "));
  }
  return {pages,funds};
}
test("balanced grouping never strands a one-fund details page for six through ten",()=>{
  const expected={
    6:[3,3],7:[3,2,2],8:[3,3,2],9:[3,3,3],10:[3,3,2,2]
  };
  for(const [count,label] of Object.entries(expected)){
    const n=Number(count),records=Array.from({length:n},(_,i)=>i);
    assert.equal(isExpandedPortfolio(n),true);
    const details=paginateExpandedFundDetails(records);
    assert.deepEqual(details.map(x=>x.length),label);
    assert.deepEqual(details.flat(),records);
    const performance=splitPerformanceFundGroups(records);
    assert.equal(performance.length,1);
    assert.deepEqual(performance[0],records);
  }
  assert.equal(isExpandedPortfolio(5),false);
});
test("five-fund reference format stays exactly four pages: cover/chart/3+2",async()=>{
  const {pages,funds}=await renderPortfolio(5);
  assert.equal(pages.length,4);
  assert.match(pages[0],/Fund allocations and reported cumulative returns/);
  assert.match(pages[1],/Five-year fund performance/);
  assert.match(pages[1],/Portfolio allocation/);
  assert.match(pages[1],/Amount breakdown/);
  assert.ok(!pages[1].includes("Initial investment breakdown"));
  for(let i=0;i<3;i++)assert.ok(pages[2].includes(funds[i].name));
  for(let i=3;i<5;i++)assert.ok(pages[3].includes(funds[i].name));
});
for(let n=6;n<=10;n++){
  test(n+" funds use a clean cover, complete returns, one combined chart and balanced detail pages",async()=>{
    const {pages,funds}=await renderPortfolio(n);
    const groups=paginateExpandedFundDetails(funds);
    assert.equal(pages.length,3+groups.length,
      "Unexpected A4 overflow for "+n+" funds; got "+pages.length+" pages");
    assert.ok(!pages[0].includes("Fund allocations and reported cumulative returns"),
      "Extended cover should not contain a partial returns table");
    assert.match(pages[0],/Portfolio allocation/);
    assert.match(pages[1],/Fund allocations and reported cumulative returns/);
    assert.match(pages[1],/Amount breakdown/);
    assert.ok(pages[1].includes("10 YEARS"));
    for(const fund of funds){
      assert.ok(pages[0].includes(fund.name),
        "Expanded cover allocation omitted "+fund.name);
      assert.ok(pages[1].includes(fund.name),
        "Allocation table omitted "+fund.name);
    }
    assert.equal(splitPerformanceFundGroups(funds).length,1);
    assert.match(pages[2],/Five-year fund performance/);
    assert.ok(!pages[2].includes("Funds represented in this chart"));
    assert.ok(!pages[2].includes("(1 of 2)"));
    for(const fund of funds){
      assert.ok(pages[2].includes(fund.name),
        "The combined performance chart does not identify "+fund.name);
    }
    let offset=0;
    for(let page=0;page<groups.length;page++){
      const printed=pages[3+page];
      assert.match(printed,/Fund details/);
      assert.ok(!printed.includes("Five-year fund performance"),
        "Do not put tiny performance charts inside detail cards");
      const selected=groups[page];
      for(let i=0;i<selected.length;i++){
        assert.ok(printed.includes(selected[i].name),
          "Detail page "+(page+1)+" is missing "+selected[i].name);
      }
      for(const skipped of funds.slice(0,offset))
        assert.ok(!printed.includes(skipped.name),"Repeated earlier fund details");
      offset+=selected.length;
    }
  });
}

