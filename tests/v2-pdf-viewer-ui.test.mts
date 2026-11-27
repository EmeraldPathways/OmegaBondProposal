import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ActualReportPdfViewer from "../src/components/actual-report-pdf-viewer";
import type {InvestmentRecord} from "../src/lib/v2-investment-performance";

const read=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const record:InvestmentRecord={
  clientName:"Illustrative Client",policyName:"Illustrative Pension",
  provider:"Example",policyNumber:"EXAMPLE",
  policyType:"Pension",investmentDate:"2022-01-01",
  originalInvestment:100000,funds:[],flows:[],
  valuations:[{id:"v1",date:"2026-11-26",fundId:null,value:120000}],
  cashFlowsConfirmed:true
};

test("Proposal tab retains the current generated PDF viewer and has a visible incomplete-state placeholder",()=>{
  const workspace=read("src/components/workspace.tsx");
  assert.match(workspace,/readyForProposal&&<ProposalPdfViewer/);
  assert.match(workspace,/Complete the proposal to preview its PDF/);
  const proposal=read("src/components/proposal-pdf-viewer.tsx");
  assert.match(proposal,/iframe className="pdf-document-frame"/);
  assert.match(proposal,/\/api\/proposal\/pdf/);
});
test("Performance and Withdrawals tabs use the same PDF preview and download source",()=>{
  const workspace=read("src/components/performance-workspace.tsx");
  assert.match(workspace,/<ActualReportPdfViewer key=\{mode\}/);
  assert.match(workspace,/id="omega-pdf-viewer"/);
  assert.match(workspace,/reportType:mode/);
  assert.match(workspace,/Omega-Withdrawals-Statement\.pdf/);
  assert.match(workspace,/Omega-Investment-Performance\.pdf/);
  assert.match(workspace,/title="Combined portfolio PDF preview"/);
  const viewer=read("src/components/actual-report-pdf-viewer.tsx");
  assert.match(viewer,/fetch\("\/api\/v2\/performance\/pdf"/);
  assert.match(viewer,/credentials:"same-origin"/);
  assert.match(viewer,/URL\.createObjectURL\(blob\)/);
  assert.match(viewer,/URL\.revokeObjectURL/);
  assert.match(viewer,/anchor\.href=url/);
  assert.match(viewer,/iframe className="pdf-document-frame"/);
  assert.doesNotMatch(viewer,/window\.print\(/);
});
test("Viewer renders a blocked A4 preview with its reason and disabled PDF controls",()=>{
  const html=renderToStaticMarkup(React.createElement(ActualReportPdfViewer,{
    id:"omega-pdf-viewer",title:"Withdrawals PDF preview",
    description:"Test-only report",filename:"Test.pdf",
    request:{record,startDate:"2022-01-01",endDate:"2026-11-26",reportType:"withdrawals"},
    disabledReason:"Confirm the cash-flow ledger first."
  }));
  assert.match(html,/omega-pdf-viewer/);
  assert.match(html,/Withdrawals PDF preview/);
  assert.match(html,/Confirm the cash-flow ledger first/);
  assert.match(html,/PDF preview not yet available/);
  assert.match(html,/disabled=""/);
});
test("Viewer renders on-demand generation before any PDF bytes exist",()=>{
  const html=renderToStaticMarkup(React.createElement(ActualReportPdfViewer,{
    id:"omega-pdf-viewer",title:"Performance PDF preview",
    description:"Test-only report",filename:"Test.pdf",
    request:{record,startDate:"2022-01-01",endDate:"2026-11-26",reportType:"performance"}
  }));
  assert.match(html,/Generate preview/);
  assert.match(html,/Ready to preview/);
  assert.doesNotMatch(html,/<iframe/);
});
