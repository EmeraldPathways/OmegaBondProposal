import type { Fund, Portfolio, Performance, SeriesPoint } from "@/lib/types";
import { blendedFee, isValidPortfolio, metrics } from "@/lib/analytics";

export type ProposalInput = {
  client: string;
  adviser: string;
  objective: string;
  investment: number;
  chartWindow: 3 | 5 | 10;
  funds: Fund[];
  portfolios: Portfolio[];
};

export type PortfolioReport = {
  portfolio: Portfolio;
  series: SeriesPoint[];
  performance: Performance | null;
  fee: number | null;
  allocations: { fundName: string; weight: number }[];
};

export type ProposalReport = {
  input: ProposalInput;
  issuedDate: string;
  sourceAsOf: string | null;
  commonStart: string | null;
  enoughHistory: boolean;
  rows: PortfolioReport[];
  chartDates: string[];
  allSynthetic: boolean;
};

/**
 * The same aligned observation dates and initial valuation are used for all
 * strategies. No missing points are interpolated, no additional fees deducted.
 * Input prices are assumed comparable EUR adjusted/total-return series;
 * this demo explicitly must not be used for client advice.
 */
export function buildProposalReport(input: ProposalInput): ProposalReport {
  if (!input.portfolios.every(p => isValidPortfolio(p, input.funds))) {
    throw new Error("All portfolio allocations must total 100%.");
  }
  const ids = new Set(
    input.portfolios.flatMap(p =>
      Object.entries(p.weights).filter(([, weight]) => weight > 0).map(([id]) => id)
    )
  );
  const selected = input.funds.filter(f => ids.has(f.id));
  if (!selected.length || selected.some(f => f.currency !== "EUR")) {
    throw new Error("Only EUR-denominated fund series are supported.");
  }

  const byFund = new Map(selected.map(f => [
    f.id,
    new Map(f.prices.map(p => [p.date, p.price]))
  ]));
  const firstSeries = byFund.get(selected[0].id)!;
  const commonDates = [...firstSeries.keys()]
    .filter(d => [...byFund.values()].every(points => points.has(d)))
    .sort((a, b) => a.localeCompare(b));
  const asOf = commonDates.at(-1) ?? null;

  let dates = commonDates;
  if (asOf) {
    const cutoff = new Date(asOf + "T00:00:00Z");
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - input.chartWindow);
    dates = commonDates.filter(d => d >= cutoff.toISOString().slice(0, 10));
  }
  const commonStart = dates[0] ?? null;
  const spanYears = asOf && commonStart
    ? (Date.parse(asOf + "T00:00:00Z") - Date.parse(commonStart + "T00:00:00Z")) / 86400000 / 365.25
    : 0;
  const enoughHistory = dates.length >= input.chartWindow * 10 &&
    spanYears >= input.chartWindow - 0.12;

  const rows = input.portfolios.map(portfolio => {
    const holdings = Object.entries(portfolio.weights)
      .filter(([,weight])=>weight>0)
      .map(([id,weight])=>({ id, weight, priceAtStart: commonStart ? byFund.get(id)?.get(commonStart) : undefined }));
    const units = holdings.map(h =>
      h.priceAtStart && h.priceAtStart > 0
        ? input.investment * h.weight / 100 / h.priceAtStart : NaN
    );
    const series = enoughHistory && units.every(Number.isFinite)
      ? dates.map(date => ({
        date,
        value: holdings.reduce((sum,h,i)=>
          sum + units[i] * (byFund.get(h.id)?.get(date) ?? NaN), 0)
      }))
      : [];
    const performance = series.length ? metrics(series, input.chartWindow) : null;
    return {
      portfolio,
      series,
      performance,
      fee: blendedFee(portfolio, input.funds),
      allocations: holdings.map(h=>({
        fundName: input.funds.find(f=>f.id===h.id)?.name ?? h.id,
        weight: h.weight
      })),
    };
  });

  return {
    input,
    issuedDate: new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin", day:"numeric",month:"long",year:"numeric"
    }).format(new Date()),
    sourceAsOf: asOf,
    commonStart,
    enoughHistory,
    rows,
    chartDates: enoughHistory ? dates : [],
    allSynthetic: input.funds.every(f=>f.source === "synthetic"),
  };
}
