"use client";

import {useEffect,useState} from "react";
import type {PriceHistoryPoint} from "@/lib/reconciliation/monthly-prices";

type HistoryResponse={
  source:{filename:string;from:string;to:string;periods:number}|null;
  points:PriceHistoryPoint[];
};
const format=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1);
export default function FundPriceHistoryChart({fundId}:{fundId:string}){
  const [history,setHistory]=useState<HistoryResponse|null>(null);
  useEffect(()=>{
    let live=true;
    setHistory(null);
    fetch("/api/fund-price-history?fundId="+encodeURIComponent(fundId),
      {credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(live)setHistory(data as HistoryResponse|null)})
      .catch(()=>{if(live)setHistory(null)});
    return ()=>{live=false};
  },[fundId]);
  const points=history?.points??[];
  if(points.length<2)return null;
  const times=points.map(p=>Date.parse(p.date+"T00:00:00Z"));
  const range=[Math.min(...times),Math.max(...times)];
  const values=points.map(p=>p.returnPct);
  const low=Math.min(0,...values),high=Math.max(0,...values);
  const slack=Math.max(2,(high-low)*.07);
  const min=low-slack,max=high+slack;
  const W=640,H=175,l=43,r=12,t=10,b=24;
  const x=(dt:number)=>l+(dt-range[0])/Math.max(1,range[1]-range[0])*(W-l-r);
  const y=(n:number)=>H-b-(n-min)/(max-min)*(H-t-b);
  const segments:number[][]=[];let segment:number[]=[];
  for(let i=0;i<points.length;i++){
    if(i>0&&times[i]-times[i-1]>48*86400000){
      if(segment.length)segments.push(segment);
      segment=[];
    }
    segment.push(i);
  }
  if(segment.length)segments.push(segment);
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  return <div style={{marginTop:18}}>
    <h3 style={{marginBottom:6}}>Five-year fund performance</h3>
    <svg viewBox={"0 0 "+W+" "+H} role="img"
      aria-label={"Reported cumulative fund return percentages from "+
        points[0].label+" to "+points[points.length-1].label}
      style={{display:"block",width:"100%",height:"auto"}}>
      {ticks.map((tick,i)=><g key={i}>
        <line x1={l} x2={W-r} y1={y(tick)} y2={y(tick)}
          stroke="#E4E3DE" strokeWidth=".8"/>
        <text x={l-7} y={y(tick)+3} textAnchor="end"
          fill="#72766F" fontSize="10">{format(tick)}%</text>
      </g>)}
      {segments.map((indices,i)=>
        <polyline key={i} fill="none" stroke="#671E27" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          points={indices.map(j=>x(times[j])+","+y(points[j].returnPct)).join(" ")}/>
      )}
      <text x={l} y={H-5} textAnchor="start" fontSize="10" fill="#72766F">
        {points[0].label.replace(/^5Y\s+/,"")}
      </text>
      <text x={W-r} y={H-5} textAnchor="end" fontSize="10" fill="#72766F">
        {points[points.length-1].label.replace(/^5Y\s+/,"")}
      </text>
    </svg>
    <p className="muted" style={{fontSize:12,marginTop:4}}>
      Reported cumulative return (%) · {points.length} observations
    </p>
  </div>;
}

