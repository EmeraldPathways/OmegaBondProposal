import React from "react";
import {View,Text,Svg,Path,Rect,Line} from "@react-pdf/renderer";
import type {WorkbookProposalFund} from "@/lib/pdf/workbook-proposal";
import type {PriceHistoryPoint} from "@/lib/reconciliation/monthly-prices";

// Shared palette for the full-size performance chart and portfolio allocation.
export const CHART_COLORS=["#671E27","#A8995F","#647579","#809485","#AC7471","#9A9C94", "#977F70","#76808B","#B27F68","#526177"];
const color={wine:"#671E27",muted:"#72766F",border:"#E4E3DE",ink:"#31342F"};

function priceSegments(points:PriceHistoryPoint[]):PriceHistoryPoint[][]{
  const result:PriceHistoryPoint[][]=[];
  let segment:PriceHistoryPoint[]=[];
  for(const point of points){
    if(segment.length&&Date.parse(point.date)-Date.parse(segment[segment.length-1].date)>
      48*86400000){
      result.push(segment);segment=[];
    }
    segment.push(point);
  }
  if(segment.length)result.push(segment);
  return result;
}
/** Full-sized five-year chart built exclusively from the saved PRICES observations. */
export function FiveYearMonthlyChart({funds}:{funds:WorkbookProposalFund[]}){
  const series=funds.filter(f=>(f.priceHistory?.length??0)>=2);
  if(!series.length)return null;
  const points=series.flatMap(f=>f.priceHistory??[]);
  const times=points.map(point=>Date.parse(point.date+"T00:00:00Z"));
  const leftTime=Math.min(...times),rightTime=Math.max(...times);
  const values=points.map(point=>point.returnPct);
  const rawMin=Math.min(0,...values),rawMax=Math.max(0,...values);
  const padding=Math.max(2,(rawMax-rawMin)*.08);
  const domainMin=rawMin-padding,domainMax=rawMax+padding;
  const width=505,plotLeft=50,plotRight=487,plotTop=14,plotBottom=239;
  const axisY=(value:number)=>
    plotBottom-(value-domainMin)/Math.max(.01,domainMax-domainMin)*(plotBottom-plotTop);
  const axisX=(date:string)=>
    plotLeft+(Date.parse(date+"T00:00:00Z")-leftTime)/
      Math.max(1,rightTime-leftTime)*(plotRight-plotLeft);
  const yTicks=Array.from({length:6},(_,index)=>
    domainMin+(domainMax-domainMin)*index/5);
  const xTicks=Array.from({length:6},(_,index)=>{
    const stamp=leftTime+(rightTime-leftTime)*index/5;
    return {stamp,x:plotLeft+(plotRight-plotLeft)*index/5,
      year:new Date(stamp).getUTCFullYear()};
  });
  const startLabel=new Date(leftTime).toLocaleDateString("en-IE",
    {month:"short",year:"numeric",timeZone:"UTC"});
  const endLabel=new Date(rightTime).toLocaleDateString("en-IE",
    {month:"short",year:"numeric",timeZone:"UTC"});
  return <View style={{
    borderWidth:.7,borderColor:color.border,borderRadius:8,
    backgroundColor:"#FDFDFC",paddingHorizontal:14,paddingTop:11,paddingBottom:12,
    marginTop:10
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",fontSize:16.5,color:color.wine}}>
      Five-year fund performance
    </Text>
    <Text style={{fontSize:8.4,color:color.muted,marginTop:3,marginBottom:8}}>
      Reported cumulative returns (%) · {startLabel} – {endLabel}
    </Text>
    <Svg width="100%" height={275} viewBox="0 0 505 275">
      <Rect x={plotLeft} y={plotTop} width={plotRight-plotLeft}
        height={plotBottom-plotTop} fill="#FFFFFF" stroke="#E6E4E0"
        strokeWidth={.8}/>
      {yTicks.map((value,i)=><React.Fragment key={"tick-"+i}>
        <Line x1={plotLeft} x2={plotRight} y1={axisY(value)} y2={axisY(value)}
          stroke={Math.abs(value)<.001?"#BDB7AD":"#E9E8E3"}
          strokeWidth={Math.abs(value)<.001?1.1:.7}/>
        <Text x={plotLeft-8} y={axisY(value)+3} textAnchor="end"
          style={{fill:color.muted,fontSize:9}}>
          {value.toFixed(0)}%
        </Text>
      </React.Fragment>)}
      {xTicks.map((tick,i)=><React.Fragment key={"year-"+i}>
        <Line x1={tick.x} x2={tick.x} y1={plotTop} y2={plotBottom}
          stroke="#F1F0ED" strokeWidth={.6}/>
        <Text x={tick.x} y={plotBottom+18}
          textAnchor={i===0?"start":i===xTicks.length-1?"end":"middle"}
          style={{fill:color.muted,fontSize:9}}>{String(tick.year)}</Text>
      </React.Fragment>)}
      {series.flatMap((fund,i)=>
        priceSegments(fund.priceHistory??[]).map((segment,j)=>
          <Path key={fund.id+"-line-"+j}
            d={segment.map((point,k)=>
              (k?"L":"M")+axisX(point.date).toFixed(2)+" "+
              axisY(point.returnPct).toFixed(2)).join(" ")}
            fill="none" stroke={CHART_COLORS[i%CHART_COLORS.length]}
            strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"/>
        )
      )}
    </Svg>
    <View style={{flexDirection:"row",flexWrap:"wrap",marginTop:4}}>
      {series.map((fund,i)=><View key={fund.id}
        style={{width:"49%",flexDirection:"row",alignItems:"flex-start",
          gap:7,paddingVertical:4,paddingRight:9}}>
        <View style={{width:15,height:3,marginTop:4,
          backgroundColor:CHART_COLORS[i%CHART_COLORS.length]}}/>
        <Text style={{fontSize:8,color:color.ink,flex:1,lineHeight:1.25}}>
          {fund.name}
        </Text>
      </View>)}
    </View>
    <Text style={{fontSize:7.3,color:color.muted,marginTop:6}}>
      Source: the current monthly workbook PRICES tab. Lines follow reported
      monthly observations; unavailable periods are not estimated.
    </Text>
  </View>;
}
