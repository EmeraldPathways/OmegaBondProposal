-- Pending-review published performance, not time series.
-- Run as a separate migration after examining the existing production schema.
CREATE TABLE IF NOT EXISTS reported_fund_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_import_id uuid NOT NULL REFERENCES imports(id),
  provider_name text NOT NULL,
  fund_name text NOT NULL,
  ytd_pct numeric(16,6),
  one_month_pct numeric(16,6),
  three_month_pct numeric(16,6),
  six_month_pct numeric(16,6),
  one_year_pct numeric(16,6),
  three_year_pct numeric(16,6),
  five_year_pct numeric(16,6),
  ten_year_pct numeric(16,6),
  since_launch_pct numeric(16,6),
  as_of date,
  return_basis text NOT NULL DEFAULT 'unverified',
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_import_id, provider_name, fund_name)
);
CREATE INDEX IF NOT EXISTS reported_fund_returns_provider_idx
ON reported_fund_returns (provider_name, fund_name);
