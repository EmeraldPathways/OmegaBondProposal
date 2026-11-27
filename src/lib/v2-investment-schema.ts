import { z } from "zod";
import { isValidDate } from "@/lib/v2-investment-performance";

const money = z.number().finite().min(0).max(1_000_000_000_000);
const day = z.string().refine(value => !value || isValidDate(value), "Enter a valid calendar date.");
const identifier = z.string().trim().min(1).max(80);
const fundSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(160),
  initialAmount: money.nullable()
});
const valuationSchema = z.object({
  id: identifier, date: day.refine(Boolean), fundId: identifier.nullable(), value: money.nullable()
});
const flowSchema = z.object({
  id: identifier, date: day.refine(Boolean), fundId: identifier.nullable(),
  kind: z.enum(["contribution", "withdrawal"]),
  amount: money.positive(), note: z.string().trim().max(250)
});
export const investmentRecordSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  clientName: z.string().trim().max(120),
  policyName: z.string().trim().max(120),
  provider: z.string().trim().max(120),
  policyNumber: z.string().trim().max(80),
  policyType: z.enum(["Pension", "Post-Retirement (ARF)", "Investment"]),
  investmentDate: day,
  originalInvestment: money,
  funds: z.array(fundSchema).max(40),
  valuations: z.array(valuationSchema).max(2000),
  flows: z.array(flowSchema).max(2000)
}).superRefine((entry, context) => {
  const ids = new Set(entry.funds.map(f => f.id));
  if (ids.size !== entry.funds.length) context.addIssue({code:"custom",message:"Fund IDs must be unique."});
  if (entry.valuations.some(v => v.fundId !== null && !ids.has(v.fundId)) ||
      entry.flows.some(f => f.fundId !== null && !ids.has(f.fundId)))
    context.addIssue({code:"custom",message:"Every fund valuation and transaction must refer to an existing fund."});
  const valuationKeys = entry.valuations.map(v => v.date + "/" + (v.fundId ?? "policy"));
  if (new Set(valuationKeys).size !== valuationKeys.length)
    context.addIssue({code:"custom",message:"There must be only one valuation for each holding on each date."});
  if (new Set(entry.flows.map(f => f.id)).size !== entry.flows.length ||
      new Set(entry.valuations.map(v => v.id)).size !== entry.valuations.length)
    context.addIssue({code:"custom",message:"Transaction and valuation IDs must be unique."});
  if (entry.investmentDate && entry.flows.some(f => f.date < entry.investmentDate))
    context.addIssue({code:"custom",message:"Cash flows cannot predate the original investment."});
});
export type ValidatedInvestmentRecord = z.infer<typeof investmentRecordSchema>;
export const v2DatabaseGuard = (): boolean => {
  if (process.env.VERCEL_PROJECT_ID !== "prj_T1UBJImSQCF9K4OMppOOKBoSvTeO") return false;
  const connection = process.env.DATABASE_URL;
  if (!connection) return false;
  try {
    const host = new URL(connection).hostname;
    return host === "ep-royal-flower-b9y4wcvp.c-7.eu-central-1.aws.neon.tech" ||
      host === "ep-royal-flower-b9y4wcvp-pooler.c-7.eu-central-1.aws.neon.tech";
  } catch {
    return false;
  }
};
