import test from "node:test";
import assert from "node:assert/strict";
import {renderToBuffer} from "@react-pdf/renderer";
import {getDocumentProxy} from "unpdf";
import WorkbookProposalPDF,{type WorkbookProposalData} from "../src/lib/pdf/workbook-proposal.tsx";

test("A4 PDF can render uploaded-workbook returns and PDF factsheet metadata without price histories",async()=>{
  const data:WorkbookProposalData={
    client:"Sample Client",adviser:"Omega Financial Management",
    objective:"Illustrative portfolio discussion; source verification required.",
    investment:100000,workbookFilename:"Omega Fund FactSheets Performance Nov 2026.xlsx",
    preparedDate:"23 November 2026",
    portfolios:[{id:"a",title:"Portfolio A",description:"Diversified investment selection",
      funds:[{
        id:"test-fund",name:"Aviva Fixed ESG 60 Series 1",provider:"Aviva",
        weight:100,allocatedAmount:100000,
        returns:{ytd:10,oneMonth:1,threeMonth:2,sixMonth:5,
          oneYear:14.56,threeYear:32.75,fiveYear:null,tenYear:null,sinceLaunch:49.2},
        factsheet:{
          filename:"Aviva Fixed ESG 60 Series 1.pdf",
          title:"Aviva Fixed ESG 60 Series 1",
          date:"9 November 2026",moneyMateId:"25007852",baseCurrency:"EUR",
          objective:"To pursue capital growth over the longer term.",
          strategy:"Global equities and bonds in a managed strategic allocation.",
          riskRating:null,amcPct:0.65,civPct:0.01,
          chartPages:["Historical growth chart (page 2)"]
        }
      }]
    }]
  };
  const primary=data.portfolios[0].funds[0];
  primary.weight=33;
  primary.allocatedAmount=33000;
  data.portfolios[0].funds.push(
    {...primary,id:"zurich-fund",provider:"Zurich",name:"Zurich International Equity",
      weight:33,allocatedAmount:33000,
      returns:{...primary.returns,oneYear:10.19,threeYear:36.40}},
    {...primary,id:"standard-fund",provider:"Standard Life",
      name:"Standard Life Vanguard Global Bond Index Fund",
      weight:34,allocatedAmount:34000,
      returns:{...primary.returns,oneYear:-2.05,threeYear:6.09,fiveYear:-9.26}}
  );
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  assert.ok(bytes.byteLength>3000,"PDF must contain a real rendered document");
  assert.equal(Buffer.from(bytes).subarray(0,4).toString("ascii"),"%PDF");
  const serialized=Buffer.from(bytes).toString("latin1");
  const pageCount=(serialized.match(/\/Type\s*\/Page(?!s)\b/g)??[]).length;
  // One cover, ONE portfolio overview with all three requested elements,
  // and one provider details page. Previously these took five pages.
  assert.equal(pageCount,3,"Three-fund portfolio must fit one A4 overview page");
  assert.ok(serialized.includes("/Type /Page"));
  const pdfDocument=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(pdfDocument.numPages,3);
    const coverPage=await pdfDocument.getPage(1);
    const coverText=await coverPage.getTextContent();
    const cover=coverText.items.map(item=>"str" in item?item.str:"").join(" ");
    for(const heading of [
      "Initial investment","Prepared for","Prepared by",
      "Portfolio options","Selected funds","Investment objective",
      "Portfolio allocation","Aviva Fixed ESG 60 Series 1",
      "Zurich International Equity"
    ])assert.ok(cover.includes(heading),
      "First A4 page must contain "+heading);
    const labelY=(label:string)=>{
      const match=coverText.items.find(item=>"str" in item&&item.str===label);
      assert.ok(match&&"transform" in match,
        "Expected PDF position for "+label);
      return match.transform[5];
    };
    // The cover's metadata moves to a compact two-row layout beside
    // the investment amount rather than a large vertical hero.
    assert.ok(labelY("Initial investment")-labelY("Selected funds")<50,
      "Initial investment panel must be vertically compact");
    const overviewPage=await pdfDocument.getPage(2);
    const extracted=await overviewPage.getTextContent();
    const overview=extracted.items.map(item=>"str" in item?item.str:"").join(" ");
    assert.ok(!overview.includes("INVESTMENT BOND PROPOSAL"),
      "Portfolio overview must omit duplicated proposal header text");

    for(const heading of [
      "Cumulative fund performance",
      "Portfolio allocation",
      "Initial investment breakdown",
      "Fund allocations and reported cumulative returns",
      "Aviva Fixed ESG 60 Series 1",
      "Zurich International Equity",
      "10 YEARS"
    ])assert.ok(overview.includes(heading),
      "Portfolio overview page must contain "+heading);
  }finally{
    const disposable=pdfDocument as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }

});

test("cover displays all selected allocation charts without changing portfolio overview and fund-detail pages",async()=>{
  const details={
    filename:null,title:null,date:null,objective:null,strategy:null,
    moneyMateId:null,baseCurrency:null,riskRating:null,
    amcPct:null,civPct:null,chartPages:[]
  };
  const returns={ytd:10,oneMonth:1,threeMonth:4,sixMonth:6,
    oneYear:12,threeYear:35,fiveYear:60,tenYear:90,sinceLaunch:92};
  const portfolios=Array.from({length:3},(_,i)=>({
    id:"portfolio-"+i,title:"Portfolio "+String.fromCharCode(65+i),
    description:"Diversified allocation",
    funds:Array.from({length:3},(_,j)=>({
      id:"fund-"+i+"-"+j,name:"Fund option "+(j+1)+" for portfolio "+(i+1),
      provider:"Aviva",weight:j===2?34:33,allocatedAmount:(j===2?34:33)*2000,
      returns,factsheet:details
    }))
  }));
  const data:WorkbookProposalData={
    client:"Sample Client",adviser:"Omega Financial Management",
    objective:"Review diversified investment opportunities.",
    investment:200000,workbookFilename:"Current workbook",
    preparedDate:"24 November 2026",portfolios
  };
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  const document=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(document.numPages,7,
      "Three portfolios must keep one cover, three overviews and three fund-details pages");
    const coverPage=await document.getPage(1);
    const text=await coverPage.getTextContent();
    const cover=text.items.map(item=>"str" in item?item.str:"").join(" ");
    for(const label of ["Portfolio A","Portfolio B","Portfolio C",
      "Initial investment","Portfolio allocation"])
      assert.ok(cover.includes(label),"Cover is missing "+label);
  }finally{
    const disposable=document as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
});
