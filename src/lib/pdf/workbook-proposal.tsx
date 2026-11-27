import React from "react";
import {Document,Page,View,Text,StyleSheet,Svg,Path,Circle,Rect,Line} from "@react-pdf/renderer";
import {OMEGA_LOGO_PATHS} from "@/lib/branding/omega-logo-paths";
import {firstPageFundLimit,paginateFundDetails,originalFactsheetParagraph} from "@/lib/pdf/fund-detail-layout";
import {getFundRiskRating,RISK_RATING_CAVEAT} from "@/lib/fund-risk-ratings";
import {chartFundGroups} from "@/lib/pdf/cumulative-return-chart";
import type {PriceHistoryPoint} from "@/lib/reconciliation/monthly-prices";
import {FiveYearMonthlyChart,CHART_COLORS} from "@/lib/pdf/five-year-monthly-chart";
import {ExtendedFundInvestmentBreakdown} from "@/lib/pdf/expanded-portfolio-components";
import {isExpandedPortfolio,splitPerformanceFundGroups,
  paginateExpandedFundDetails}
  from "@/lib/pdf/adaptive-fund-layout";

export type WorkbookReturnPeriods = Record<
  "ytd"|"oneMonth"|"threeMonth"|"sixMonth"|"oneYear"|"threeYear"|"fiveYear"|"tenYear"|"sinceLaunch",
  number|null
>;
export type WorkbookProposalFund = {
  id:string;name:string;provider:string;weight:number;allocatedAmount:number;
  returns:WorkbookReturnPeriods;
  priceHistory?:PriceHistoryPoint[];
  factsheet:{
    filename:string|null; title:string|null; date:string|null;
    objective:string|null;strategy:string|null;moneyMateId:string|null;
    description?:string|null;riskDisclosure?:string|null;
    chargesDisclosure?:string|null;riskFactors?:string[];
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
  proposalTitle?:string;
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
  // A full printable A4 body keeps shorter chart/legend combinations from
  // shifting down the sheet; preserve the common page padding and fixed footer.
  chartPageBody:{width:"100%",height:750,flexDirection:"column",
    justifyContent:"flex-start"},
  banner:{backgroundColor:color.wine,borderRadius:7,paddingHorizontal:15,
    height:50,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
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
  sourceCard:{borderWidth:.7,borderColor:color.border,borderRadius:7,
    paddingHorizontal:11,paddingVertical:9,marginTop:9,height:194,
    backgroundColor:"#FDFDFC"},
  sourceTitle:{fontFamily:"Helvetica-Bold",fontSize:9.6,color:color.wine,marginBottom:4},
  meta:{fontSize:7.65,color:color.ink,lineHeight:1.38,marginBottom:4},
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
  style:"currency",currency:"EUR",maximumFractionDigits:2,minimumFractionDigits:2
}).format(n);
const percentage=(n:number|null)=>n==null || !Number.isFinite(n)
  ?"—":(n>0?"+":"")+n.toFixed(2)+"%";
function Logo(){
  return <Svg width={125} height={33} viewBox="0 0 1024 266">
    {OMEGA_LOGO_PATHS.map((d,i)=><Path key={i} d={d} fill="#FFFFFF" fillRule="evenodd"/>)}
  </Svg>;
}
function Banner(){
  return <View style={style.banner}><Logo/></View>;
}
function Footer(){
  return <View style={style.footer} fixed>
    <Text style={style.footerText}>OFM Financial Ltd T/A Omega Financial Management · regulated by the Central Bank of Ireland</Text>
  </View>;
}

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

/** Fund-level provider rating, displayed on its original 1–7 scale.
 * An outer black outline clearly highlights the selected segment.
 */
export const PDF_RISK_COLORS=[
  "#77777B","#3879B9","#727D34","#008B79",
  "#703094","#B6602D","#E41E2B"
] as const;
function FundRiskScale({fund}:{fund:WorkbookProposalFund}){
  const rating=getFundRiskRating(fund)?.rating??null;
  return <View style={{width:119,alignItems:"center"}}>
    <Text style={{fontFamily:"Helvetica-Bold",fontSize:7.3,
      color:color.wine,marginBottom:3}}>Risk Rating</Text>
    <Svg width={116} height={25} viewBox="0 0 116 25">
      {PDF_RISK_COLORS.map((fill,i)=><React.Fragment key={i}>
        <Rect x={i*16+2} y={3} width={14} height={18} fill={fill}/>
        <Text x={i*16+9} y={15.5} textAnchor="middle"
          style={{fontSize:10.2,fontFamily:"Helvetica-Bold",fill:"#FFFFFF"}}>
          {i+1}
        </Text>
      </React.Fragment>)}
      {rating!==null?<Rect x={(rating-1)*16+1} y={1} width={16} height={22}
        fill="none" stroke="#101010" strokeWidth={2.2}/>:null}
    </Svg>
    {rating===null?<Text style={{fontSize:6.5,color:color.muted}}>
      Not verified
    </Text>:null}
  </View>;
}
function compactAllocationNameSize(name:string){
  return name.length>54?5.8:name.length>44?6.1:name.length>34?6.4:6.8;
}
/** SVG-centred labels use the same 164×164 coordinates as both doughnuts.
 * Avoids the font-dependent offset of absolute-positioned overlay Views. */
function DoughnutCenterText({percentage}:{percentage:number}){
  return <React.Fragment>
    <Text x={82} y={81} textAnchor="middle" style={{
      fontFamily:"Helvetica-Bold",fontSize:18.2,fill:color.wine
    }}>{percentage.toFixed(2)}%</Text>
    <Text x={82} y={95} textAnchor="middle" style={{
      fontSize:8.6,fill:color.muted
    }}>allocated</Text>
  </React.Fragment>;
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
      <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
        <View style={{width:68,height:68,position:"relative"}}>
          <Svg width={68} height={68} viewBox="0 0 164 164">
            {allFunds.length===1?
              <Circle cx={82} cy={82} r={60} stroke={CHART_COLORS[0]}
                strokeWidth={24} fill="none"/>:
              paths.map(p=><Path key={p.id} d={p.path} fill={p.color}/>)}
            <Circle cx={82} cy={82} r={43} fill="#FFFFFF"/>
            <DoughnutCenterText percentage={portfolioWeight}/>
          </Svg>
        </View>
        <Text style={{fontFamily:"Times-Roman",fontSize:12.2,
          color:color.wine,flex:1}}>Portfolio allocation</Text>
      </View>
      <View style={{marginTop:5}}>
        {funds.map(f=>{
          const position=allFunds.findIndex(item=>item.id===f.id);
          return <View key={f.id} style={{
            flexDirection:"row",alignItems:"center",gap:4,
            marginBottom:dense?3:5
          }}>
            <View style={{width:6,height:6,borderRadius:1,
              backgroundColor:CHART_COLORS[position%CHART_COLORS.length]}}/>
            <Text wrap={false} hyphenationCallback={word=>[word]}
              style={{fontSize:compactAllocationNameSize(f.name),
                flex:1,color:color.ink,lineHeight:1.15}}>{f.name}</Text>
            <Text style={{fontFamily:"Helvetica-Bold",fontSize:6.2,
              color:color.ink,width:31,textAlign:"right"}}>
              {f.weight.toFixed(2)}%
            </Text>
          </View>;
        })}
      </View>
    </View>
    <View style={{
      width:"49%",borderWidth:.7,borderColor:color.border,
      borderRadius:7,padding:dense?10:12,backgroundColor:"#FDFDFC"
    }}>
      <Text style={{
        fontFamily:"Times-Roman",fontSize:14,color:color.wine,marginBottom:8
      }}>Amount breakdown</Text>
      <View style={{flexDirection:"row",justifyContent:"space-between",
        backgroundColor:color.pale,padding:7,marginBottom:dense?5:9}}>
        <Text style={{fontSize:8,fontFamily:"Helvetica-Bold"}}>Total amount</Text>
        <Text style={{fontSize:9,fontFamily:"Helvetica-Bold",color:color.wine}}>
          {euro(totalInvestment)}
        </Text>
      </View>
      {funds.map(f=><View key={f.id} style={{
        flexDirection:"row",alignItems:"center",justifyContent:"space-between",
        borderBottomWidth:.4,borderBottomColor:color.border,
        paddingVertical:dense?3:5
      }} wrap={false}>
        <Text wrap={false} hyphenationCallback={word=>[word]}
          style={{fontSize:compactAllocationNameSize(f.name),width:"72%",
            lineHeight:1.15,color:color.ink}}>
          {f.name}
        </Text>
        <Text wrap={false} style={{fontSize:6.5,width:"28%",textAlign:"right"}}>
          {euro(f.allocatedAmount)}
        </Text>
      </View>)}
    </View>
  </View>;
}
/** The opening page includes an allocation chart for every selected
 * portfolio. The dedicated five-year chart page follows the allocations. */
function CoverPortfolioAllocation({portfolio,multiple}:{
  portfolio:WorkbookProposalPortfolio;multiple:boolean
}){
  const funds=portfolio.funds;
  const expanded=isExpandedPortfolio(funds.length);
  const shown=funds.slice(0,expanded?funds.length:multiple?6:9);
  const size=expanded?160:multiple?84:109;
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
    paddingHorizontal:expanded?18:12,
    paddingVertical:expanded?18:multiple?8:11,
    marginTop:expanded?20:multiple?8:12,backgroundColor:"#FDFDFC"
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",
      fontSize:expanded?19:multiple?13.3:16,
      color:color.wine,marginBottom:expanded?13:multiple?3:8}}>
      {multiple?"Portfolio allocation · "+portfolio.title:"Portfolio allocation"}
    </Text>
    <View style={{flexDirection:"row",alignItems:"center",gap:expanded?22:15}}>
      <View style={{width:size,height:size,position:"relative"}}>
        <Svg width={size} height={size} viewBox="0 0 164 164">
          {funds.length===1?<Circle cx={82} cy={82} r={60}
            stroke={CHART_COLORS[0]} strokeWidth={24} fill="none"/>:
            paths.map(p=><Path key={p.id} d={p.d} fill={p.color}/>)}
          <Circle cx={82} cy={82} r={43} fill="#FFFFFF"/>
          <DoughnutCenterText percentage={percentageAllocated}/>
        </Svg>
      </View>
      <View style={{flex:1}}>
        {shown.map(f=>{
          const position=funds.findIndex(item=>item.id===f.id);
          return <View key={f.id} style={{
            flexDirection:"row",alignItems:"flex-start",gap:7,
            marginBottom:expanded?9:multiple?3:5
          }}>
            <View style={{width:8,height:8,borderRadius:2,marginTop:2,
              backgroundColor:CHART_COLORS[position%CHART_COLORS.length]}}/>
            <Text style={{
              flex:1,fontSize:expanded?9:multiple?7:8.2,
              color:color.ink,lineHeight:1.34
            }}>{f.name}</Text>
            <Text style={{
              fontFamily:"Helvetica-Bold",fontSize:expanded?9:multiple?7:8.1,
              textAlign:"right",width:expanded?50:42
            }}>{f.weight.toFixed(2)}%</Text>
          </View>;
        })}
        {funds.length>shown.length?<Text style={{
          fontSize:7.1,color:color.muted,marginTop:3
        }}>+ {funds.length-shown.length} further funds in the portfolio overview</Text>:null}
      </View>
    </View>
  </View>;
}
/** These paths represent only actual source observations in the PRICES worksheet.
 * The former 1/3/5/10-year interpolated-looking line chart is not used. */
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
  </View>;
}
export default function WorkbookProposalPDF({data}:{data:WorkbookProposalData}){
  const proposalTitle=data.proposalTitle?.trim()||"Investment bond proposal";
  return <Document title={proposalTitle}
    author="Omega Financial Management"
    subject={proposalTitle+" and selected portfolio allocations"} language="en-IE">
    <Page size="A4" style={style.page}>
      <Banner/>
      <Text style={style.eyebrow}>INTRODUCTION</Text>
      <Text hyphenationCallback={word=>[word]} style={[style.title,{
        fontSize:proposalTitle.length>85?20:proposalTitle.length>53?24:29,
        lineHeight:1.13,
        marginBottom:12
      }]}>{proposalTitle}</Text>
      <View style={style.hero} wrap={false}>
        <View style={{width:"31%"}}>
          <Text style={[style.fieldLabel,{fontSize:7.3,marginBottom:3}]}>Amount</Text>
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
        <Text style={style.section}>Objective</Text>
        <Text style={style.p}>{data.objective}</Text>
      </View>
      {data.portfolios.length===1&&data.portfolios[0].funds.length<=10?<CoverPortfolioAllocation
        portfolio={data.portfolios[0]} multiple={false}/>:null}
      {data.portfolios.filter(p=>!isExpandedPortfolio(p.funds.length))
        .map(p=><View key={p.id+"-cover-returns"} wrap={false}>
        {data.portfolios.length>1?<Text style={{
          fontFamily:"Helvetica-Bold",fontSize:9,color:color.wine,marginTop:9
        }}>{p.title}</Text>:null}
        <FundAllocationReturnsTable
          funds={p.funds.slice(0,firstPageFundLimit(data.portfolios.length))}
          dense={p.funds.length>4||data.portfolios.length>1}/>
        {p.funds.length>firstPageFundLimit(data.portfolios.length)?
          <Text style={{fontSize:7.5,color:color.muted,marginTop:4}}>
            Remaining allocations continue on the following page.
          </Text>:null}
      </View>)}

      <Footer/>
    </Page>
    {/* Extended portfolios reserve a complete page for every selected
        fund's allocations and all four workbook-return periods. */}
    {data.portfolios.flatMap((p,index)=>
      isExpandedPortfolio(p.funds.length)?[
        <Page key={p.id+"-expanded-allocations"} size="A4"
          style={style.page} wrap={false}>
          <Banner/>
          <Text style={[style.eyebrow,{marginTop:12}]}>PORTFOLIO ALLOCATION & RETURNS</Text>
          <Text style={[style.heading,{marginBottom:5}]}>
            {p.title} · All selected funds
          </Text>
          <FundAllocationReturnsTable funds={p.funds} dense={false}/>
          <ExtendedFundInvestmentBreakdown funds={p.funds}/>
          <Footer/>
        </Page>
      ]:[]
    )}
    {/* Add allocation-only continuation pages when the first-page table
        cannot fit every selected fund. The redundant overview chart page is removed. */}
    {data.portfolios.flatMap((p,index)=>
      (isExpandedPortfolio(p.funds.length)?[]:chartFundGroups(
        p.funds.slice(firstPageFundLimit(data.portfolios.length)),12
      )).map((group,groupIndex)=>
        <Page key={p.id+"-allocation-continuation-"+groupIndex}
          size="A4" style={style.page} wrap={false}>
          <Banner/>
          <Text style={[style.heading,{marginTop:11,marginBottom:4}]}>
            {p.title} · Remaining fund allocations
          </Text>
          <FundAllocationReturnsTable funds={group} dense={group.length>4}/>
          <Footer/>
        </Page>
      )
    )}
    {/* A dedicated chart page restores legible full-size performance charts.
        It is chart content, not the previously removed redundant overview. */}
    {data.portfolios.flatMap((p,index)=>
      (isExpandedPortfolio(p.funds.length)?
        splitPerformanceFundGroups(p.funds):chartFundGroups(p.funds,8))
        .filter(group=>group.some(f=>(f.priceHistory?.length??0)>=2))
        .map((group,chartIndex)=>
          <Page key={p.id+"-monthly-performance-"+chartIndex}
            size="A4" style={style.page} wrap={false}>
            <View style={style.chartPageBody} wrap={false}>
              <Banner/>
              <Text style={[style.eyebrow,{marginTop:11}]}>
                FIVE-YEAR HISTORICAL PERFORMANCE
              </Text>
              <Text style={[style.heading,{marginBottom:4}]}>
                {p.title} · Fund performance
              </Text>
              <FiveYearMonthlyChart funds={group}/>
              {!isExpandedPortfolio(p.funds.length)?
                <CompactPortfolioAllocationAndBreakdown
                  funds={group} allFunds={p.funds}
                  totalInvestment={data.investment} dense={group.length>4}/>:null}
            </View>
            <Footer/>
          </Page>
        )
    )}
    {data.portfolios.flatMap((p,index)=>
      (isExpandedPortfolio(p.funds.length)?
        paginateExpandedFundDetails(p.funds):paginateFundDetails(p.funds))
        .map((group,pageIndex,pages)=>
      <Page key={p.id+"-factsheets-"+pageIndex} size="A4"
        style={style.page} wrap={false}>
        <Banner/>
        <Text style={[style.eyebrow,{marginTop:9}]}>FUND INFORMATION</Text>
        <Text style={[style.heading,{marginBottom:3,fontSize:16}]}>
          {p.title} · Fund details
        </Text>
        {group.map(f=><View key={f.id+"-source"}
          style={[style.sourceCard,
            isExpandedPortfolio(p.funds.length)?{
              height:group.length===2?265:194,
              paddingVertical:13,paddingHorizontal:14,
              borderLeftWidth:3,borderLeftColor:color.gold
            }:{}]}
          wrap={false}>
          <View style={{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:6}}>
            <Text style={[style.sourceTitle,{width:"73%"},
              isExpandedPortfolio(p.funds.length)?{
                fontSize:11.1,marginBottom:6
              }:{}]}>{f.name}</Text>
            <FundRiskScale fund={f}/>
          </View>
          <Text style={{
            fontSize:8.6,lineHeight:1.52,color:color.ink,marginTop:8
          }}>
            {originalFactsheetParagraph(f.factsheet)||
              "A complete fund description is not available in the stored factsheet."}
          </Text>
        </View>)}
        <Text style={{fontSize:6.6,color:color.muted,marginTop:6,lineHeight:1.35}}>
          {RISK_RATING_CAVEAT}
        </Text>
        <Footer/>
      </Page>))}
  </Document>;
}
