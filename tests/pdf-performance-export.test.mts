import test from "node:test";
import assert from "node:assert/strict";
import {createPdfPerformanceWorkbook,type StoredPdfRecord} from "../src/lib/export/pdf-performance-workbook.ts";
import type {FactSheetData, ReportedReturns} from "../src/lib/reconciliation/engine.ts";

const returns:ReportedReturns={
  ytd:7.38,oneMonth:-1.36,threeMonth:-1.21,sixMonth:null,
  oneYear:7.82,threeYear:11.06,fiveYear:null,tenYear:null,sinceLaunch:null
};
const source={
  source:"official_factsheet_pdf" as const,status:"extracted" as const,
  asOf:"09 Nov 2026",asOfPrecision:"day" as const,
  feeBasis:"net_of_amc" as const,returns,cumulativeReturns:{},
  returnKinds:{
    ytd:"period",oneMonth:"period",threeMonth:"period",sixMonth:"not_reported",
    oneYear:"period",threeYear:"annualised",fiveYear:"not_reported",
    tenYear:"not_reported",sinceLaunch:"not_reported"
  } as const,
  calendarYearReturns:{"2025":4.25,"2024":15.67},
  titleInReturnTable:"Aviva Fixed ESG 60 Series 1",
  page:1,evidenceHeading:"Annualised Return to 09 Nov 2026",
  notes:[]
};
const parsed={
  importId:"aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  filename:"Wrong Archive Filename.pdf",
  providerHint:"Aviva",
  title:"Aviva Fixed ESG 60 Series 1",
  performance:source,
  amcPct:0.65,civPct:0.01,moneyMateId:"25007852",
  launchDate:"Jun 2022",baseCurrency:"EUR",
  asOf:"09 Nov 2026",riskRating:4,
  objective:"Long-term growth",strategy:"60% shares, 40% bonds",
  holdings:[],allocations:[],chartReferences:[],
  pageCount:2,extractionWarnings:[],titleEvidence:"PDF page 1"
} as FactSheetData;
const docs:StoredPdfRecord[]=[
  {importId:parsed.importId,filename:"Wrong Archive Filename.pdf",uploadedAt:"2026-11-19",
    status:"parsed",errorMessage:null,data:parsed},
  {importId:"bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb",filename:"Unparsed Source.pdf",
    uploadedAt:"2026-11-19",status:"needs_review",errorMessage:"Missing text layer",data:null}
];
test("Excel PDF export contains exactly the requested worksheets and every PDF",()=>{
  const wb=createPdfPerformanceWorkbook(docs,"https://omega-bond-proposal.vercel.app");
  assert.deepEqual(wb.worksheets.map(s=>s.name),["Performance Tables","Funds List"]);
  const perf=wb.getWorksheet("Performance Tables")!;
  const funds=wb.getWorksheet("Funds List")!;
  assert.equal(perf.rowCount,3);
  assert.equal(funds.rowCount,3);
  assert.equal(perf.getCell("B2").value,"Aviva Fixed ESG 60 Series 1");
  assert.equal(perf.getCell("D2").value,"Wrong Archive Filename.pdf");
  assert.equal(perf.getCell("B3").value,"N/A");
  assert.equal(funds.getCell("C3").value,"Unparsed Source.pdf");
});
test("Published % is not divided by 100; missing horizons are N/A",()=>{
  const wb=createPdfPerformanceWorkbook(docs,"https://omega-bond-proposal.vercel.app");
  const sheet=wb.getWorksheet("Performance Tables")!;
  const read=(key:string)=>sheet.getCell(2,sheet.getColumn(key).number).value;
  assert.equal(read("r_ytd"),7.38);
  assert.equal(read("r_threeYear"),11.06);
  assert.equal(read("r_tenYear"),"N/A");
  assert.equal(read("cal_2025"),4.25);
  assert.equal(read("feeBasis"),"net of amc");
  assert.equal(read("kind_threeYear"),"annualised");
  assert.equal(read("link"),"https://omega-bond-proposal.vercel.app/api/fund-uploads/"+
    docs[0].importId+"/download?view=1");
});
