import test from "node:test";
import assert from "node:assert/strict";
import {renderToBuffer} from "@react-pdf/renderer";
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
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  assert.ok(bytes.byteLength>3000,"PDF must contain a real rendered document");
  assert.equal(Buffer.from(bytes).subarray(0,4).toString("ascii"),"%PDF");
});
