import "server-only";
import { getNeonSql } from "@/lib/server/neon";

export type StoredFund = {
  fundSeriesId: string;
  fundName: string;
  providerName: string;
  fundCode: string | null;
  unitClass: string | null;
  currency: string;
  category: string | null;
  latestApprovedFactsheet: string | null;
  priceSeriesCount: number;
};

/**
 * Read-only catalogue API for use after the app has an authenticated adviser session.
 * This deliberately does not create an unauthenticated public route.
 */
export async function readStoredFundCatalogue(): Promise<StoredFund[]> {
  const sql = getNeonSql();
  const result = await sql`
    SELECT
      s.id::text AS fund_series_id,
      f.name AS fund_name,
      p.name AS provider_name,
      s.fund_code,
      s.unit_class,
      s.currency,
      f.category,
      (
        SELECT fs.published_on::text
        FROM factsheets fs
        WHERE fs.fund_series_id = s.id AND fs.approved IS TRUE
        ORDER BY fs.published_on DESC NULLS LAST, fs.approved_at DESC NULLS LAST
        LIMIT 1
      ) AS latest_approved_factsheet,
      (
        SELECT COUNT(*)::int FROM price_series ps WHERE ps.fund_series_id = s.id
      ) AS price_series_count
    FROM fund_series s
      JOIN funds f ON f.id = s.fund_id
      JOIN providers p ON p.id = f.provider_id
    WHERE f.active IS TRUE
    ORDER BY p.name, f.name, s.unit_class
  `;
  return result.map(row => ({
    fundSeriesId: String(row.fund_series_id),
    fundName: String(row.fund_name),
    providerName: String(row.provider_name),
    fundCode: row.fund_code == null ? null : String(row.fund_code),
    unitClass: row.unit_class == null ? null : String(row.unit_class),
    currency: String(row.currency).trim(),
    category: row.category == null ? null : String(row.category),
    latestApprovedFactsheet: row.latest_approved_factsheet == null ? null : String(row.latest_approved_factsheet),
    priceSeriesCount: Number(row.price_series_count),
  }));
}

export type StoredPrice = { date: string; unitPrice: string };

/** Exact price-series identity is mandatory; never merge differing unit classes. */
export async function readHistoricalPrices(priceSeriesId: string, limit = 5000): Promise<StoredPrice[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(priceSeriesId)) {
    throw new Error("Invalid price series identifier.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 15000) {
    throw new Error("Invalid historical price limit.");
  }
  const sql = getNeonSql();
  const result = await sql`
    SELECT price_date::text AS date, unit_price::text AS unit_price
    FROM price_observations
    WHERE price_series_id = ${priceSeriesId}::uuid
    ORDER BY price_date DESC
    LIMIT ${limit}
  `;
  return result.map(row => ({ date: String(row.date), unitPrice: String(row.unit_price) })).reverse();
}
