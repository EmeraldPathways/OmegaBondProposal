import {
  Document, Page, Path, Svg, Line, StyleSheet, Text, View
} from "@react-pdf/renderer";
import { OMEGA_LOGO_PATHS } from "@/lib/branding/omega-logo-paths";
import type { ProposalReport } from "./model";

const C = {
  burgundy: "#671E27",
  burgundyDark: "#5D1D25",
  gold: "#988B54",
  grey: "#9A9C94",
  text: "#31342F",
  muted: "#7E827B",
  border: "#E4E3DE",
  pale: "#F7F6F2",
  white: "#FFFFFF",
  sample: "#F8F2F1",
};

const chartColors = [C.burgundy, C.gold, C.grey];

const s = StyleSheet.create({
  page: { backgroundColor: C.white, paddingTop: 40, paddingLeft: 42, paddingRight: 42, paddingBottom: 40, fontFamily: "Helvetica", fontSize: 8.5, color: C.text },
  banner: { height: 45, borderRadius: 8, backgroundColor: C.burgundy, paddingLeft: 14, paddingRight: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bannerLabel: { color: "#DAD4D0", fontSize: 6.9, letterSpacing: 1.1, fontFamily: "Helvetica-Bold" },
  kicker: { color: C.gold, fontSize: 7, letterSpacing: 2.15, fontFamily: "Helvetica-Bold", marginTop: 17, marginBottom: 9 },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  heading: { fontFamily: "Times-Roman", fontSize: 22, color: C.burgundy, lineHeight: 1.2 },
  date: { fontSize: 7.2, color: C.muted },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  hero: { borderRadius: 7, backgroundColor: C.pale, borderWidth: .7, borderColor: C.border, paddingVertical: 11, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: C.muted, fontSize: 7.6 },
  heroValue: { color: C.burgundy, fontFamily: "Helvetica-Bold", fontSize: 15.5 },
  statGrid: { flexDirection: "row", gap: 6, marginTop: 8 },
  stat: { flexGrow: 1, flexBasis: 0, borderWidth: .7, borderColor: C.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 9 },
  statLabel: { fontSize: 6.7, color: C.muted, marginBottom: 6 },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.text },
  card: { marginTop: 11, borderWidth: .7, borderColor: C.border, borderRadius: 8, backgroundColor: "#FAFAF9", padding: 12 },
  cardTitle: { color: C.burgundy, fontFamily: "Times-Roman", fontSize: 15, marginBottom: 10 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap" },
  detail: { width: "50%", marginBottom: 8, paddingRight: 12 },
  detailLabel: { fontSize: 6.6, color: C.muted, marginBottom: 4 },
  detailValue: { fontSize: 8.4, fontFamily: "Helvetica-Bold", color: C.text, lineHeight: 1.3 },
  objective: { fontSize: 8.2, lineHeight: 1.5, color: C.text, marginTop: 2 },
  section: { marginTop: 17 },
  sectionEyebrow: { color: C.gold, fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginBottom: 6 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 9 },
  sectionTitle: { fontFamily: "Times-Roman", fontSize: 15.5, color: C.text },
  sectionAside: { fontSize: 7.1, color: C.muted },
  chartPanel: { borderWidth: .7, borderColor: C.border, borderRadius: 7, paddingTop: 13, paddingBottom: 10, paddingHorizontal: 12, minHeight: 198 },
  chartUnit: { color: C.muted, fontSize: 6.8, marginBottom: 8 },
  chartXAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingHorizontal: 3 },
  chartTick: { color: C.muted, fontSize: 6.7 },
  legend: { flexDirection: "row", gap: 14, marginTop: 9, alignItems: "center", flexWrap: "wrap" },
  legendItem: { flexDirection: "row", gap: 5, alignItems: "center" },
  legendLine: { width: 14, height: 2 },
  legendText: { fontSize: 7, color: C.muted },
  footnote: { fontSize: 7.2, lineHeight: 1.5, color: C.muted, marginTop: 9 },
  page2Kicker: { marginTop: 0 },
  table: { borderWidth: .6, borderColor: C.border, borderBottomWidth: 0 },
  tableHeader: { flexDirection: "row", backgroundColor: "#F3F2EE", borderBottomWidth: .7, borderColor: C.border, minHeight: 27, alignItems: "center" },
  tableRow: { flexDirection: "row", borderBottomWidth: .6, borderColor: C.border, minHeight: 27, alignItems: "center" },
  tableCellLabel: { flex: 1.35, paddingHorizontal: 10, paddingVertical: 6 },
  tableCell: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, alignItems: "flex-end" },
  headerText: { color: C.muted, fontSize: 6.5, letterSpacing: .5, fontFamily: "Helvetica-Bold" },
  rowText: { color: C.text, fontSize: 8.2 },
  rowBold: { color: C.text, fontSize: 8.2, fontFamily: "Helvetica-Bold" },
  rowGold: { color: C.gold, fontSize: 8.2, fontFamily: "Helvetica-Bold" },
  allocationGrid: { flexDirection: "row", gap: 8, marginTop: 9 },
  allocationCard: { flexGrow: 1, flexBasis: 0, borderWidth: .7, borderColor: C.border, borderRadius: 7, padding: 9 },
  allocationTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.4, color: C.burgundy, marginBottom: 7 },
  allocationRow: { flexDirection: "row", justifyContent: "space-between", gap: 5, marginBottom: 5, alignItems: "flex-start" },
  allocationName: { color: C.muted, fontSize: 6.65, lineHeight: 1.3, flex: 1 },
  allocationWeight: { color: C.text, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" },
  notice: { marginTop: 15, borderWidth: .6, borderColor: "#E9DBD9", backgroundColor: C.sample, borderRadius: 6, padding: 10 },
  noticeTitle: { color: C.burgundy, fontFamily: "Helvetica-Bold", fontSize: 7.8, marginBottom: 5 },
  noticeText: { fontSize: 7.4, color: "#6B6562", lineHeight: 1.55 },
  cta: { backgroundColor: C.burgundy, borderRadius: 5, paddingVertical: 10, paddingHorizontal: 12, marginTop: 13 },
  ctaTitle: { fontSize: 6.6, color: "#DAD4D0", letterSpacing: 1.25, marginBottom: 5 },
  ctaText: { color: C.white, fontFamily: "Helvetica-Bold", fontSize: 8.3 },
  regulated: { fontSize: 7.2, color: C.muted, marginTop: 9, lineHeight: 1.45 },
});

const euro = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const percent = (n: number | null, signed = false) => n == null || !Number.isFinite(n) ? "Not available" : (signed && n > 0 ? "+" : "") + n.toFixed(2) + "%";
const dateShort = (sDate: string | null) => sDate ?? "Not available";

function OmegaWhiteLogo() {
  return (
    <Svg width={133} height={34.6} viewBox="0 0 1024 266">
      {OMEGA_LOGO_PATHS.map((d, i) => (
        <Path d={d} key={i} fill="#FFFFFF" fillRule="evenodd" />
      ))}
    </Svg>
  );
}

function Detail({ name, value }: { name: string; value: string }) {
  return <View style={s.detail}><Text style={s.detailLabel}>{name}</Text><Text style={s.detailValue}>{value}</Text></View>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></View>;
}

function Legend({ report }: { report: ProposalReport }) {
  return <View style={s.legend}>
    {report.rows.map((r, index) => <View key={r.portfolio.id} style={s.legendItem}>
      <View style={[s.legendLine, { backgroundColor: chartColors[index] }]} />
      <Text style={s.legendText}>Portfolio {String.fromCharCode(65 + index)} - {r.portfolio.title}</Text>
    </View>)}
  </View>;
}

function PerformanceChart({ report }: { report: ProposalReport }) {
  const nonEmpty = report.rows.filter(r => r.series.length > 1);
  if (!nonEmpty.length) return <View style={s.chartPanel}>
    <Text style={{ color: C.muted, fontSize: 10, textAlign: "center", marginTop: 65 }}>
      Insufficient aligned history for a {report.input.chartWindow}-year comparison.
    </Text>
  </View>;

  const allValues = nonEmpty.flatMap(row => row.series.map(point => point.value));
  const min = Math.min(...allValues) * .92;
  const max = Math.max(...allValues) * 1.04;
  const w = 475, h = 171, left = 10, right = 10, top = 11, bottom = 11;
  const px = (i: number, len: number) => left + i / Math.max(1, len - 1) * (w - left - right);
  const py = (value: number) => top + (max - value) / Math.max(1, max - min) * (h - top - bottom);

  return <View style={s.chartPanel}>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={s.chartUnit}>Illustrative portfolio value (EUR)</Text>
      <Text style={s.chartUnit}>Value at end: {euro(nonEmpty[0].series.at(-1)!.value)}</Text>
    </View>
    <Svg width="100%" height={168} viewBox={"0 0 " + w + " " + h}>
      {[0, 1, 2, 3].map(i => {
        const y = top + (i / 3) * (h - top - bottom);
        return <Line key={i} x1={left} x2={w-right} y1={y} y2={y} stroke={C.border} strokeWidth={.8} strokeDasharray="3 5" />;
      })}
      {report.rows.map((r, index) => {
        if (!r.series.length) return null;
        const d = r.series.map((point,i) =>
          (i === 0 ? "M" : "L") + px(i,r.series.length).toFixed(2) + "," + py(point.value).toFixed(2)
        ).join(" ");
        return <Path key={r.portfolio.id} d={d} stroke={chartColors[index]} strokeWidth={2.4} fill="none" />;
      })}
    </Svg>
    <View style={s.chartXAxis}>
      <Text style={s.chartTick}>{dateShort(report.commonStart)}</Text>
      <Text style={s.chartTick}>{dateShort(report.sourceAsOf)}</Text>
    </View>
    <Legend report={report} />
  </View>;
}

function TableRow({ label, values, highlight = false }: { label: string; values: string[]; highlight?: boolean }) {
  return <View style={s.tableRow}>
    <View style={s.tableCellLabel}><Text style={s.rowText}>{label}</Text></View>
    {values.map((value,i)=><View key={i} style={s.tableCell}><Text style={highlight ? s.rowGold : s.rowBold}>{value}</Text></View>)}
  </View>;
}

function AnnualRows({ report }: { report: ProposalReport }) {
  const years = report.input.chartWindow;
  const start = report.commonStart ? new Date(report.commonStart + "T00:00:00Z") : null;
  const values: { label: string; cells: string[] }[] = [];
  values.push({ label: "At start", cells: report.rows.map(()=>euro(report.input.investment)) });
  if (!report.enoughHistory || !start) return values;
  for (let year = 1; year <= years; year++) {
    const target = new Date(start);
    target.setUTCFullYear(target.getUTCFullYear()+year);
    const targetDate = target.toISOString().slice(0,10);
    const cells = report.rows.map(row => {
      const previous = row.series.filter(p=>p.date <= targetDate).at(-1);
      if (!previous) return "Not available";
      const lag = (Date.parse(targetDate+"T00:00:00Z") - Date.parse(previous.date+"T00:00:00Z"))/86400000;
      return lag <= 47 ? euro(previous.value) : "Not available";
    });
    values.push({ label: "Year " + year, cells });
  }
  return values;
}

export default function OmegaProposalPDF({ report }: { report: ProposalReport }) {
  const { input } = report;
  const count = report.rows.length;
  const dis = report.allSynthetic
    ? "All fund prices, performance, risk scores and charges in this document are synthetic demonstration data. They are not actual provider figures and must not be used for a client recommendation."
    : "Prices include temporary browser-session data that have not been independently verified or approved. These figures are demonstration-only and must not be distributed as an investment recommendation.";
  return (
    <Document title="Omega Investment Bond Proposal - Demonstration" author="Omega Financial Management" subject="Investment bond comparison - unverified demonstration data" language="en-IE">
      <Page size="A4" style={s.page}>
        <View style={s.banner}>
          <OmegaWhiteLogo />
          <Text style={s.bannerLabel}>CLIENT PROPOSAL - DEMO</Text>
        </View>
        <Text style={s.kicker}>INVESTMENT BOND & PORTFOLIO ANALYSIS</Text>
        <View style={s.headingRow}>
          <Text style={s.heading}>Investment bond proposal</Text>
          <Text style={s.date}>Prepared {report.issuedDate}</Text>
        </View>
        <View style={s.rule} />
        <View style={s.hero}>
          <Text style={s.label}>Initial investment</Text>
          <Text style={s.heroValue}>{euro(input.investment)}</Text>
        </View>
        <View style={s.statGrid}>
          {report.rows.map((r,index)=><Stat key={r.portfolio.id} label={"Portfolio " + String.fromCharCode(65+index) + " - "+ input.chartWindow + "-year return*"} value={percent(r.performance?.returnPct ?? null, true)} />)}
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Proposal details</Text>
          <View style={s.detailGrid}>
            <Detail name="Prepared for" value={input.client || "Example Client"} />
            <Detail name="Prepared by" value={input.adviser || "Omega Financial Management"} />
            <Detail name="Comparison strategies" value={String(count) + " portfolios"} />
            <Detail name="Historical review period" value={String(input.chartWindow) + " years to " + dateShort(report.sourceAsOf)} />
          </View>
          <Text style={s.detailLabel}>Investment objective</Text>
          <Text style={s.objective}>{input.objective}</Text>
        </View>
        <View style={s.section}>
          <Text style={s.sectionEyebrow}>VISUAL OVERVIEW</Text>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Historical portfolio value</Text>
            <Text style={s.sectionAside}>Aligned observation dates</Text>
          </View>
          <PerformanceChart report={report} />
          <Text style={s.footnote}>* Demonstration only. Historical illustrations use aligned EUR prices and a buy-and-hold method, without rebalancing. Portfolio fees may already be reflected in unit prices.</Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={[s.sectionEyebrow, s.page2Kicker]}>YEAR-BY-YEAR DETAIL</Text>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Historical portfolio values</Text>
          <Text style={s.sectionAside}>Amounts in euro - {input.chartWindow}-year sample</Text>
        </View>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <View style={s.tableCellLabel}><Text style={s.headerText}>YEAR</Text></View>
            {report.rows.map((r,i)=><View key={r.portfolio.id} style={s.tableCell}><Text style={s.headerText}>PORTFOLIO {String.fromCharCode(65+i)}</Text></View>)}
          </View>
          {AnnualRows({ report }).map((row,i)=><TableRow key={i} label={row.label} values={row.cells} highlight={i>0}/>)}
        </View>

        <View style={s.section}>
          <Text style={s.sectionEyebrow}>COMPARATIVE OVERVIEW</Text>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Performance and charges</Text>
            <Text style={s.sectionAside}>Based on shared source dates</Text>
          </View>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <View style={s.tableCellLabel}><Text style={s.headerText}>MEASURE</Text></View>
              {report.rows.map((r,i)=><View key={r.portfolio.id} style={s.tableCell}><Text style={s.headerText}>PORTFOLIO {String.fromCharCode(65+i)}</Text></View>)}
            </View>
            <TableRow label={input.chartWindow + "-year cumulative return*"} values={report.rows.map(r=>percent(r.performance?.returnPct??null,true))} highlight />
            <TableRow label="Annualised return*" values={report.rows.map(r=>percent(r.performance?.cagrPct??null))} />
            <TableRow label="Annualised volatility*" values={report.rows.map(r=>percent(r.performance?.volatilityPct??null))} />
            <TableRow label="Indicative fund charges*" values={report.rows.map(r=>percent(r.fee))} />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionEyebrow}>FUND ALLOCATION</Text>
          <Text style={s.sectionTitle}>Portfolio composition</Text>
          <View style={s.allocationGrid}>
            {report.rows.map((r,index)=><View key={r.portfolio.id} style={s.allocationCard}>
              <Text style={s.allocationTitle}>Portfolio {String.fromCharCode(65+index)}</Text>
              <Text style={{ fontSize: 7, color: C.muted, marginBottom: 7 }}>{r.portfolio.title}</Text>
              {r.allocations.map((a,i)=><View key={i} style={s.allocationRow}>
                <Text style={s.allocationName}>{a.fundName}</Text>
                <Text style={s.allocationWeight}>{a.weight.toFixed(1)}%</Text>
              </View>)}
            </View>)}
          </View>
        </View>

        <View style={s.notice}>
          <Text style={s.noticeTitle}>IMPORTANT - UNVERIFIED DEMONSTRATION DATA</Text>
          <Text style={s.noticeText}>{dis} Past performance is not a reliable indicator of future performance. Investment values can fall as well as rise. Tax, currency, fund class, charges and distributions must be verified before an actual proposal is issued.</Text>
        </View>
        <View style={s.cta}>
          <Text style={s.ctaTitle}>DISCUSS YOUR PLANS WITH OUR TEAM</Text>
          <Text style={s.ctaText}>Schedule a free consultation at +353 1 293 8554 (Sandyford office).</Text>
        </View>
        <Text style={s.regulated}>OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</Text>
      </Page>
    </Document>
  );
}
