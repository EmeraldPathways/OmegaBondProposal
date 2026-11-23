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
    const overviewPage=await pdfDocument.getPage(2);
    const extracted=await overviewPage.getTextContent();
    const overview=extracted.items.map(item=>"str" in item?item.str:"").join(" ");
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
    await pdfDocument.destroy();
  }

});
