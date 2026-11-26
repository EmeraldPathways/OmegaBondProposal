import React from "react";
import {View,Text} from "@react-pdf/renderer";
import type {WorkbookProposalFund,WorkbookProposalPortfolio} from "@/lib/pdf/workbook-proposal";
import {CHART_COLORS} from "@/lib/pdf/five-year-monthly-chart";

const color={wine:"#671E27",gold:"#988B54",ink:"#31342F",muted:"#72766F",border:"#E4E3DE"};
const euro=(n:number)=>new Intl.NumberFormat("en-IE",{
  style:"currency",currency:"EUR",maximumFractionDigits:2,minimumFractionDigits:0
}).format(n);

export function ExtendedFundInvestmentBreakdown({funds}:{
  funds:WorkbookProposalFund[]
}){
  const midpoint=Math.ceil(funds.length/2);
  return <View style={{
    marginTop:23,borderWidth:.7,borderColor:color.border,
    borderRadius:8,padding:15,backgroundColor:"#FDFDFC"
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",fontSize:15.5,
      color:color.wine,marginBottom:11}}>Initial investment breakdown</Text>
    <View style={{flexDirection:"row",gap:16}}>
      {[funds.slice(0,midpoint),funds.slice(midpoint)].map((items,column)=>
        <View key={column} style={{width:"48%"}}>
          {items.map(f=>{
            const i=funds.findIndex(entry=>entry.id===f.id);
            return <View key={f.id} style={{
              flexDirection:"row",gap:7,alignItems:"center",
              minHeight:30,paddingVertical:6,
              borderBottomWidth:.5,borderBottomColor:color.border
            }}>
              <View style={{
                width:7,height:7,backgroundColor:CHART_COLORS[i%CHART_COLORS.length],
                borderRadius:2
              }}/>
              <Text style={{fontSize:7.6,flex:1,color:color.ink,lineHeight:1.25}}>
                {f.name}
              </Text>
              <Text style={{fontSize:8,fontFamily:"Helvetica-Bold",
                color:color.wine,textAlign:"right"}}>
                {euro(f.allocatedAmount)}
              </Text>
            </View>;
          })}
        </View>
      )}
    </View>
  </View>;
}
export function ExtendedChartFundSummary({group,portfolio}:{
  group:WorkbookProposalFund[];portfolio:WorkbookProposalPortfolio
}){
  return <View style={{
    marginTop:16,borderWidth:.7,borderColor:color.border,borderRadius:8,
    paddingHorizontal:15,paddingVertical:13,backgroundColor:"#FDFDFC"
  }} wrap={false}>
    <Text style={{fontFamily:"Times-Roman",fontSize:15.5,
      color:color.wine,marginBottom:9}}>Funds represented in this chart</Text>
    {group.map((f,i)=><View key={f.id} style={{
      flexDirection:"row",alignItems:"center",gap:9,paddingVertical:8,
      borderBottomWidth:i===group.length-1?0:.45,
      borderBottomColor:color.border
    }}>
      <View style={{
        width:20,height:3,
        backgroundColor:CHART_COLORS[i%CHART_COLORS.length]
      }}/>
      <View style={{flex:1}}>
        <Text style={{fontFamily:"Helvetica-Bold",fontSize:8.3,color:color.ink}}>
          {f.name}
        </Text>
        <Text style={{fontSize:7.4,color:color.muted,marginTop:2}}>
          {f.provider}
        </Text>
      </View>
      <Text style={{
        fontFamily:"Helvetica-Bold",fontSize:8.5,color:color.ink,width:52,
        textAlign:"right"
      }}>{f.weight.toFixed(2)}%</Text>
      <Text style={{fontSize:8.5,color:color.ink,width:89,textAlign:"right"}}>
        {euro(f.allocatedAmount)}
      </Text>
    </View>)}
    <View style={{flexDirection:"row",justifyContent:"space-between",marginTop:8}}>
      <Text style={{fontSize:7.4,color:color.muted}}>
        {group.length} of {portfolio.funds.length} selected funds
      </Text>
      <Text style={{fontSize:7.4,color:color.muted}}>
        Portfolio weight: {group.reduce((sum,f)=>sum+f.weight,0).toFixed(2)}%
      </Text>
    </View>
  </View>;
}
