"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Database, FileText, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";

type Returns = Record<string,number|null>;
type Review = {
  fund_id:string; provider:string; approved_name:string; status:string; confidence:number;
  selected_source_name:string|null; reported_returns:Returns|null;
  extracted_factsheet:{
    title?:string; filename?:string; moneyMateId?:string|null; asOf?:string|null; launchDate?:string|null;
    objective?:string|null; strategy?:string|null; amcPct?:number|null; civPct?:number|null;
    riskRating?:number|null; chartReferences?:{page:number;label:string}[];
    extractionWarnings?:string[];
  }|null;
  evidence?:{
    candidatePerformanceRows?:{name:string;row:number;returns:Returns}[];
    candidateFactsheets?:{importId:string;title:string|null;filename:string}[];
  };
  factsheet_import_id:string|null; reason:string; returns_approved:boolean;
};
type Status={
  initialized:boolean;approvedUniverse:number;totalFactsheets:number;processedFactsheets:number;workbookRows:number;
  reviews:Review[];error?:string;
};
type Phase="workbook"|"factsheets"|"reconcile";
const labels:Record<string,string>={ytd:"YTD",oneMonth:"1m",threeMonth:"3m",sixMonth:"6m",oneYear:"1y",threeYear:"3y",fiveYear:"5y",tenYear:"10y",sinceLaunch:"Since launch"};
const fmt=(value:number|null|undefined)=>value==null?"N/A":(value>0?"+":"")+value.toFixed(2)+"%";
const empty:Status={initialized:false,approvedUniverse:115,totalFactsheets:0,processedFactsheets:0,workbookRows:0,reviews:[]};

export default function FundPerformanceReview(){
  const [status,setStatus]=useState<Status>(empty);
  const [busy,setBusy]=useState(false),[step,setStep]=useState("");
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const [provider,setProvider]=useState("All providers");
  const [expanded,setExpanded]=useState<string|null>(null);
  const running=useRef(false),alive=useRef(true);

  const refresh=useCallback(async()=>{
    const response=await fetch("/api/fund-reconciliation",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json() as Status;
    if(!response.ok)throw new Error(data.error??"Unable to read reconciliation status.");
    if(alive.current)setStatus(data);
    return data;
  },[]);
  useEffect(()=>{
    alive.current=true;
    void refresh().catch(e=>{if(alive.current)setError(e instanceof Error?e.message:"Unable to load progress.")});
    return ()=>{alive.current=false};
  },[refresh]);

  async function invoke(phase:Phase){
    const response=await fetch("/api/fund-reconciliation",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({phase})
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"The "+phase+" reconciliation stage failed.");
    return result;
  }
  async function run(){
    if(running.current)return;
    running.current=true;setBusy(true);setError("");setMessage("");
    try{
      setStep("Reading the November performance workbook");
      const book=await invoke("workbook");
      setStep(String(book.rows)+" source performance rows loaded; extracting provider factsheets");
      let offset=0;
      for(let i=0;i<300;i++){
        const progress=await invoke("factsheets");
        offset=Number(progress.processed)||0;
        if(alive.current){
          setStep("Factsheets processed: "+offset+" of "+progress.total);
          if(i%3===0)await refresh();
        }
        if(!progress.hasMore)break;
        if(i===299)throw new Error("The document batch limit was reached. Continue to resume.");
      }
      setStep("Matching provider, fund identity and exact series");
      const result=await invoke("reconcile");
      await refresh();
      if(alive.current)setMessage("Reconciliation complete: "+result.total+" shortlisted funds reviewed. "+
        (result.counts?.auto_matched||0)+" strong identity matches; "+
        (result.counts?.needs_review||0)+" need review; "+
        (result.counts?.unmatched||0)+" unmatched. No unverified return has been approved for client use.");
    }catch(e){
      if(alive.current)setError(e instanceof Error?e.message:"Reconciliation failed. You can resume it.");
    }finally{
      running.current=false;
      if(alive.current){setBusy(false);setStep("")}
    }
  }
  const filtered=status.reviews.filter(r=>
    (provider==="All providers"||r.provider===provider)&&
    (r.approved_name+" "+r.provider+" "+(r.selected_source_name||"")).toLowerCase().includes(query.toLowerCase())
  );
  const count=(kind:string)=>status.reviews.filter(r=>r.status===kind).length;
  const loaded=status.reviews.length>0;

  return <section className="panel padded" style={{marginTop:22,marginBottom:24}}>
    <div className="panel-heading"><div>
      <span className="eyebrow">EVIDENCE-BASED DATA RECONCILIATION</span>
      <h2 style={{marginTop:8}}>Factsheets and reported performance</h2>
    </div><span className="soft-pill">Four providers · 115 approved funds</span></div>
    <p className="muted">The workflow reads every stored PDF, extracts provider-specific fund fields and original chart page references, then reconciles its title against the workbook’s exact performance series. It will flag mismatched documents and ambiguous share classes.</p>

    <div className="button-row">
      <button className="btn primary" type="button" onClick={()=>void run()} disabled={busy||status.totalFactsheets===0}>
        {busy?<LoaderCircle className="pdf-spin" size={17}/>:<Database size={17}/>}
        {busy?"Reconciling documents…":loaded?"Resume / rescan documents":"Start full reconciliation"}
      </button>
      <button className="btn quiet" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh results</button>
    </div>
    {busy&&<div className="notice neutral" role="status"><LoaderCircle className="pdf-spin" size={16}/>{step}. Keep this tab open until the reconciliation finishes.</div>}
    {error&&<div role="alert" className="notice error"><ShieldAlert size={17}/>{error}</div>}
    {message&&<div role="status" className="notice success"><CheckCircle2 size={17}/>{message}</div>}

    <div className="stats-grid" style={{marginTop:18}}>
      <div className="stat"><span>Factsheets processed</span><strong>{status.processedFactsheets} / {status.totalFactsheets}</strong></div>
      <div className="stat"><span>Workbook series rows</span><strong>{status.workbookRows}</strong></div>
      <div className="stat"><span>Auto-matched identities</span><strong>{count("auto_matched")}</strong></div>
      <div className="stat"><span>Manual exceptions</span><strong>{count("needs_review")+count("unmatched")}</strong></div>
    </div>

    {loaded?<>
      <div className="filter-row" style={{marginTop:18}}>
        <label className="search-field"><input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Find an approved fund or workbook row…" /></label>
        <label className="select-wrap"><select value={provider} onChange={e=>setProvider(e.target.value)}>
          <option>All providers</option>{["Aviva","Zurich","New Ireland","Standard Life"].map(x=><option key={x}>{x}</option>)}
        </select></label>
      </div>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>APPROVED FUND</th><th>PROVIDER</th><th>IDENTITY</th><th>RETURNS</th><th></th></tr></thead>
        <tbody>{filtered.map(r=><tr key={r.fund_id}>
          <td><b>{r.approved_name}</b><small>{r.selected_source_name||"No source series selected"}</small></td>
          <td>{r.provider}</td>
          <td><span className="soft-pill">{r.status==="auto_matched"?"Strong match":r.status==="needs_review"?"Review required":"Unmatched"}</span></td>
          <td>{r.returns_approved?"Approved":"Not approved"}</td>
          <td><button type="button" className="btn quiet" onClick={()=>setExpanded(expanded===r.fund_id?null:r.fund_id)}>
            {expanded===r.fund_id?"Close":"Inspect"}
          </button></td>
        </tr>)}</tbody>
      </table></div>
      {expanded ? (()=>{
        const r=status.reviews.find(x=>x.fund_id===expanded);
        if(!r)return null;
        const data=r.extracted_factsheet;
        return <div className="panel padded" style={{marginTop:14,background:"#faf9f7"}}>
          <h3>{r.approved_name}</h3>
          <p className="muted">{r.reason}</p>
          <p><strong>Workbook row:</strong> {r.selected_source_name||"Unmatched"}</p>
          {r.reported_returns&&<div className="table-scroll"><table className="data-table">
            <thead><tr>{Object.values(labels).map(l=><th key={l}>{l}</th>)}</tr></thead>
            <tbody><tr>{Object.keys(labels).map(k=><td key={k}>{fmt(r.reported_returns?.[k])}</td>)}</tr></tbody>
          </table></div>}
          {data&&<>
            <p><strong>PDF title:</strong> {data.title||"Could not extract"}</p>
            <p><strong>MoneyMate ID:</strong> {data.moneyMateId||"N/A"} · <strong>Factsheet date:</strong> {data.asOf||"N/A"}</p>
            <p><strong>AMC:</strong> {fmt(data.amcPct)} · <strong>CIV:</strong> {fmt(data.civPct)}</p>
            {data.objective&&<p><strong>Objective:</strong> {data.objective.slice(0,1200)}</p>}
            {data.extractionWarnings?.length?data.extractionWarnings.map((warning,i)=>
              <div key={i} className="notice neutral"><ShieldAlert size={15}/>{warning}</div>):null}
            {r.factsheet_import_id&&<p><a href={"/api/fund-uploads/"+r.factsheet_import_id+"/download?view=1"}
              target="_blank" rel="noopener noreferrer">Open original factsheet PDF <ArrowUpRight size={13}/></a></p>}
            {data.chartReferences?.length?<>
              <strong>Original charts and tables</strong>
              {data.chartReferences.map((chart,i)=><p key={i}>
                <a target="_blank" rel="noopener noreferrer" href={"/api/fund-uploads/"+r.factsheet_import_id+"/download?view=1#page="+chart.page}>
                  <FileText size={14}/> {chart.label} · PDF page {chart.page} <ArrowUpRight size={12}/>
                </a>
              </p>)}
            </>:null}
          </>}
          {r.evidence?.candidatePerformanceRows?.length?<div>
            <h3>Other possible series</h3>
            {r.evidence.candidatePerformanceRows.slice(0,5).map(x=>
              <p className="muted" key={x.row}>{x.name} · Source workbook row {x.row}</p>)}
          </div>:null}
          <p className="fineprint">Identity matching is distinct from return approval. Source dates, reporting basis and fee treatment still require evidence before figures can appear in a client proposal.</p>
        </div>;
      })() : null}
    </>:<div className="notice neutral" style={{marginTop:16}}>
      <ShieldAlert size={17}/> Source documents are stored privately. The full reconciliation has not yet been run against these uploads.
    </div>}
    <p className="fineprint" style={{marginTop:12}}>No monthly price history is requested or inferred. Factsheet charts are accessible as their original PDF pages, not reconstructed numerical time series.</p>
  </section>;
}
