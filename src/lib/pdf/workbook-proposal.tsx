import React from "react";
import {Document,Page,View,Text,StyleSheet,Svg,Path,Circle,Rect,Line} from "@react-pdf/renderer";
import {OMEGA_LOGO_PATHS} from "@/lib/branding/omega-logo-paths";
import {
  CUMULATIVE_PERIODS,cumulativeReturnValues,contiguousReturnSegments,
  cumulativeChartDomain,chartFundGroups
} from "@/lib/pdf/cumulative-return-chart";

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
  visualCard:{borderWidth:.7,borderColor:color.border,borderRadius:8,padding:16,marginTop:15,backgroundColor:"#FDFDFC"},
  visualTitle:{fontFamily:"Times-Roman",color:color.wine,fontSize:16,marginBottom:7},
  visualNote:{fontSize:7.8,color:color.muted,lineHeight:1.55},
  chartRow:{flexDirection:"row",alignItems:"center",paddingVertical:7,borderBottomColor:"#EFEEE9",borderBottomWidth:.4},
  chartName:{fontSize:7.8,color:color.ink,width:"35%",paddingRight:8},
  chartValue:{fontSize:8.4,fontFamily:"Helvetica-Bold",color:color.ink,
    textAlign:"right",width:"15%"},
  legendText:{fontSize:8.1,color:color.ink,lineHeight:1.3,flex:1},
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
    <Text style={style.footerText}>INVESTMENT BOND PROPOSAL</Text>
  </View>;
}
const CHART_COLORS=["#671E27","#A8995F","#647579","#809485","#AC7471","#9A9C94","#977F70","#76808B"];
const radians=(degrees:number)=>degrees*Math.PI/180;
function pointOnCircle(cx:number,cy:number,r:number,angle:number){
  return [cx+Math.cos(radians(angle))*r,cy+Math.sin(radians(angle))*r];
}
function ringWedge(cx:number,cy:number,outer:number,inner:number,start:number,end:number){
  const [x1,y1]=pointOnCircle(cx,cy,outer,start);
  const [x2,y2]=pointOnCircle(cx,cy,outer,end);
  const [x3,y3]=pointOnCircle(cx,cy,inner,end);
  const [x4,y4]=pointOnCircle(cx,cy,inner,start);
  const large=end-start>180?1:0;
  return "M "+x1+" "+y1+" A "+outer+" "+outer+" 0 "+large+
    " 1 "+x2+" "+y2+" L "+x3+" "+y3+
    " A "+inner+" "+inner+" 0 "+large+" 0 "+x4+" "+y4+" Z";
}
function PortfolioAllocationChart({funds}:{funds:WorkbookProposalFund[]}){
  const shown=funds.slice(0,8);
  let total=0;
  const paths=shown.map((fund,index)=>{
    const start=total;
    total+=fund.weight;
    const end=total;
    const angle=360*fund.weight/100;
    return {
      id:fund.id,color:CHART_COLORS[index%CHART_COLORS.length],
      path:ringWedge(82,82,72,48,-90+start*3.6+Math.min(.8,angle/8),
        -90+end*3.6-Math.min(.8,angle/8))
    };
  });
  return <View style={style.visualCard} wrap={false}>
    <Text style={style.visualTitle}>Portfolio allocation</Text>
    <Text style={style.visualNote}>Initial investment weight by fund · actual selected percentages</Text>
    <View style={{flexDirection:"row",alignItems:"center",marginTop:13,gap:15}}>
      <View style={{width:168,height:166}}>
        <Svg width={164} height={164} viewBox="0 0 164 164">
          {shown.length===1?
            <Circle cx={82} cy={82} r={60} stroke={CHART_COLORS[0]}
              strokeWidth={24} fill="none"/>:
            paths.map(p=><Path key={p.id} d={p.path} fill={p.color}/>)}
          <Circle cx={82} cy={82} r={44} fill="#FFFFFF"/>
        </Svg>
        <View style={{position:"absolute",top:65,left:48,width:68,alignItems:"center"}}>
          <Text style={{fontFamily:"Helvetica-Bold",fontSize:19,color:color.wine}}>100%</Text>
          <Text style={{fontSize:7,color:color.muted}}>allocated</Text>
        </View>
      </View>
      <View style={{flex:1}}>
        {shown.map((f,i)=><View key={f.id} style={{
          flexDirection:"row",alignItems:"flex-start",marginBottom:8,gap:7}}>
          <View style={{width:9,height:9,borderRadius:2,
            backgroundColor:CHART_COLORS[i%CHART_COLORS.length],marginTop:2}}/>
          <Text style={style.legendText}>{f.name}</Text>
          <Text style={{fontSize:8.5,fontFamily:"Helvetica-Bold",
            color:color.ink,width:43,textAlign:"right"}}>{f.weight.toFixed(1)}%</Text>
        </View>)}
        {funds.length>8&&<Text style={style.visualNote}>
          Chart shows the first 8 funds. All {funds.length} weights are in the full allocation table.</Text>}
      </View>
    </View>
  </View>;
}
/** Four categorical lookback periods are shown, not inferred prices between dates. */
function CumulativeReturnLineChart({funds}:{
  funds:WorkbookProposalFund[]
}){
  const rows=funds.map(f=>({fund:f,values:cumulativeReturnValues(f.returns)}));
  const {min,max}=cumulativeChartDomain(rows.map(row=>row.values));
  const xLeft=58,xRight=485,yTop=22,yBottom=234;
  const graphWidth=xRight-xLeft,graphHeight=yBottom-yTop;
  const x=(i:number)=>xLeft+(i/(CUMULATIVE_PERIODS.length-1))*graphWidth;
  const y=(v:number)=>yBottom-(v-min)/(max-min)*graphHeight;
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const hasValues=rows.some(row=>row.values.some(value=>value!==null));
  const label=(n:number)=>Number.isInteger(n)?n.toFixed(0):n.toFixed(1);
  return <View style={style.visualCard} wrap={false}>
    <Text style={style.visualTitle}>Cumulative fund performance</Text>
    <Text style={style.visualNote}>Reported cumulative returns (%) by investment lookback period</Text>
    {hasValues?<Svg width="100%" height={278} viewBox="0 0 505 270">
      {ticks.map((tick,index)=><React.Fragment key={"grid-"+index}>
        <Line x1={xLeft} x2={xRight} y1={y(tick)} y2={y(tick)}
          stroke={Math.abs(tick)<1e-8?"#C6C5C0":"#E9E8E3"}
          strokeWidth={Math.abs(tick)<1e-8?1.5:.8}/>
        <Text x={8} y={y(tick)+3.5}
          style={{fontSize:9,fill:color.muted}}>{label(tick)}%</Text>
      </React.Fragment>)}
      {CUMULATIVE_PERIODS.map((period,i)=><React.Fragment key={period.key}>
        <Line x1={x(i)} x2={x(i)} y1={yTop} y2={yBottom}
          stroke="#F2F1ED" strokeWidth={.6}/>
        <Text x={x(i)-16} y={yBottom+22}
          style={{fontSize:10,fill:color.ink}}>{period.label}</Text>
      </React.Fragment>)}
      {rows.flatMap(({fund,values},fundIndex)=>{
        const lineColor=CHART_COLORS[fundIndex%CHART_COLORS.length];
        const segments=contiguousReturnSegments(values);
        const paths=segments.map((indices,j)=>
          <Path key={fund.id+"-line-"+j}
            d={indices.map((i,k)=>(k?"L":"M")+x(i).toFixed(2)+" "+y(values[i]!).toFixed(2)).join(" ")}
            stroke={lineColor} strokeWidth={2.7} fill="none"
            strokeLinejoin="round" strokeLinecap="round"/>);
        const markers=values.flatMap((value,i)=>value===null?[]:[
          <Circle key={fund.id+"-point-"+i} cx={x(i)} cy={y(value)}
            r={4.1} fill={lineColor} stroke="#FFFFFF" strokeWidth={1.1}/>
        ]);
        return [...paths,...markers];
      })}
    </Svg>:<Text style={[style.visualNote,{marginTop:15}]}>
      No 1-, 3-, 5- or 10-year cumulative return values are available for these funds.
    </Text>}
    <View style={{flexDirection:"row",flexWrap:"wrap",marginTop:13,gap:5}}>
      {funds.map((fund,i)=><View key={fund.id} style={{
        width:"49%",flexDirection:"row",alignItems:"flex-start",gap:7,
        paddingVertical:5,paddingRight:6
      }}>
        <View style={{backgroundColor:CHART_COLORS[i%CHART_COLORS.length],
          width:17,height:3,marginTop:5}}/>
        <Text style={{fontSize:8,color:color.ink,flex:1,lineHeight:1.35}}>
          {fund.name}
        </Text>
      </View>)}
    </View>
    <Text style={[style.visualNote,{marginTop:12}]}>
      Lines join reported lookback-period values; intervening monthly performance is not shown.
    </Text>
  </View>;
}
export default function WorkbookProposalPDF({data}:{data:WorkbookProposalData}){
  return <Document title="Omega Investment Bond Proposal"
    author="Omega Financial Management"
    subject="Investment bond proposal and selected portfolio allocations" language="en-IE">
    <Page size="A4" style={style.page}>
      <Banner label="INVESTMENT BOND PROPOSAL"/>
      <Text style={style.eyebrow}>INVESTMENT BOND & PORTFOLIO ALLOCATION</Text>
      <Text style={style.title}>Investment bond proposal</Text>
      <Text style={style.subtitle}>Prepared {data.preparedDate}</Text>
      <View style={style.hero}>
        <Text style={style.fieldLabel}>Initial investment</Text>
        <Text style={style.investment}>{euro(data.investment)}</Text>
        <View style={style.facts}>
          <View style={style.fact}><Text style={style.fieldLabel}>Prepared for</Text><Text style={style.fieldValue}>{data.client||"Client name not provided"}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Prepared by</Text><Text style={style.fieldValue}>{data.adviser}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Portfolio options</Text><Text style={style.fieldValue}>{String(data.portfolios.length)}</Text></View>
          <View style={style.fact}><Text style={style.fieldLabel}>Selected funds</Text><Text style={style.fieldValue}>{String(data.portfolios.reduce((n,p)=>n+p.funds.length,0))}</Text></View>
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

      <Footer/>
    </Page>
    {data.portfolios.map((p,index)=><Page key={p.id+"-visual"} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · VISUAL OVERVIEW"}/>
      <Text style={style.eyebrow}>PORTFOLIO ANALYSIS</Text>
      <Text style={style.heading}>{p.title} · At a glance</Text>
      <Text style={style.subtitle}>{p.description}</Text>
      <PortfolioAllocationChart funds={p.funds}/>
      <Footer/>
    </Page>)}
    {data.portfolios.flatMap((p,portfolioIndex)=>
      chartFundGroups(p.funds).map((group,groupIndex,groups)=>
        <Page key={p.id+"-cumulative-"+groupIndex} size="A4" style={style.page} wrap>
          <Banner label={"PORTFOLIO "+String.fromCharCode(65+portfolioIndex)+" · FUND PERFORMANCE"}/>
          <Text style={style.eyebrow}>CUMULATIVE PERFORMANCE</Text>
          <Text style={style.heading}>{p.title} · Fund comparison</Text>
          <Text style={style.subtitle}>
            1-, 3-, 5- and 10-year cumulative returns{groups.length>1?
              " · Group "+(groupIndex+1)+" of "+groups.length:""}
          </Text>
          <CumulativeReturnLineChart funds={group}/>
          <Footer/>
        </Page>)
    )}
    {data.portfolios.map((p,index)=><Page key={p.id} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · ALLOCATIONS"}/>
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
        <Text style={style.note}>Performance figures are cumulative percentages, not annualised. “—” indicates that a value is unavailable.</Text>
      </View>
      <View style={style.divider}/>
      <Text style={style.section}>Initial investment breakdown</Text>
      {p.funds.map(f=><View key={f.id} style={{flexDirection:"row",justifyContent:"space-between",marginBottom:6}} wrap={false}>
        <Text style={[style.note,{width:"76%"}]}>{f.name} ({f.weight.toFixed(2)}%)</Text>
        <Text style={style.note}>{euro(f.allocatedAmount)}</Text>
      </View>)}

      <Footer/>
    </Page>)}
    {data.portfolios.map((p,index)=><Page key={p.id+"-factsheets"} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · FUND DETAILS"}/>
      <Text style={style.eyebrow}>FUND INFORMATION</Text>
      <Text style={style.heading}>{p.title} · Fund details</Text>
      
      {p.funds.map(f=><View key={f.id+"-source"} style={style.sourceCard} wrap={false}>
        <Text style={style.sourceTitle}>{f.name}</Text>
        <Text style={style.meta}>{f.provider}{f.factsheet.date?" · As at "+f.factsheet.date:""}</Text>
        
        <Text style={style.meta}>MoneyMate ID: {f.factsheet.moneyMateId??"Not stated"} · Currency: {f.factsheet.baseCurrency??"Not stated"} · Numeric risk rating: {f.factsheet.riskRating==null?"Not stated":f.factsheet.riskRating+"/7"}</Text>
        <Text style={style.meta}>AMC: {percentage(f.factsheet.amcPct)} · CIV charge: {percentage(f.factsheet.civPct)}</Text>
        <Text style={style.meta}>Objective: {f.factsheet.objective??"Information unavailable"}</Text>
        {f.factsheet.strategy?<Text style={style.meta}>Strategy: {f.factsheet.strategy}</Text>:null}

      </View>)}

      <Footer/>
    </Page>)}
  </Document>;
}
