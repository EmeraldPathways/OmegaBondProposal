import React from "react";
import {Document,Page,View,Text,StyleSheet,Svg,Path} from "@react-pdf/renderer";
import {OMEGA_LOGO_PATHS} from "@/lib/branding/omega-logo-paths";
import {calculateCombinedPortfolio,type InvestmentCase} from "@/lib/v2-policy-portfolios";

type Report={records:InvestmentCase[];startDate:string;endDate:string};
const colors={wine:"#671E27",gold:"#988B54",ink:"#31342F",muted:"#72766F",pale:"#F7F6F2",border:"#E4E3DE",white:"#FFFFFF"};
const style=StyleSheet.create({
  page:{backgroundColor:colors.white,paddingTop:38,paddingBottom:52,paddingHorizontal:40,fontFamily:"Helvetica",fontSize:8.7,color:colors.ink},
  banner:{backgroundColor:colors.wine,borderRadius:7,height:50,paddingHorizontal:15,justifyContent:"center"},
  eyebrow:{color:colors.gold,fontSize:8,letterSpacing:1.25,fontFamily:"Helvetica-Bold",marginTop:14},
  title:{fontFamily:"Times-Roman",fontSize:27,color:colors.wine,marginTop:5,marginBottom:8},
  subtitle:{color:colors.muted,lineHeight:1.5,fontSize:8.5},
  card:{backgroundColor:colors.pale,borderWidth:.6,borderColor:colors.border,borderRadius:7,padding:12,marginTop:12},
  sectionTitle:{fontFamily:"Times-Roman",fontSize:17,color:colors.wine,marginTop:18,marginBottom:10},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:9,marginTop:10},
  metric:{width:"31%",minHeight:61,borderRadius:6,borderWidth:.6,borderColor:colors.border,padding:10},
  label:{fontSize:7,color:colors.muted,marginBottom:6},
  figure:{fontSize:12,color:colors.wine,fontFamily:"Helvetica-Bold"},
  cellHeader:{fontFamily:"Helvetica-Bold",fontSize:7,color:colors.muted},
  cell:{fontSize:7.1,lineHeight:1.45,color:colors.ink},
  row:{flexDirection:"row",paddingVertical:8,paddingHorizontal:5,borderBottomWidth:.5,borderBottomColor:colors.border},
  head:{flexDirection:"row",paddingVertical:9,paddingHorizontal:5,backgroundColor:"#F3F2EE",borderBottomWidth:1,borderBottomColor:colors.border},
  note:{fontSize:7.6,lineHeight:1.55,color:colors.muted,marginTop:12},
  alert:{backgroundColor:"#FAF4F2",padding:11,borderRadius:6,marginTop:14},
  footer:{position:"absolute",left:40,right:40,bottom:23,flexDirection:"row",justifyContent:"space-between",
    borderTopWidth:.7,borderTopColor:colors.border,paddingTop:8},
  footerText:{fontSize:7,color:colors.muted}
});
const euro=(n:number|null)=>n===null?"—":new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const pct=(n:number|null)=>n===null?"—":(n>0?"+":"")+n.toFixed(2)+"%";
const Metric=({label,value}:{label:string;value:string})=><View style={style.metric}><Text style={style.label}>{label}</Text><Text style={style.figure}>{value}</Text></View>;
function Footer(){return <View style={style.footer} fixed>
  <Text style={style.footerText}>OFM Financial Ltd T/A Omega Financial Management · regulated by the Central Bank of Ireland</Text>
  <Text style={style.footerText} render={({pageNumber,totalPages})=>pageNumber+" / "+totalPages}/>
</View>;}
export default function CombinedPortfolioPdf({records,startDate,endDate}:Report){
  const summary=calculateCombinedPortfolio(records,startDate,endDate);
  const transactions=records.flatMap(r=>r.flows.filter(f=>f.date>startDate&&f.date<=endDate).map(f=>({
    policy:r.policyName,date:f.date,type:f.kind,amount:f.amount,note:f.note
  }))).sort((a,b)=>a.date.localeCompare(b.date));
  const now=new Intl.DateTimeFormat("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  return <Document author="Omega Financial Management" title="Omega Combined Portfolio Performance">
    <Page size="A4" wrap style={style.page}>
      <View style={style.banner}><Svg width={125} height={33} viewBox="0 0 1024 266">
        {OMEGA_LOGO_PATHS.map((d,i)=><Path key={i} d={d} fill="#FFFFFF" fillRule="evenodd"/>)}
      </Svg></View>
      <Text style={style.eyebrow}>CLIENT INVESTMENT REPORT · ACTUAL PERFORMANCE</Text>
      <Text style={style.title}>Combined Portfolio Performance</Text>
      <Text style={style.subtitle}>Prepared {now} · Reporting period {startDate} – {endDate} · EUR</Text>
      <View style={style.card}>
        <Text style={{fontFamily:"Helvetica-Bold",fontSize:11,color:colors.wine}}>{records[0]?.clientName||"Client not entered"}</Text>
        <Text style={[style.subtitle,{marginTop:5}]}>Portfolio group: {records[0]?.portfolioGroup||"Combined client policies"}</Text>
        <Text style={[style.subtitle,{marginTop:3}]}>{records.length} policies · Common opening and closing reporting dates</Text>
      </View>
      <Text style={style.sectionTitle}>Portfolio cumulative performance</Text>
      <View style={style.metrics}>
        <Metric label="Opening market value" value={euro(summary.openingValue)}/>
        <Metric label="Closing market value" value={euro(summary.closingValue)}/>
        <Metric label="Further contributions" value={euro(summary.contributions)}/>
        <Metric label="Withdrawals" value={euro(summary.withdrawals)}/>
        <Metric label="Euro gain / loss" value={euro(summary.gain)}/>
        <Metric label="Cumulative return" value={pct(summary.cumulativeReturnPct)}/>
      </View>
      <Text style={style.sectionTitle}>Performance by policy</Text>
      <View style={style.head}>
        <Text style={[style.cellHeader,{width:"29%"}]}>POLICY</Text>
        <Text style={[style.cellHeader,{width:"18%",textAlign:"right"}]}>OPENING</Text>
        <Text style={[style.cellHeader,{width:"18%",textAlign:"right"}]}>CLOSING</Text>
        <Text style={[style.cellHeader,{width:"18%",textAlign:"right"}]}>GAIN / LOSS</Text>
        <Text style={[style.cellHeader,{width:"17%",textAlign:"right"}]}>CUM. RETURN</Text>
      </View>
      {summary.policyResults.map(({record,performance},i)=><View key={record.id||i} style={style.row} wrap={false}>
        <Text style={[style.cell,{width:"29%",paddingRight:4}]}>{record.policyName}{"\n"}{record.provider}</Text>
        <Text style={[style.cell,{width:"18%",textAlign:"right"}]}>{euro(performance.openingValue)}</Text>
        <Text style={[style.cell,{width:"18%",textAlign:"right"}]}>{euro(performance.closingValue)}</Text>
        <Text style={[style.cell,{width:"18%",textAlign:"right"}]}>{euro(performance.gain)}</Text>
        <Text style={[style.cell,{width:"17%",textAlign:"right"}]}>{pct(performance.cumulativeReturnPct)}</Text>
      </View>)}
      <Text style={style.sectionTitle}>Dated cash flow register</Text>
      <View style={style.head}>
        <Text style={[style.cellHeader,{width:"19%"}]}>DATE</Text>
        <Text style={[style.cellHeader,{width:"34%"}]}>POLICY</Text>
        <Text style={[style.cellHeader,{width:"23%"}]}>TYPE</Text>
        <Text style={[style.cellHeader,{width:"24%",textAlign:"right"}]}>AMOUNT</Text>
      </View>
      {transactions.map((t,i)=><View key={i} style={style.row} wrap={false}>
        <Text style={[style.cell,{width:"19%"}]}>{t.date}</Text>
        <Text style={[style.cell,{width:"34%"}]}>{t.policy}</Text>
        <Text style={[style.cell,{width:"23%"}]}>{t.type==="contribution"?"Contribution":"Withdrawal"}</Text>
        <Text style={[style.cell,{width:"24%",textAlign:"right"}]}>{euro(t.amount)}</Text>
      </View>)}
      {transactions.length===0?<Text style={style.note}>No additional dated cash flows in this period.</Text>:null}
      <View style={style.alert} wrap={false}>
        <Text style={{fontFamily:"Helvetica-Bold",fontSize:8.5,color:colors.wine}}>Calculation methodology</Text>
        <Text style={style.note}>Cumulative Modified Dietz: combined change in actual portfolio market value, minus net external cash flows, divided by opening capital plus the time-weighted signed cash flows during the common reporting period. Contributions and withdrawals are adjusted by their transaction dates. This is not an annualised return or the arithmetic average of individual policy returns.</Text>
        <Text style={style.note}>Source data is manually entered. Confirm complete dated transactions, opening and closing valuations, fees and policy transfers against provider statements before client use. Where policy-level data is incomplete, a return must not be reported.</Text>
      </View>
      <Footer/>
    </Page>
  </Document>;
}
