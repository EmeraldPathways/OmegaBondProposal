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
    riskProfile?:string|null;managedBy?:string|null;
    managementStyle?:string|null;assetMix?:string|null;taxStatus?:string|null;
    equityRange?:string|null;sfdrClass?:string|null;
    expenseRatioPct?:number|null;
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
  eyebrow:{fontSize:8,color:color.gold,fontFamily:"Helvetica-Bold",letterSpacing:1.4,marginTop:12},
  title:{fontFamily:"Times-Roman",fontSize:27,color:color.wine,marginTop:5,marginBottom:4},
  heading:{fontFamily:"Times-Roman",fontSize:18,color:color.wine,marginBottom:10},
  subtitle:{fontSize:9,color:color.muted,lineHeight:1.5},
  hero:{backgroundColor:color.pale,borderWidth:1,borderColor:color.border,borderRadius:7,
    marginTop:8,paddingHorizontal:12,paddingVertical:7,
    flexDirection:"row",alignItems:"center",gap:13},
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

/** One-page portfolio layout: chart above, small allocation/breakdown,
 * and the original reported-return table anchored below. */
function CompactPortfolioAllocationAndBreakdown({
  funds,allFunds,totalInvestment,dense
}:{
  funds:WorkbookProposalFund[];
  allFunds:WorkbookProposalFund[];
  totalInvestment:number;
  dense:boolean;
}){
  let total=0;
  const paths=allFunds.map((fund,index)=>{
    const start=total;total+=fund.weight;
    const gap=Math.min(.5,360*fund.weight/100/10);
    return {id:fund.id,color:CHART_COLORS[index%CHART_COLORS.length],
      path:ringWedge(82,82,72,48,
        -90+start*3.6+gap,-90+total*3.6-gap)};
  });
  const portfolioWeight=allFunds.reduce((n,f)=>n+f.weight,0);
  return <View style={{flexDirection:"row",gap:11,marginTop:11}} wrap={false}>
    <View style={{
      width:"49%",borderWidth:.7,borderColor:color.border,
      borderRadius:7,padding:dense?10:12,backgroundColor:"#FDFDFC"
    }}>
      <Text style={{
        fontFamily:"Times-Roman",fontSize:14,color:color.wine,marginBottom:7
      }}>Portfolio allocation</Text>
      <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
        <View style={{width:100,height:101,position:"relative"}}>
          <Svg width={98} height={98} viewBox="0 0 164 164">
            {allFunds.length===1?
              <Circle cx={82} cy={82} r={60} stroke={CHART_COLORS[0]}
                strokeWidth={24} fill="none"/>:
              paths.map(p=><Path key={p.id} d={p.path} fill={p.color}/>)}
            <Circle cx={82} cy={82} r={43} fill="#FFFFFF"/>
          </Svg>
          <View style={{position:"absolute",top:37,left:15,width:68,alignItems:"center"}}>
            <Text style={{fontFamily:"Helvetica-Bold",fontSize:15,color:color.wine}}>
              {portfolioWeight.toFixed(0)}%
            </Text>
            <Text style={{fontSize:6.5,color:color.muted}}>allocated</Text>
          </View>
        </View>
        <View style={{flex:1}}>
          {funds.map(f=>{
            const position=allFunds.findIndex(item=>item.id===f.id);
            return <View key={f.id} style={{
              flexDirection:"row",alignItems:"flex-start",
              gap:4,marginBottom:dense?3:7
            }}>
              <View style={{width:7,height:7,marginTop:2,borderRadius:1,
                backgroundColor:CHART_COLORS[position%CHART_COLORS.length]}}/>
              <Text style={{fontSize:dense?6.3:7,lineHeight:1.25,
                flex:1,color:color.ink}}>{f.name}</Text>
              <Text style={{fontFamily:"Helvetica-Bold",fontSize:dense?6.5:7.2,
                color:color.ink,width:30,textAlign:"right"}}>{f.weight.toFixed(0)}%</Text>
            </View>;
          })}
        </View>
      </View>
    </View>
    <View style={{
      width:"49%",borderWidth:.7,borderColor:color.border,
      borderRadius:7,padding:dense?10:12,backgroundColor:"#FDFDFC"
    }}>
      <Text style={{
        fontFamily:"Times-Roman",fontSize:14,color:color.wine,marginBottom:8
      }}>Initial investment breakdown</Text>
      <View style={{flexDirection:"row",justifyContent:"space-between",
        backgroundColor:color.pale,padding:7,marginBottom:dense?5:9}}>
        <Text style={{fontSize:8,fontFamily:"Helvetica-Bold"}}>Total initial investment</Text>
        <Text style={{fontSize:9,fontFamily:"Helvetica-Bold",color:color.wine}}>
          {euro(totalInvestment)}
        </Text>
      </View>
      {funds.map(f=><View key={f.id} style={{
        flexDirection:"row",justifyContent:"space-between",
        borderBottomWidth:.4,borderBottomColor:color.border,
        paddingVertical:dense?3:5
      }}>
        <Text style={{fontSize:dense?6.7:7.4,width:"73%",lineHeight:1.2}}>
          {f.name} ({f.weight.toFixed(0)}%)
        </Text>
        <Text style={{fontSize:dense?7:7.5,textAlign:"right"}}>
          {euro(f.allocatedAmount)}
        </Text>
      </View>)}
    </View>
  </View>;
}
/** The opening page includes an allocation chart for every selected
 * portfolio. The full-size per-portfolio overview remains unchanged. */
function CoverPortfolioAllocation({portfolio,multiple}:{
  portfolio:WorkbookProposalPortfolio;multiple:boolean
}){
  const funds=portfolio.funds;
  const shown=funds.slice(0,multiple?6:9);
  const size=multiple?84:109;
  const paths:{id:string;d:string;color:string}[]=[];
  let cumulative=0;
  funds.forEach((fund,i)=>{
    const start=cumulative;
    cumulative+=fund.weight;
    const gap=Math.min(.5,360*fund.weight/100/10);
    paths.push({id:fund.id,color:CHART_COLORS[i%CHART_COLORS.length],
      d:ringWedge(82,82,72,48,
        -90+start*3.6+gap,-90+cumulative*3.6-gap)});
  });
  const percentageAllocated=funds.reduce((total,f)=>total+f.weight,0);
  return <View style={{
    borderWidth:.7,borderColor:color.border,borderRadius:7,
    paddingHorizontal:12,paddingVertical:multiple?8:11,
    marginTop:multiple?8:12,backgroundColor:"#FDFDFC"
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",fontSize:multiple?13.3:16,
      color:color.wine,marginBottom:multiple?3:8}}>
      {multiple?"Portfolio allocation · "+portfolio.title:"Portfolio allocation"}
    </Text>
    <View style={{flexDirection:"row",alignItems:"center",gap:15}}>
      <View style={{width:size,height:size,position:"relative"}}>
        <Svg width={size} height={size} viewBox="0 0 164 164">
          {funds.length===1?<Circle cx={82} cy={82} r={60}
            stroke={CHART_COLORS[0]} strokeWidth={24} fill="none"/>:
            paths.map(p=><Path key={p.id} d={p.d} fill={p.color}/>)}
          <Circle cx={82} cy={82} r={43} fill="#FFFFFF"/>
        </Svg>
        <View style={{
          position:"absolute",top:multiple?31:40,left:multiple?11:16,
          width:multiple?62:77,alignItems:"center"
        }}>
          <Text style={{fontFamily:"Helvetica-Bold",
            fontSize:multiple?13:17,color:color.wine}}>
            {percentageAllocated.toFixed(0)}%
          </Text>
          <Text style={{fontSize:multiple?6:7,color:color.muted}}>allocated</Text>
        </View>
      </View>
      <View style={{flex:1}}>
        {shown.map(f=>{
          const position=funds.findIndex(item=>item.id===f.id);
          return <View key={f.id} style={{
            flexDirection:"row",alignItems:"flex-start",gap:7,
            marginBottom:multiple?3:5
          }}>
            <View style={{width:8,height:8,borderRadius:2,marginTop:2,
              backgroundColor:CHART_COLORS[position%CHART_COLORS.length]}}/>
            <Text style={{
              flex:1,fontSize:multiple?7:8.2,
              color:color.ink,lineHeight:1.3
            }}>{f.name}</Text>
            <Text style={{
              fontFamily:"Helvetica-Bold",fontSize:multiple?7:8.1,
              textAlign:"right",width:42
            }}>{f.weight.toFixed(1)}%</Text>
          </View>;
        })}
        {funds.length>shown.length?<Text style={{
          fontSize:7.1,color:color.muted,marginTop:3
        }}>+ {funds.length-shown.length} further funds in the portfolio overview</Text>:null}
      </View>
    </View>
  </View>;
}
function CumulativeReturnLineChart({funds,dense}:{
  funds:WorkbookProposalFund[];dense:boolean
}){
  const rows=funds.map(f=>({fund:f,values:cumulativeReturnValues(f.returns)}));
  const {min,max}=cumulativeChartDomain(rows.map(row=>row.values));
  const xLeft=55,xRight=485,yTop=16,yBottom=180;
  const graphWidth=xRight-xLeft,graphHeight=yBottom-yTop;
  const x=(i:number)=>xLeft+(i/(CUMULATIVE_PERIODS.length-1))*graphWidth;
  const y=(v:number)=>yBottom-(v-min)/(max-min)*graphHeight;
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const hasValues=rows.some(row=>row.values.some(value=>value!==null));
  const label=(n:number)=>Number.isInteger(n)?n.toFixed(0):n.toFixed(1);
  return <View style={{
    borderWidth:.7,borderColor:color.border,borderRadius:8,
    paddingHorizontal:12,paddingTop:11,paddingBottom:dense?8:10,
    marginTop:11,backgroundColor:"#FDFDFC"
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",color:color.wine,fontSize:16,
      marginBottom:4}}>Cumulative fund performance</Text>
    <Text style={{fontSize:7.8,color:color.muted}}>
      Reported cumulative returns (%) · 1-, 3-, 5- and 10-year lookback periods
    </Text>
    {hasValues?<Svg width="100%" height={dense?155:184} viewBox="0 0 505 210">
      {ticks.map((tick,index)=><React.Fragment key={"grid-"+index}>
        <Line x1={xLeft} x2={xRight} y1={y(tick)} y2={y(tick)}
          stroke={Math.abs(tick)<1e-8?"#C6C5C0":"#E9E8E3"}
          strokeWidth={Math.abs(tick)<1e-8?1.4:.8}/>
        <Text x={6} y={y(tick)+3.5}
          style={{fontSize:9,fill:color.muted}}>{label(tick)}%</Text>
      </React.Fragment>)}
      {CUMULATIVE_PERIODS.map((period,i)=><React.Fragment key={period.key}>
        <Line x1={x(i)} x2={x(i)} y1={yTop} y2={yBottom}
          stroke="#F0EFEB" strokeWidth={.5}/>
        <Text x={x(i)-18} y={yBottom+22}
          style={{fontSize:10,fill:color.ink}}>{period.label}</Text>
      </React.Fragment>)}
      {rows.flatMap(({fund,values},fundIndex)=>{
        const lineColor=CHART_COLORS[fundIndex%CHART_COLORS.length];
        const paths=contiguousReturnSegments(values).map((indices,j)=>
          <Path key={fund.id+"-line-"+j}
            d={indices.map((i,k)=>(k?"L":"M")+x(i).toFixed(2)+" "+
              y(values[i]!).toFixed(2)).join(" ")}
            stroke={lineColor} strokeWidth={2.8} fill="none"
            strokeLinejoin="round" strokeLinecap="round"/>);
        const markers=values.flatMap((value,i)=>value===null?[]:[
          <Circle key={fund.id+"-point-"+i} cx={x(i)} cy={y(value)}
            r={3.8} fill={lineColor} stroke="#FFFFFF" strokeWidth={1.1}/>
        ]);
        return [...paths,...markers];
      })}
    </Svg>:<Text style={{marginTop:15,fontSize:8,color:color.muted}}>
      No reported 1-, 3-, 5- or 10-year returns are available.
    </Text>}
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:dense?2:4,
      marginTop:dense?4:7}}>
      {funds.map((fund,i)=><View key={fund.id} style={{
        width:"49%",flexDirection:"row",alignItems:"flex-start",
        gap:6,paddingVertical:dense?2:4
      }}>
        <View style={{backgroundColor:CHART_COLORS[i%CHART_COLORS.length],
          width:13,height:2.5,marginTop:4}}/>
        <Text style={{fontSize:dense?7:7.6,color:color.ink,flex:1,
          lineHeight:1.3}}>{fund.name}</Text>
      </View>)}
    </View>
  </View>;
}
function FundAllocationReturnsTable({funds,dense}:{
  funds:WorkbookProposalFund[];dense:boolean
}){
  return <View style={{marginTop:dense?10:14}}>
    <Text style={{fontFamily:"Times-Roman",fontSize:14.5,color:color.wine,
      marginBottom:7}}>Fund allocations and reported cumulative returns</Text>
    <View style={{flexDirection:"row",backgroundColor:"#F3F2EE",
      paddingVertical:dense?6:8,borderBottomWidth:1,
      borderBottomColor:color.border}}>
      {[
        {value:"FUND",width:"37%"},{value:"WEIGHT",width:"12%"},
        {value:"1 YEAR",width:"13%"},{value:"3 YEARS",width:"13%"},
        {value:"5 YEARS",width:"13%"},{value:"10 YEARS",width:"12%"}
      ].map((head,index)=><View key={head.value} style={{
        width:head.width,paddingHorizontal:index?2:7
      }}>
        <Text style={{fontSize:dense?6.5:7,fontFamily:"Helvetica-Bold",
          color:color.muted,textAlign:index?"right":"left"}}>{head.value}</Text>
      </View>)}
    </View>
    {funds.map(f=><View key={f.id} style={{
      flexDirection:"row",alignItems:"center",minHeight:dense?22:31,
      paddingVertical:dense?3:5,borderBottomWidth:.6,borderBottomColor:color.border
    }} wrap={false}>
      <View style={{width:"37%",paddingHorizontal:7}}>
        <Text style={{fontFamily:"Helvetica-Bold",fontSize:dense?7:8,
          lineHeight:1.24}}>{f.name}</Text>
        {!dense&&<Text style={{fontSize:6.9,color:color.muted,marginTop:2}}>
          {f.provider}
        </Text>}
      </View>
      <View style={{width:"12%",paddingHorizontal:2}}>
        <Text style={{fontSize:dense?7:7.8,textAlign:"right"}}>
          {f.weight.toFixed(2)}%
        </Text>
      </View>
      {([f.returns.oneYear,f.returns.threeYear,
          f.returns.fiveYear,f.returns.tenYear] as (number|null)[])
        .map((value,index)=><View key={index} style={{
          width:index===3?"12%":"13%",paddingHorizontal:2
        }}>
          <Text style={{fontSize:dense?7:7.8,textAlign:"right"}}>
            {percentage(value)}
          </Text>
        </View>)}
    </View>)}
    <Text style={{fontSize:7.2,color:color.muted,marginTop:7}}>
      Cumulative returns, not annualised · — indicates unavailable data
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
      <View style={style.hero} wrap={false}>
        <View style={{width:"31%"}}>
          <Text style={[style.fieldLabel,{fontSize:7.3,marginBottom:3}]}>Initial investment</Text>
          <Text style={[style.investment,{fontSize:20,marginBottom:0}]}>{euro(data.investment)}</Text>
        </View>
        <View style={{width:"66%",gap:7}}>
          <View style={{flexDirection:"row",gap:9}}>
            <View style={{width:"49%"}}>
              <Text style={[style.fieldLabel,{fontSize:7,marginBottom:2}]}>Prepared for</Text>
              <Text style={[style.fieldValue,{fontSize:9.1}]}>{data.client||"Client name not provided"}</Text>
            </View>
            <View style={{width:"49%"}}>
              <Text style={[style.fieldLabel,{fontSize:7,marginBottom:2}]}>Prepared by</Text>
              <Text style={[style.fieldValue,{fontSize:9.1}]}>{data.adviser}</Text>
            </View>
          </View>
          <View style={{flexDirection:"row",gap:9}}>
            <View style={{width:"49%"}}>
              <Text style={[style.fieldLabel,{fontSize:7,marginBottom:2}]}>Portfolio options</Text>
              <Text style={[style.fieldValue,{fontSize:9.1}]}>{String(data.portfolios.length)}</Text>
            </View>
            <View style={{width:"49%"}}>
              <Text style={[style.fieldLabel,{fontSize:7,marginBottom:2}]}>Selected funds</Text>
              <Text style={[style.fieldValue,{fontSize:9.1}]}>{String(data.portfolios.reduce((n,p)=>n+p.funds.length,0))}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={style.box}>
        <Text style={style.section}>Investment objective</Text>
        <Text style={style.p}>{data.objective}</Text>
      </View>
      {data.portfolios.map(p=><CoverPortfolioAllocation
        key={p.id} portfolio={p} multiple={data.portfolios.length>1}/>)}

      <Footer/>
    </Page>
    {data.portfolios.flatMap((p,index)=>
      chartFundGroups(p.funds,8).map((group,groupIndex,groups)=>{
        const dense=group.length>4;
        const portfolioLabel="PORTFOLIO "+String.fromCharCode(65+index);
        return <Page key={p.id+"-overview-"+groupIndex}
          size="A4" style={style.page} wrap={false}>
          <Banner label={portfolioLabel+" · INVESTMENT OVERVIEW"}/>
          <Text style={[style.heading,{marginTop:11,marginBottom:4}]}>
            {p.title}
          </Text>
          <Text style={style.subtitle}>
            {p.description}{groups.length>1?
              " · Funds "+(groupIndex*8+1)+"–"+(groupIndex*8+group.length)+
              " of "+p.funds.length:""}
          </Text>
          <CumulativeReturnLineChart funds={group} dense={dense}/>
          <CompactPortfolioAllocationAndBreakdown
            funds={group} allFunds={p.funds}
            totalInvestment={data.investment} dense={dense}/>
          <FundAllocationReturnsTable funds={group} dense={dense}/>
          <Footer/>
        </Page>;
      })
    )}
    {data.portfolios.map((p,index)=><Page key={p.id+"-factsheets"} size="A4" style={style.page} wrap>
      <Banner label={"PORTFOLIO "+String.fromCharCode(65+index)+" · FUND DETAILS"}/>
      <Text style={style.eyebrow}>FUND INFORMATION</Text>
      <Text style={style.heading}>{p.title} · Fund details</Text>
      
      {p.funds.map(f=><View key={f.id+"-source"} style={style.sourceCard} wrap={false}>
        <Text style={style.sourceTitle}>{f.name}</Text>
        <Text style={style.meta}>{f.provider}{f.factsheet.date?" · As at "+f.factsheet.date:""}</Text>
        
        {f.factsheet.moneyMateId?<Text style={style.meta}>
          MoneyMate ID: {f.factsheet.moneyMateId}
        </Text>:null}
        {f.factsheet.baseCurrency?<Text style={style.meta}>
          Base currency: {f.factsheet.baseCurrency}
        </Text>:null}
        {f.factsheet.riskProfile?<Text style={style.meta}>
          Risk profile: {f.factsheet.riskProfile}
        </Text>:f.factsheet.riskRating!=null?<Text style={style.meta}>
          {f.provider==="Standard Life"?"Volatility rating":"Risk rating"}:
          {" "+f.factsheet.riskRating}/7
        </Text>:null}
        {f.factsheet.managedBy?<Text style={style.meta}>
          {f.provider==="Standard Life"?"Fund manager":"Managed by"}:
          {" "+f.factsheet.managedBy}
        </Text>:null}
        {f.factsheet.managementStyle?<Text style={style.meta}>
          Investment style: {f.factsheet.managementStyle}
        </Text>:null}
        {f.factsheet.assetMix?<Text style={style.meta}>
          Asset mix: {f.factsheet.assetMix}
        </Text>:null}
        {f.factsheet.equityRange?<Text style={style.meta}>
          Indicative equity range: {f.factsheet.equityRange}
        </Text>:null}
        {f.factsheet.sfdrClass?<Text style={style.meta}>
          SFDR class: {f.factsheet.sfdrClass}
        </Text>:null}
        {f.factsheet.taxStatus?<Text style={style.meta}>
          Tax basis: {f.factsheet.taxStatus}
        </Text>:null}
        {f.factsheet.amcPct!=null?<Text style={style.meta}>
          Annual management charge: {percentage(f.factsheet.amcPct)}
        </Text>:null}
        {f.provider==="Aviva"&&f.factsheet.civPct!=null?
          <Text style={style.meta}>CIV charge: {percentage(f.factsheet.civPct)}</Text>:null}
        {f.provider==="Standard Life"&&f.factsheet.expenseRatioPct!=null?
          <Text style={style.meta}>
            Total expense ratio: {percentage(f.factsheet.expenseRatioPct)}
          </Text>:null}
        <Text style={style.meta}>
          {f.provider==="New Ireland"||f.provider==="Zurich"?
            "Fund description":"Investment objective"}:
          {" "+(f.factsheet.objective??"Information unavailable")}
        </Text>
        {f.factsheet.strategy?<Text style={style.meta}>
          Strategy: {f.factsheet.strategy}
        </Text>:null}

      </View>)}

      <Footer/>
    </Page>)}
  </Document>;
}
