export type PricePoint = { date: string; price: number };
export type Fund = { id: string; name: string; provider: string; code: string; category: string; currency: string; risk: number | null; fee: number | null; prices: PricePoint[]; source: "synthetic" | "session"; factsheetDate?: string; factsheetName?: string };
export type Portfolio = { id: string; title: string; description: string; weights: Record<string,number> };
export type SeriesPoint = { date: string; value: number };
export type Performance = { startDate: string; endDate: string; first: number; last: number; gain: number; returnPct: number; cagrPct: number; volatilityPct: number | null };
