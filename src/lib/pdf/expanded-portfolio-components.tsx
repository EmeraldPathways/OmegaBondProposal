import React from "react";
import {View,Text} from "@react-pdf/renderer";
import type {WorkbookProposalFund} from "@/lib/pdf/workbook-proposal";
import {CHART_COLORS} from "@/lib/pdf/five-year-monthly-chart";

const color={wine:"#671E27",gold:"#988B54",ink:"#31342F",muted:"#72766F",border:"#E4E3DE"};
const euro=(n:number)=>new Intl.NumberFormat("en-IE",{
  style:"currency",currency:"EUR",maximumFractionDigits:2,minimumFractionDigits:2
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
