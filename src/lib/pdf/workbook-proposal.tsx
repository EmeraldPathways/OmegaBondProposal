import React from "react";
import {Document,Page,View,Text,StyleSheet,Svg,Path} from "@react-pdf/renderer";
import {OMEGA_LOGO_PATHS} from "@/lib/branding/omega-logo-paths";

export type WorkbookReturnPeriods = Record<
  "ytd"|"oneMonth"|"threeMonth"|"sixMonth"|"oneYear"|"threeYear"|"fiveYear"|"tenYear"|"sinceLaunch",
  number|null
>;
export type WorkbookProposalFund = {
  id:string;name:string;provider:string;weight:number;allocatedAmount:number;
  returns:WorkbookReturnPeriods;
  factsheet:{
    filename:string|null; title:string|null; date:string|null;
    objective:string|null;strategy:string|null;moneyMateId:string|null;
    baseCurrency:string|null;riskRating:number|null;amcPct:number|null;
    civPct:number|null;chartPages:string[];
  };
};
export type WorkbookProposalPortfolio = {
  id:string;title:string;description:string;funds:WorkbookProposalFund[];
};
export type WorkbookProposalData = {
  client:string;adviser:string;objective:string;investment:number;
  workbookFilename:string;preparedDate:string;
  portfolios:WorkbookProposalPortfolio[];
};
const color={
  wine:"#671E27",gold:"#988B54",ink:"#31342F",muted:"#72766F",
  pale:"#F7F6F2",border:"#E4E3DE",white:"#FFFFFF"
};
const style=StyleSheet.create({
  page:{backgroundColor:color.white,paddingTop:38,paddingBottom:53,paddingHorizontal:40,
    fontFamily:"Helvetica",fontSize:9,color:color.ink},
  banner:{backgroundColor:color.wine,borderRadius:7,paddingHorizontal:15,
    height:50,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  bannerLabel:{fontFamily:"Helvetica-Bold",fontSize:8,color:color.white,letterSpacing:.7},
  eyebrow:{fontSize:8,color:color.gold,fontFamily:"Helvetica-Bold",letterSpacing:1.4,marginTop:22},
  title:{fontFamily:"Times-Roman",fontSize:27,color:color.wine,marginTop:9,marginBottom:8},
  heading:{fontFamily:"Times-Roman",fontSize:18,color:color.wine,marginBottom:10},
  subtitle:{fontSize:9,color:color.muted,lineHeight:1.5},
  hero:{backgroundColor:color.pale,borderWidth:1,borderColor:color.border,borderRadius:7,
    marginTop:23,padding:16},
  fieldLabel:{fontSize:8,color:color.muted,marginBottom:5},
  fieldValue:{fontFamily:"Helvetica-Bold",fontSize:11,color:color.ink,lineHeight:1.35},
  facts:{flexDirection:"row",flexWrap:"wrap",marginTop:13,gap:13},
  fact:{width:"46%",marginBottom:10},
  investment:{fontSize:24,fontFamily:"Helvetica-Bold",color:color.wine,marginBottom:8},
  box:{borderWidth:1,borderColor:color.border,borderRadius:6,
    padding:13,marginTop:18},
  section:{fontFamily:"Helvetica-Bold",fontSize:10,color:color.wine,marginBottom:9},
  p:{fontSize:9,color:color.ink,lineHeight:1.6},
  note:{fontSize:8.1,color:color.muted,lineHeight:1.55},
  sourceCard:{borderWidth:.7,borderColor:color.border,borderRadius:7,padding:12,marginTop:11},
  sourceTitle:{fontFamily:"Helvetica-Bold",fontSize:9.6,color:color.wine,marginBottom:5},
  meta:{fontSize:7.9,color:color.ink,lineHeight:1.55,marginBottom:5},
  alert:{backgroundColor:"#FAF4F2",padding:12,borderRadius:6,marginTop:19},
  alertTitle:{fontFamily:"Helvetica-Bold",fontSize:9,color:color.wine,marginBottom:6},
  divider:{height:1,backgroundColor:color.border,marginTop:15,marginBottom:15},
  row:{flexDirection:"row",borderBottomWidth:.6,borderBottomColor:color.border,
    alignItems:"center",minHeight:33,paddingVertical:8},
  tableHeader:{flexDirection:"row",backgroundColor:"#F3F2EE",
    paddingVertical:9,alignItems:"center",borderBottomWidth:1,borderBottomColor:color.border},
  headerCell:{fontSize:7,color:color.muted,fontFamily:"Helvetica-Bold"},
  fundName:{fontSize:8.1,fontFamily:"Helvetica-Bold",lineHeight:1.3},
  fundProvider:{fontSize:7,color:color.muted,marginTop:3},
  number:{fontSize:8.0,textAlign:"right"},
  footer:{position:"absolute",left:40,right:40,bottom:25,
    flexDirection:"row",justifyContent:"space-between",
    borderTopWidth:.7,borderTopColor:color.border,paddingTop:7},
  footerText:{fontSize:7.1,color:color.muted}
});
const euro=(n:number)=>new Intl.NumberFormat("en-IE",{
  style:"currency",currency:"EUR",maximumFractionDigits:2,minimumFractionDigits:0
}).format(n);
const percentage=(n:number|null)=>n==null || !Number.isFinite(n)
  ?"—":(n>0?"+":"")+n.toFixed(2)+"%";
function Logo(){
  return <Svg width={125} height={33} viewBox="0 0 1024 266">
    {OMEGA_LOGO_PATHS.map((d,i)=><Path key={i} d={d} fill="#FFFFFF" fillRule="evenodd"/>)}
  </Svg>;
}
function Banner({label}:{label:string}){
  return <View style={style.banner}><Logo/><Text style={style.bannerLabel}>{label}</Text></View>;
}
function Footer(){
  return <View style={style.footer} fixed>
    <Text style={style.footerText}>OFM Financial Ltd T/A Omega Financial Management · regulated by the Central Bank of Ireland</Text>
    <Text style={style.footerText}>ADVISER REVIEW DRAFT</Text>
  </View>;
}
export default function WorkbookProposalPDF({data}:{data:WorkbookProposalData}){
  return <Document title="Omega Investment Bond Proposal - Draft"
    author="Omega Financial Management"
    subject="Draft investment allocation and uploaded workbook fund returns" language="en-IE">
    <Page size="A4" style={style.page}>
      <Banner label="DRAFT PROPOSAL · ADVISER REVIEW"/>
      <Text style={style.eyebrow}>INVESTMENT BOND & PORTFOLIO ALLOCATION</Text>
      <Text style={style.title}>Investment bond proposal</Text>
      <Text style={style.subtitle}>Prepared {data.preparedDate}. Fund performance is reproduced from the current Omega uploaded workbook, not from PDF factsheet performance tables.</Text>
      <View style={style.hero}>
        <Text style={style.fieldLabel}>Initial investment</Text>
        <Text style={style.investment}>{euro(data.investment)}</Text>
        <View style={style.facts}>
          <View style={style.fact}><Text style={style.fieldLabel}>Prepared for</Text><Text style={style.fieldValue}>{data.client||"Client name not provided"}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Prepared by</Text><Text style={style.fieldValue}>{data.adviser}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Portfolio options</Text><Text style={style.fieldValue}>{String(data.portfolios.length)}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Performance source</Text><Text style={style.fieldValue}>Uploaded Omega workbook</Text></View>
        </View>
      </View>
      <View style={style.box}>
        <Text style={style.section}>Investment objective</Text>
        <Text style={style.p}>{data.objective}</Text>
      </View>
      <View style={style.box}>
        <Text style={style.section}>Included portfolios</Text>
        {data.portfolios.map((p,i)=><View key={p.id} style={{marginBottom:8}}>
          <Text style={style.p}>Portfolio {String.fromCharCode(65+i)} — {p.title} · {p.funds.length} funds · 100% allocated</Text>
          <Text style={style.note}>{p.description}</Text>
        </View>)}
      </View>
      <View style={style.alert}>
        <Text style={style.alertTitle}>IMPORTANT — DRAFT, NOT APPROVED FOR CLIENT DISTRIBUTION</Text>
        <Text style={style.note}>Fund returns are the cumulative percentages supplied in the uploaded workbook. Individual fund reporting dates, return/fee conventions, product charges, share classes and suitability have not been independently verified. A PDF filename match indicates a document link only, not verification of its contents. No monthly unit prices, portfolio-level historical returns, annual values or forecasts have been invented.</Text>
      </View>
      <Footer/>
    </Page>
    {data.portfolios.map((p,index)=><Page key={p.id} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · DRAFT"}/>
      <Text style={style.eyebrow}>PORTFOLIO COMPOSITION</Text>
      <Text style={style.heading}>{p.title}</Text>
      <Text style={style.subtitle}>{p.description}</Text>
      <View style={style.box}>
        <Text style={style.fieldLabel}>Allocated capital</Text>
        <Text style={style.fieldValue}>{euro(data.investment)} · 100% total allocation · {p.funds.length} selected funds</Text>
      </View>
      <View style={{marginTop:20}}>
        <Text style={style.section}>Fund allocations and reported cumulative returns</Text>
        <View style={style.tableHeader} fixed>
          <View style={{width:"37%",paddingHorizontal:7}}><Text style={style.headerCell}>FUND</Text></View>
          <View style={{width:"12%",paddingHorizontal:3}}><Text style={[style.headerCell,{textAlign:"right"}]}>WEIGHT</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={[style.headerCell,{textAlign:"right"}]}>1 YEAR</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={[style.headerCell,{textAlign:"right"}]}>3 YEARS</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={[style.headerCell,{textAlign:"right"}]}>5 YEARS</Text></View>
          <View style={{width:"12%",paddingHorizontal:3}}><Text style={[style.headerCell,{textAlign:"right"}]}>10 YEARS</Text></View>
        </View>
        {p.funds.map(f=><View key={f.id} style={style.row} wrap={false}>
          <View style={{width:"37%",paddingHorizontal:7}}>
            <Text style={style.fundName}>{f.name}</Text>
            <Text style={style.fundProvider}>{f.provider}</Text>
          </View>
          <View style={{width:"12%",paddingHorizontal:3}}><Text style={style.number}>{f.weight.toFixed(2)}%</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={style.number}>{percentage(f.returns.oneYear)}</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={style.number}>{percentage(f.returns.threeYear)}</Text></View>
          <View style={{width:"13%",paddingHorizontal:3}}><Text style={style.number}>{percentage(f.returns.fiveYear)}</Text></View>
          <View style={{width:"12%",paddingHorizontal:3}}><Text style={style.number}>{percentage(f.returns.tenYear)}</Text></View>
        </View>)}
      </View>
      <View style={{marginTop:12}}>
        <Text style={style.note}>All performance figures above are cumulative, not annualised; 3-, 5- and 10-year periods are not annual returns. “—” means unavailable in the workbook. Initial allocations reflect {euro(data.investment)} multiplied by each selected weight; no growth or rebalancing is assumed.</Text>
      </View>
      <View style={style.divider}/>
      <Text style={style.section}>Initial investment breakdown</Text>
      {p.funds.map(f=><View key={f.id} style={{flexDirection:"row",justifyContent:"space-between",marginBottom:6}} wrap={false}>
        <Text style={[style.note,{width:"76%"}]}>{f.name} ({f.weight.toFixed(2)}%)</Text>
        <Text style={style.note}>{euro(f.allocatedAmount)}</Text>
      </View>)}
      <View style={style.alert}>
        <Text style={style.alertTitle}>DATA BASIS AND LIMITATIONS</Text>
        <Text style={style.note}>Source: {data.workbookFilename}. Fund names and every return shown are taken only from that workbook. PDF filenames provide document association only. Dates and charge/fee basis for the workbook returns are not confirmed. Returns from different funds must not be aggregated as a validated portfolio return until common valuation dates and conventions are established. The value of investments can fall as well as rise; past performance is not a reliable indicator of future performance.</Text>
      </View>
      <Footer/>
    </Page>)}
    {data.portfolios.map((p,index)=><Page key={p.id+"-factsheets"} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · SOURCE DETAILS"}/>
      <Text style={style.eyebrow}>PROVIDER FACTSHEET INFORMATION</Text>
      <Text style={style.heading}>{p.title} · Fund details</Text>
      <Text style={style.note}>The following investment objectives, strategy notes, risks and charges are taken from the linked uploaded PDF factsheets where text extraction was available. These details have not been independently verified. Fund returns are sourced separately and exclusively from the Excel workbook.</Text>
      {p.funds.map(f=><View key={f.id+"-source"} style={style.sourceCard} wrap={false}>
        <Text style={style.sourceTitle}>{f.name}</Text>
        <Text style={style.meta}>{f.provider} · PDF: {f.factsheet.filename??"Not linked"}</Text>
        <Text style={style.meta}>Printed PDF title: {f.factsheet.title??"Not extracted"} · Factsheet date: {f.factsheet.date??"Not available"}</Text>
        <Text style={style.meta}>MoneyMate ID: {f.factsheet.moneyMateId??"Not stated"} · Currency: {f.factsheet.baseCurrency??"Not stated"} · Numeric risk rating: {f.factsheet.riskRating==null?"Not stated":f.factsheet.riskRating+"/7"}</Text>
        <Text style={style.meta}>AMC: {percentage(f.factsheet.amcPct)} · CIV charge: {percentage(f.factsheet.civPct)} (where stated in PDF; these charges have not been deducted from workbook returns)</Text>
        <Text style={style.meta}>Objective: {f.factsheet.objective??"Not extracted from PDF"}</Text>
        {f.factsheet.strategy?<Text style={style.meta}>Strategy: {f.factsheet.strategy}</Text>:null}
        {f.factsheet.chartPages.length?
          <Text style={style.meta}>Charts in source PDF: {f.factsheet.chartPages.join("; ")}. Original PDF graphics are not recreated as calculated charts.</Text>:null}
      </View>)}
      <View style={style.alert}>
        <Text style={style.alertTitle}>ADVISER SOURCE CHECK</Text>
        <Text style={style.note}>Please verify factsheet dates, share class, PDF descriptions, tax, risk and charges before sending to a client. Reported workbook returns are cumulative and have no confirmed common date or charge basis. Missing data is shown as unavailable rather than inferred.</Text>
      </View>
      <Footer/>
    </Page>)}
  </Document>;
}
