"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, RefreshCw, Search, ShieldAlert } from "lucide-react";

type Candidate = {
  sourceName: string;
  confidence: number;
  returns: Record<string,number|null>;
};
type FundReview = {
  fund_id: string;
  provider_name: string;
  display_name: string;
  source_sheet: string;
  status: string;
  suggestions: Candidate[];
};
type ScanResponse = {
  scanned?: boolean;
  reviews?: FundReview[];
  shortlisted?: number;
  withSuggestions?: number;
  unavailable?: number;
  error?: string;
  message?: string;
};

const percent=(value:number|null|undefined)=>value==null?"N/A":value.toFixed(2)+"%";

export default function FundPerformanceReview() {
  const [scanning,setScanning]=useState(false);
  const [loading,setLoading]=useState(true);
  const [reviews,setReviews]=useState<FundReview[]>([]);
  const [scanned,setScanned]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const response=await fetch("/api/fund-performance/scan",{credentials:"same-origin",cache:"no-store"});
      const data:ScanResponse=await response.json();
      if(!response.ok)throw new Error(data.error||"Could not load staged performance matching.");
      setScanned(Boolean(data.scanned));
      setReviews(data.reviews??[]);
    }catch(e){
      setError(e instanceof Error?e.message:"Could not load matching status.");
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{void refresh()},[]);

  async function scan() {
    setScanning(true);
    setError("");
    setMessage("");
    try {
      const response=await fetch("/api/fund-performance/scan",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:"{}"
      });
      const data:ScanResponse=await response.json();
      if(!response.ok)throw new Error(data.error||"Workbook matching could not start.");
      setMessage((data.message||"Workbook scanned.")+" "+String(data.withSuggestions??0)+
        " approved funds have suggested source rows; "+String(data.unavailable??0)+" require manual lookup.");
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"Could not scan the performance workbook.");
    }finally{
      setScanning(false);
    }
  }

  const filtered=useMemo(()=>reviews.filter(r=>
    (r.provider_name+" "+r.display_name).toLowerCase().includes(search.trim().toLowerCase())
  ),[reviews,search]);
  const matched=reviews.filter(r=>r.suggestions?.length>0).length;

  return <section className="panel padded" style={{marginTop:24,marginBottom:24}}>
    <div className="panel-heading">
      <div><span className="eyebrow">REVIEW WORKFLOW</span>
        <h2 style={{marginTop:8}}>Match published performance to the approved funds</h2>
      </div>
      <span className="soft-pill">115-fund shortlist only</span>
    </div>
    <p className="muted">Scan the uploaded November 2026 workbook to find possible performance-series matches for each approved fund. This does not approve or publish any return figure. It never invents monthly prices.</p>
    <div className="button-row">
      <button type="button" className="btn primary" onClick={()=>void scan()} disabled={scanning}>
        {scanning?<RefreshCw size={16}/>:<Database size={16}/>}
        {scanning?"Scanning source workbook...":"Scan uploaded Omega workbook"}
      </button>
      <button type="button" className="btn quiet" disabled={loading||scanning} onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh review</button>
    </div>
    {message&&<div role="status" className="notice success"><CheckCircle2 size={18}/>{message}</div>}
    {error&&<div role="alert" className="notice error"><ShieldAlert size={18}/>{error}</div>}
    {scanned&&<>
      <div className="stats-grid" style={{marginTop:20}}>
        <div className="stat"><span>Approved shortlist</span><strong>115</strong></div>
        <div className="stat"><span>Source suggestions</span><strong>{matched}</strong></div>
        <div className="stat"><span>Manual lookup needed</span><strong>{115-matched}</strong></div>
        <div className="stat"><span>Approved returns</span><strong>0</strong><small>Separate verification required</small></div>
      </div>
      <label className="search-field" style={{marginTop:20,marginBottom:14}}>
        <Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a shortlisted fund in the review queue"/>
      </label>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>APPROVED FUND</th><th>PROVIDER</th><th>SOURCE MATCH</th><th>REVIEW</th></tr></thead>
        <tbody>{filtered.map(review=><Fragment key={review.fund_id}>
          <tr key={review.fund_id}>
            <td><b>{review.display_name}</b></td>
            <td>{review.provider_name}</td>
            <td>{review.suggestions?.length?review.suggestions[0].sourceName:"No reliable suggestion"}</td>
            <td><button className="btn quiet" type="button" onClick={()=>setExpanded(expanded===review.fund_id?null:review.fund_id)}>
              {expanded===review.fund_id?"Hide candidates":"Review candidates"}
            </button></td>
          </tr>
          {expanded===review.fund_id&&<tr key={review.fund_id+"-detail"}>
            <td colSpan={4}>
              <strong>Potential workbook rows — no row is approved</strong>
              <div style={{marginTop:8}}>
                {review.suggestions?.length?review.suggestions.map((s,i)=>
                  <div key={s.sourceName+i} style={{padding:"7px 0",borderBottom:"1px solid #eae8e4",fontSize:12}}>
                    <b>{s.sourceName}</b>
                    <span style={{marginLeft:12,color:"#898b86"}}>Similarity {Math.round(s.confidence*100)}% (name only)</span>
                    <span style={{display:"block",marginTop:3,color:"#777"}}>
                      YTD {percent(s.returns?.ytd)} · 1Y {percent(s.returns?.oneYear)} ·
                      3Y {percent(s.returns?.threeYear)} · 5Y {percent(s.returns?.fiveYear)} ·
                      10Y {percent(s.returns?.tenYear)}
                    </span>
                  </div>
                ):<p className="muted">No candidate passed the similarity threshold. Inspect its original factsheet and source series manually.</p>}
              </div>
            </td>
          </tr>}
        </Fragment>)}</tbody>
      </table></div>
      <p className="fineprint">Candidate percentages are transcribed directly from the uploaded source workbook. These are name similarity suggestions, not validated share-class matches or approved performance figures. The as-of date and return basis still need verification.</p>
    </>}
    {!scanned&&!loading&&!error&&<div className="notice neutral" style={{marginTop:20}}>
      <ShieldAlert size={17}/> The source matching review has not been initialised. Your uploaded documents remain safely archived.
    </div>}
  </section>;
}
