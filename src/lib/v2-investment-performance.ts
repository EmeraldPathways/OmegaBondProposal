/**
 * Omega V2 actual investment performance. Values are cash amounts in euro.
 * No generated prices, time interpolation, annualisation, or market assumptions.
 * A valuation at the reporting start is treated as an end-of-day opening position;
 * cash flows are counted on (start, end], to avoid double counting.
 */
export type PolicyType = "Pension" | "Post-Retirement (ARF)" | "Investment";
export type FundPosition = { id: string; name: string; initialAmount: number | null };
export type ValuationEntry = { id: string; date: string; fundId: string | null; value: number | null };
export type FlowEntry = { id: string; date: string; fundId: string | null; kind: "contribution" | "withdrawal"; amount: number; note: string };
export type InvestmentRecord = {
  id?: string;
  version?: number;
  clientName: string;
  policyName: string;
  provider: string;
  policyNumber: string;
  policyType: PolicyType;
  /** Optional grouping of several policies for a combined client portfolio. */
  portfolioGroup?: string;
  /** Provider statement control totals are checks, not dated cashflows. */
  statementContributions?: number | null;
  statementWithdrawals?: number | null;
  statementAsOf?: string;
  /** Explicit adviser confirmation; required only before exporting client PDFs. */
  cashFlowsConfirmed?: boolean;
  investmentDate: string;
  originalInvestment: number;
  funds: FundPosition[];
  valuations: ValuationEntry[];
  flows: FlowEntry[];
};
export type PerformanceResult = {
  available: boolean;
  reason: string;
  openingValue: number | null;
  closingValue: number | null;
  contributions: number;
  withdrawals: number;
  netCashFlow: number;
  gain: number | null;
  weightedCapital: number | null;
  cumulativeReturnPct: number | null;
  cashFlowCount: number;
};
export const emptyRecord = (): InvestmentRecord => ({
  clientName: "", policyName: "", provider: "", policyNumber: "",
  policyType: "Investment", investmentDate: "", originalInvestment: 0,
  funds: [], valuations: [], flows: []
});
export const isValidDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const time = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === s;
};
const epoch = (s: string) => Date.parse(s + "T00:00:00Z");
const finiteAmount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const closeEnough = (a: number, b: number) => Math.abs(a - b) <= 0.02;
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Resolve only actual valuations on the exact date; never interpolate. */
export function valuationAt(record: InvestmentRecord, date: string, fundId: string | null = null): number | null {
  if (!isValidDate(date)) return null;
  const found = record.valuations.filter(v => v.date === date && v.fundId === fundId);
  if (found.length > 1) return null;
  if (found.length === 1) return finiteAmount(found[0].value) ? found[0].value : null;

  if (date === record.investmentDate) {
    if (fundId === null && finiteAmount(record.originalInvestment) && record.originalInvestment > 0) {
      return record.originalInvestment;
    }
    const fund = record.funds.find(f => f.id === fundId);
    if (fund && fund.initialAmount !== null && finiteAmount(fund.initialAmount)) return fund.initialAmount;
  }
  if (fundId !== null || !record.funds.length) return null;
  const individual = record.funds.map(f => valuationAt(record, date, f.id));
  return individual.every(v => v !== null) ? individual.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
}

function result(reason: string, open: number | null, close: number | null,
  contributions: number, withdrawals: number, flowCount: number,
  gain: number | null = null, weighted: number | null = null): PerformanceResult {
  return {
    available: reason === "",
    reason, openingValue: open, closingValue: close,
    contributions: rounded(contributions), withdrawals: rounded(withdrawals),
    netCashFlow: rounded(contributions - withdrawals),
    gain: gain === null ? null : rounded(gain),
    weightedCapital: weighted,
    cumulativeReturnPct: reason === "" && gain !== null && weighted !== null ? (gain / weighted) * 100 : null,
    cashFlowCount: flowCount
  };
}

/**
 * Modified Dietz period return:
 * (ending market value - opening market value - signed cashflows)
 * / (opening market value + sum(remaining-period fraction * signed cashflow)).
 * Contributions are positive; withdrawals are negative.
 */
export function calculatePerformance(
  record: InvestmentRecord, start: string, end: string, fundId: string | null = null
): PerformanceResult {
  const opening = valuationAt(record, start, fundId);
  const closing = valuationAt(record, end, fundId);
  const transactions = record.flows.filter(f => isValidDate(f.date) &&
    f.date > start && f.date <= end && (fundId === null || f.fundId === fundId));
  const contributions = transactions.filter(f => f.kind === "contribution").reduce((n, f) => n + f.amount, 0);
  const withdrawals = transactions.filter(f => f.kind === "withdrawal").reduce((n, f) => n + f.amount, 0);
  if (record.flows.some(f => !isValidDate(f.date) || !finiteAmount(f.amount) || f.amount <= 0))
    return result("Complete or remove invalid cash-flow dates and amounts.", opening, closing, contributions, withdrawals, transactions.length);
  if (!isValidDate(start) || !isValidDate(end) || start >= end)
    return result("Select a valid start date before the end date.", opening, closing, contributions, withdrawals, transactions.length);
  if (record.investmentDate && start < record.investmentDate)
    return result("The reporting period cannot start before the investment date.", opening, closing, contributions, withdrawals, transactions.length);
  if (fundId !== null && record.flows.some(f => f.fundId === null && f.date > start && f.date <= end))
    return result("Policy-level cash flows must be allocated to funds for an accurate fund-level return.", opening, closing, contributions, withdrawals, transactions.length);
  if (opening === null || closing === null)
    return result("Enter valuations for both reporting dates (or initial investment at inception).", opening, closing, contributions, withdrawals, transactions.length);
  if (record.valuations.filter(v => v.date === start && v.fundId === fundId).length > 1 ||
      record.valuations.filter(v => v.date === end && v.fundId === fundId).length > 1)
    return result("Duplicate valuations for the same date and holding.", opening, closing, contributions, withdrawals, transactions.length);
  if (transactions.some(f => !finiteAmount(f.amount) || f.amount <= 0))
    return result("Cash-flow amounts must be positive.", opening, closing, contributions, withdrawals, transactions.length);
  const duration = epoch(end) - epoch(start);
  const net = contributions - withdrawals;
  const gain = closing - opening - net;
  const weighted = opening + transactions.reduce((sum, f) => {
    const weight = (epoch(end) - epoch(f.date)) / duration;
    return sum + weight * f.amount * (f.kind === "contribution" ? 1 : -1);
  }, 0);
  if (!(weighted > 0) || !Number.isFinite(weighted))
    return result("Insufficient positive capital to calculate a cumulative return.", opening, closing, contributions, withdrawals, transactions.length, gain, weighted);
  return result("", opening, closing, contributions, withdrawals, transactions.length, gain, weighted);
}
export function checkPolicyValuations(record: InvestmentRecord, date: string): string | null {
  const policyRows = record.valuations.filter(v => v.date === date && v.fundId === null);
  const fundValues = record.funds.map(f => valuationAt(record, date, f.id));
  if (policyRows.length === 1 && record.funds.length > 0 && fundValues.every(v => v !== null)) {
    const sum = fundValues.reduce<number>((n, v) => n + (v ?? 0), 0);
    if (finiteAmount(policyRows[0].value) && !closeEnough(sum, policyRows[0].value))
      return "Fund valuations do not reconcile to the policy valuation for " + date + ".";
  }
  return null;
}
export function portfolioChartSeries(record: InvestmentRecord): { date: string; value: number }[] {
  const days = [...new Set(record.valuations.map(v => v.date).concat(record.investmentDate || []))].filter(isValidDate).sort();
  return days.flatMap(date => {
    const value = valuationAt(record, date);
    return value !== null ? [{ date, value }] : [];
  });
}
