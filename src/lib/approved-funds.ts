/**
 * The 115-fund Omega-approved shortlist, as supplied in the FUNDS tab
 * of the November 2026 performance workbook.
 *
 * These display names are NOT verified performance-series identifiers.
 * Do not map abbreviated names to share classes without explicit review.
 * No monthly unit prices are required or accepted.
 */
export const APPROVED_FUND_GROUPS = {
  "Aviva": [
    "Concept K",
    "Cash",
    "Cantor Fitz MAF 50",
    "Cantor Fitz MAF 70 Series B",
    "Aviva Multi-Asset ESG Act 4",
    "Cantor Fitz MAF 70",
    "Aviva High Yield Eq",
    "AIMs Target Return",
    "High Yield Series 1",
    "Cantor Fitz MAF 30",
    "Aviva MA ESG Passive 3 Ser 1",
    "Aviva 5 Year & 4 Month Fixed D",
    "Self Directed Investment",
    "Av Multi-Asset ESG Act 5",
    "L&G Multi-Index IV",
    "Aviva Fix Alloc ESG 80 Ser 1",
    "Aviva MA ESG Passive 4 Ser 1",
    "L&G Multi-Index V",
    "Aviva 5 Year & 7 Month Fixed D",
    "L&G Multi-Index III",
    "Aviva 5 Year & 6 Month Fixed.D",
    "Av Multi-Asset ESG Act 3",
    "Aviva Irish Property",
    "Global Leaders Equity Fund S1R",
    "Property",
    "Euro Eq ESG Passive Fund",
    "Stewardship Ethical Series 1",
    "Aviva MA ESG Passive 5 Ser 1",
    "Glo Emer Mar EQ SerC",
    "Aviva Fixed ESG 60 Ser 1"
  ],
  "Zurich": [
    "Performance Pension & Invest.",
    "Cautiously Managed",
    "Prisma 4",
    "Dynamic Pension & Invest.",
    "Balanced Pension & Invest.",
    "Prisma 5",
    "Active Asset Allocation",
    "Prisma 3",
    "Cash",
    "Indexed Top Tech 100",
    "Gold",
    "Prisma 2",
    "Prisma Max",
    "Dividend Growth",
    "5 Star 5 Global",
    "Indexed Global Equity",
    "International Equity",
    "5 Star 5 Asia Pacific",
    "TI Global Select Growth",
    "5 Star 5 Europe",
    "Eurozone Equity",
    "Active Fixed Income",
    "5 Star 5 Americas",
    "Indexed Eurozone Equity",
    "Indexed European ExUK Property",
    "Indexed Eurozone Property",
    "SuperCAPP",
    "Indexed Emerging Mkts Equity",
    "Long Bond"
  ],
  "Standard Life": [
    "Standard Life Euro Global Liquidity",
    "Standard Life Ireland MyFolio Active I",
    "Standard Life Ireland MyFolio Active II",
    "Standard Life Ireland MyFolio Active III",
    "Standard Life Ireland MyFolio Active IV",
    "Standard Life Ireland MyFolio Active V",
    "Standard Life Ireland MyFolio Market I",
    "Standard Life Ireland MyFolio Market II",
    "Standard Life Ireland MyFolio Market III",
    "Standard Life Ireland MyFolio Market V",
    "Standard Life Ireland MyFolio Market IV",
    "STANDARD LIFE VANGUARD GLOBAL BOND INDEX FUND",
    "Standard Life Vanguard Global Stock Index Fund",
    "Standard Life Vanguard US 500 Stock Index fund"
  ],
  "New Ireland": [
    "PruFund Cautious",
    "BNYM Absolute Ret Bond",
    "Goodbody Global Leaders",
    "iFunds 4",
    "Cash",
    "PRIME 4",
    "Alternative Energy Fund",
    "NS Tech Indexed Fund",
    "Goodbody Small Companies",
    "Technology Indexed Fund",
    "KBI Alternative Energy Fund",
    "PBIS Exempt Dynamic Fund",
    "Water Fund",
    "PRIME 3",
    "iFunds 5",
    "Ethical Managed",
    "Evergreen Fund",
    "iFunds 3",
    "PruFund Growth",
    "KBI Water Fund",
    "BNYM Global Real Return Fund2",
    "Passive IRIS",
    "World Index (Unhedged)",
    "Income & Growth Fund",
    "Balanced Managed Fund",
    "European Equity",
    "Elements",
    "Pension Innovator",
    "Indexed All Equity",
    "High Yield Equity",
    "IRIS Retirement Fund",
    "Sentinel",
    "Innovator",
    "Pen Passive Multi-Asset",
    "Pension Managed Fund",
    "Retirement Fund",
    "PRIME 5",
    "PRIME Equities",
    "Ethical Equity",
    "Goodbody Dividend Income 3",
    "Goodbody Dividend Income 4",
    "Goodbody Dividend Income 6"
  ]
} as const;
export type ApprovedFundProvider = keyof typeof APPROVED_FUND_GROUPS;

export type ApprovedFund = {
  id: string;
  provider: ApprovedFundProvider;
  name: string;
};

export const APPROVED_FUNDS: ApprovedFund[] = Object.entries(APPROVED_FUND_GROUPS)
  .flatMap(([provider,names]) => (names as readonly string[]).map((name,index) => ({
    id: provider.toLowerCase().replace(/[^a-z0-9]+/g,"-") + "-" + String(index+1).padStart(2,"0"),
    provider: provider as ApprovedFundProvider,
    name,
  })));

export const APPROVED_FUND_IDS = new Set(APPROVED_FUNDS.map(f=>f.id));

export function isApprovedFundId(id: string): boolean {
  return APPROVED_FUND_IDS.has(id);
}
