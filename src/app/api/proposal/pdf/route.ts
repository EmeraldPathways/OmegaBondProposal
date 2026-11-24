import {renderToBuffer} from "@react-pdf/renderer";
import {z} from "zod";
import {auth,ADMIN_EMAIL,isLoginConfigured} from "@/auth";
import {getNeonSql} from "@/lib/server/neon";
import {getActiveFunds} from "@/lib/server/active-funds";
import {matchWorkbookReturn,workbookNameKey,pdfFilenameFundKey} from "@/lib/reconciliation/workbook-source";
import type {WorkbookEntry,ReportedReturns,FactSheetData} from "@/lib/reconciliation/engine";
import WorkbookProposalPDF, {
  type WorkbookProposalData,type WorkbookProposalFund,type WorkbookReturnPeriods
} from "@/lib/pdf/workbook-proposal";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const noCache={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const portfolio=z.object({
  id:z.string().trim().min(1).max(30),
  title:z.string().trim().min(1).max(80),
  description:z.string().trim().max(250),
  weights:z.record(z.number().finite().min(0).max(100))
});
const payload=z.object({
  client:z.string().trim().max(120).default(""),
  adviser:z.string().trim().min(1).max(120),
  objective:z.string().trim().min(1).max(600),
  investment:z.number().finite().positive().max(1e9),
  portfolios:z.array(portfolio).min(1).max(3)
});
const periods=[
  "ytd","oneMonth","threeMonth","sixMonth","oneYear",
  "threeYear","fiveYear","tenYear","sinceLaunch"
] as const;
function safeReturns(value:ReportedReturns):WorkbookReturnPeriods{
  const returns={} as WorkbookReturnPeriods;¶»§q«^