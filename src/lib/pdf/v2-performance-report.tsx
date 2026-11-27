import React from "react";
import {Document, Page, View, Text, StyleSheet, Svg, Path, Line, Circle} from "@react-pdf/renderer";
import {OMEGA_LOGO_PATHS} from "@/lib/branding/omega-logo-paths";
import {
  type InvestmentRecord, calculatePerformance, portfolioChartSeries, checkPolicyValuations
} from "@/lib/v2-investment-performance";

export type PerformanceReportProps = {
  record: InvestmentRecord;
  startDate: string;
  endDate: string;
  reportType: "performance" | "withdrawals";
};
const color = {wine:"#671E27", gold:"#988B54", ink:"#31342F", muted:"#72766F",
  pale:"#F7F6F2", border:"#E4E3DE", white:"#FFFFFF"};
const s = StyleSheet.create({
  page:{backgroundColor:color.white,paddingTop:38,paddingBottom:54,paddingHorizontal:40,fontFamily:"Helvetica",fontSize:9,color:color.ink},
  banner:{backgroundColor:color.wine,borderRadius:7,paddingHorizontal:15,height:50,flexDirection:"row",alignItems:"center"},
  eyebrow:{fontSize:8,color:color.gold,fontFamily:"Helvetica-Bold",letterSpacing:1.3,marginTop:13},
  title:{fontFamily:"Times-Roman",fontSize:26,color:color.wine,marginTop:6,marginBottom:6},
  subtitle:{fontSize:8.7,color:color.muted,lineHeight:1.5},
  headline:{fontFamily:"Times-Roman",fontSize:16,color:color.wine,marginTop:20,marginBottom:9},
  box:{borderWidth:.8,borderColor:color.border,backgroundColor:color.pale,borderRadius:7,padding:12,marginTop:12},
  section:{borderWidth:.7,borderColor:color.border,borderRadius:7,padding:11,marginTop:14},
  row:{flexDirection:"row",justifyContent:"space-between",paddingVertical:6,borderBottomWidth:.4,borderBottomColor:color.border},
  label:{fontSize:7.7,color:color.muted},
  value:{fontSize:9.5,fontFamily:"Helvetica-Bold",color:color.ink},
  metricGrid:{flexDirection:"row",flexWrap:"wrap",marginTop:9,gap:9},
  metric:{width:"31%",borderWidth:.7,borderColor:color.border,borderRadius:6,padding:10,minHeight:63},
  metricLabel:{fontSize:7,color:color.muted,marginBottom:7},
  metricValue:{fontSize:12,fontFamily:"Helvetica-Bold",color:color.wine},
  tableHeader:{flexDirection:"row",paddingVertical:8,paddingHorizontal:6,backgroundColor:"#F3F2EE",borderBottomColor:color.border,borderBottomWidth:.7},
  tableRow:{flexDirection:"row",paddingVertical:9,paddingHorizontal:6,borderBottomColor:color.border,borderBottomWidth:.5},
  th:{fontFamily:"Helvetica-Bold",fontSize:7,color:color.muted},
  td:{fontSize:7.4,color:color.ink},
  note:{fontSize:7.5,color:color.muted,lineHeight:1.45,marginTop:13},
  callout:{backgroundColor:"#FAF4F2",borderRadius:5,padding:10,marginTop:10},
  footer:{position:"absolute",left:40,right:40,bottom:25,flexDirection:"row",justifyContent:"space-between",borderTopWidth:.7,borderTopColor:color.border,paddingTop:7},
  footerText:{fontSize:7,color:color.muted},
});
const money=(n:number|null)=>n===null||!Number.isFinite(n)?"—":new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const percentage=(n:number|null)=>n===null||!Number.isFinite(n)?"—":(n>0?"+":"")+n.toFixed(2)+"%";
function Logo(){return <Svg width={125} height={33} viewBox="0 0 1024 266">
  {OMEGA_LOGO_PATHS.map((d,i)=><Path key={i} d={d} fill="#FFFFFF" fillRule="evenodd"/>)}
</Svg>;}
function Footer(){return <View style={s.footer} fixed>
  <Text style={s.footerText}>OFM Financial Ltd T/A Omega Financial Management · regulated by the Central Bank of Ireland</Text>
  <Text style={s.footerText} render={({pageNumber,totalPages})=>String(pageNumber)+" / "+String(totalPages)}/>
</View>;}
function Metric({label,value}:{label:string;value:string}) {return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>;}
function ValueHistory({record,startDate,endDate}:{record:InvestmentRecord;startDate:string;endDate:string}) {
  const values=portfolioChartSeries(record).filter(v=>v.date>=startDate&&v.date<=endDate);
  if(values.length<2)return <Text style={s.note}>No complete dated valuation history available to chart this reporting period.</Text>;
  const lo=Math.min(...values.map(v=>v.value)),hi=Math.max(...values.map(v=>v.value));
  const span=hi-lo||Math.max(hi,1),from=Date.parse(values[0].date+"T00:00:00Z");
  const until=Date.parse(values[values.length-1].date+"T00:00:00Z"),duration=until-from||1;
  const pts=values.map(v=>({
    x:36+424*(Date.parse(v.date+"T00:00:00Z")-from)/duration,
    y:112-78*(v.value-lo)/span, date:v.date
  }));
  const path=pts.map((p,i)=>(i===0?"M ":"L ")+p.x+" "+p.y).join(" ");
  return <View style={{marginTop:9,padding:10,borderWidth:.6,borderColor:color.border,borderRadius:6}}>
    <Text style={{fontFamily:"Helvetica-Bold",fontSize:8.5,color:color.wine}}>Portfolio value · actual snapshots</Text>
    <Svg width={490} height={138} viewBox="0 0 490 138">
      <Line x1={34} y1={117} x2={465} y2={117} stroke="#E4E3DE" strokeWidth={1}/>
      <Line x1={34} y1={32} x2={465} y2={32} stroke="#E4E3DE" strokeDasharray="4,4"/>
      <Path d={path} stroke={color.wine} strokeWidth={2.5} fill="none"/>
      {pts.map(p=><Circle key={p.date} cx={p.x} cy={p.y} r={3} fill={color.gold}/>)}
    </Svg>
    <View style={{flexDirection:"row",justifyContent:"space-between"}}>
      <Text style={s.label}>{values[0].date}</Text><Text style={s.label}>{values[values.length-1].date}</Text>
    </View>
    <Text style={s.note}>Market value includes the effects of cash flows; the cumulative return below is cash-flow adjusted.</Text>
  </View>;
}
export default function PerformancePdf({record,startDate,endDate,reportType}:PerformanceReportProps){
  const perf=calculatePerformance(record,startDate,endDate);
  const transactions=record.flows.filter(f=>f.date>startDate&&f.date<=endDate)
    .slice().sort((a,b)=>a.date.localeCompare(b.date));
  const fundResults=record.funds.map(f=>({fund:f,result:calculatePerformance(record,startDate,endDate,f.id)}));
  const observations=[startDate,endDate].map(d=>checkPolicyValuations(record,d)).filter((v):v is string=>!!v);
  const isWithdrawal=reportType==="withdrawals";
  const issued=new Intl.DateTimeFormat("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  return <Document author="Omega Financial Management" title={isWithdrawal?"Omega Withdrawals Statement":"Omega Investment Performance Report"}>
    <Page size="A4" style={s.page} wrap>
      <View style={s.banner}><Logo/></View>
      <Text style={s.eyebrow}>CLIENT INVESTMENT REPORT · {isWithdrawal?"CASH FLOW STATEMENT":"ACTUAL PERFORMANCE"}</Text>
      <Text style={s.title}>{isWithdrawal?"Withdrawals & Contributions":"Investment Performance Report"}</Text>
      <Text style={s.subtitle}>Prepared {issued} · Reporting period {startDate} to {endDate} · EUR</Text>
      <View style={s.box}>
        <View style={s.row}><Text style={s.label}>Client</Text><Text style={s.value}>{record.clientName||"Not provided"}</Text></View>
        <View style={s.row}><Text style={s.label}>Policy / portfolio</Text><Text style={s.value}>{record.policyName||"Not provided"}</Text></View>
        <View style={s.row}><Text style={s.label}>Type / provider</Text><Text style={s.value}>{record.policyType+" · "+(record.provider||"Provider not entered")}</Text></View>
        <View style={s.row}><Text style={s.label}>Policy number</Text><Text style={s.value}>{record.policyNumber||"Not entered"}</Text></View>
        <View style={{flexDirection:"row",justifyContent:"space-between",paddingTop:6}}>
          <Text style={s.label}>Original investment date</Text><Text style={s.value}>{record.investmentDate||"Not entered"}</Text>
        </View>
      </View>
      <Text style={s.headline}>{isWithdrawal?"Cash flow overview":"Actual performance summary"}</Text>
      <View style={s.metricGrid}>
        <Metric label="Original investment" value={money(record.originalInvestment)}/>
        <Metric label="Period opening value" value={money(perf.openingValue)}/>
        <Metric label="Current / closing value" value={money(perf.closingValue)}/>
        <Metric label="Further contributions" value={money(perf.contributions)}/>
        <Metric label="Withdrawals" value={money(perf.withdrawals)}/>
        <Metric label="Net cash flow" value={money(perf.netCashFlow)}/>
        <Metric label="Investment gain / loss" value={money(perf.gain)}/>
        <Metric label="Cumulative return" value={percentage(perf.cumulativeReturnPct)}/>
      </View>
      {!perf.available?<View style={s.callout}><Text style={s.note}>
        Cumulative return unavailable: {perf.reason} No return has been estimated.
      </Text></View>:null}
      {observations.map((note,i)=><View key={i} style={s.callout}><Text style={s.note}>{note}</Text></View>)}
      {!isWithdrawal?<>
        <ValueHistory record={record} startDate={startDate} endDate={endDate}/>
        <Text style={s.headline}>Individual fund performance</Text>
        <View style={s.tableHeader}>
          <Text style={[s.th,{width:"30%"}]}>FUND</Text>
          <Text style={[s.th,{width:"17%",textAlign:"right"}]}>OPENING</Text>
          <Text style={[s.th,{width:"17%",textAlign:"right"}]}>CLOSING</Text>
          <Text style={[s.th,{width:"18%",textAlign:"right"}]}>GAIN / LOSS</Text>
          <Text style={[s.th,{width:"18%",textAlign:"right"}]}>CUM. RETURN</Text>
        </View>
        {fundResults.map(({fund,result})=><View key={fund.id} wrap={false} style={s.tableRow}>
          <Text style={[s.td,{width:"30%"}]}>{fund.name}</Text>
          <Text style={[s.td,{width:"17%",textAlign:"right"}]}>{money(result.openingValue)}</Text>
          <Text style={[s.td,{width:"17%",textAlign:"right"}]}>{money(result.closingValue)}</Text>
          <Text style={[s.td,{width:"18%",textAlign:"right"}]}>{money(result.gain)}</Text>
          <Text style={[s.td,{width:"18%",textAlign:"right"}]}>{percentage(result.cumulativeReturnPct)}</Text>
        </View>)}
        {!fundResults.length?<Text style={s.note}>Individual fund values have not been entered.</Text>:null}
        {fundResults.filter(x=>!x.result.available).length>0?<Text style={s.note}>
          Fund-level returns marked unavailable require both fund valuations and allocation of policy cash flows to individual funds.
        </Text>:null}
      </>:null}
      <Text style={s.headline}>{isWithdrawal?"Dated contributions and withdrawals":"Cash flow adjustments"}</Text>
      <View style={s.tableHeader}>
        <Text style={[s.th,{width:"17%"}]}>DATE</Text>
        <Text style={[s.th,{width:"20%"}]}>TYPE</Text>
        <Text style={[s.th,{width:"27%"}]}>HOLDING</Text>
        <Text style={[s.th,{width:"18%",textAlign:"right"}]}>AMOUNT</Text>
        <Text style={[s.th,{width:"18%"}]}>NOTES</Text>
      </View>
      {transactions.slice(0,500).map(f=><View key={f.id} style={s.tableRow} wrap={false}>
        <Text style={[s.td,{width:"17%"}]}>{f.date}</Text>
        <Text style={[s.td,{width:"20%"}]}>{f.kind==="contribution"?"Contribution":"Withdrawal"}</Text>
        <Text style={[s.td,{width:"27%"}]}>{record.funds.find(x=>x.id===f.fundId)?.name||"Policy"}</Text>
        <Text style={[s.td,{width:"18%",textAlign:"right"}]}>{money(f.amount)}</Text>
        <Text style={[s.td,{width:"18%"}]}>{f.note||"—"}</Text>
      </View>)}
      {transactions.length>500?<Text style={s.note}>Only the first 500 transactions are shown; use a shorter reporting period for a complete statement.</Text>:null}
      {!transactions.length?<Text style={s.note}>No additional transactions recorded in this period.</Text>:null}
      <View style={s.callout} wrap={false}>
        <Text style={{fontFamily:"Helvetica-Bold",fontSize:8,color:color.wine}}>Reporting methodology</Text>
        <Text style={s.note}>Cumulative Modified Dietz: (closing value – opening value – contributions + withdrawals) / (opening value + time-weighted signed cash flows). No annualised return is calculated. Cash flows dated after the opening valuation and through the closing valuation are included; flows are assumed to occur at end of day. A value at inception defaults to original investment when no opening statement is supplied. No missing valuations or cash flows are interpolated.</Text>
        <Text style={s.note}>This document is based on manually entered policy/provider statement figures. Confirm valuation dates, fund allocations, withdrawals, fees, tax treatment and cash-flow completeness against original records before providing to a client. Past performance is not a reliable indicator of future results.</Text>
      </View>
      <Footer/>
    </Page>
  </Document>;
}
