"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {FileText,RefreshCw,ShieldAlert,PauseCircle} from "lucide-react";

type Report={
  expected:number;uploaded:number;attempted:number;pending:number;notStatedFields:number;
  extracted:number;review:number;identityConflicts:number;incompleteFields:number;
  complete:boolean;
  byProvider:Record<string,{total:number;extracted:number;needsReview:number;pending:number}>;
  issues:{fund:string;provider:string;filename:string|null;status:string;
    missing:string[];notStated?:string[];identityIssue:string|null;warnings:string[]}[];
};
type Batch={processed:number;remaining:number;done:boolean;
  results:{filename:string;status:string;message:string|null}[];error?:string};
export default function FundEnrichmentAudit(){
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [runCount,setRunCount]=useState(0);
  const [isPaused,setIsPaused]=useState(false);
  const pauseAfterCurrent=useRef(false);
  const activeRequest=useRef(false);
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/fund-enrichment",{credentials:"same-origin",cache:"no-store"});
    const payload=await response.json() as Report&{error?:string};
    if(!response.ok)throw new Error(payload.error??"The extraction audit is unavailable.");
    setReport(payload);
    return payload;
  },[]);
  useEffect(()=>{
    void refresh().catch(e=>setError(e instanceof Error?
      e.message:"Could not load factsheet audit."));
  },[refresh]);
  async function run(){
    if(activeRequest.current)return;
    activeRequest.current=true;
    pauseAfterCurrent.current=false;
    setBusy(true);setIsPaused(false);setError("");setRunCount(0);
    setMessage("Starting PDF extraction. Keep this page open; progress is saved after each PDF.");
    let checked=0,completed=false,paused=false;
    try{
      // One document per request makes scanned New Ireland sheets less likely
      // to exceed the Vercel function duration. Every batch commits to Neon.
      for(let batch=0;batch<160;batch++){
        if(pauseAfterCurrent.current){paused=true;break;}
        const response=await fetch("/api/fund-enrichment",{
          method:"POST",credentials:"same-origin",cache:"no-store",
          headers:{"Content-Type":"application/json"},body:"{}"
        });
        const data=await response.json().catch(()=>null) as Batch|null;
        if(!response.ok||!data)
          throw new Error(data?.error??(
            "Extraction request failed (HTTP "+response.status+"). Progress already saved. Select Resume to retry."));
        checked+=data.processed;
        setRunCount(checked);
        setReport(previous=>previous?{
          ...previous,pending:data.remaining,
          attempted:Math.max(previous.attempted,previous.uploaded-data.remaining)
        }:previous);
        const reviewed=data.results.filter(item=>item.status==="needs_review").length;
        const detail=reviewed?" "+reviewed+" item(s) flagged for review.":"";
        setMessage("Saved "+checked+" document(s) during this run; "+
          data.remaining+" remaining."+detail);
        if(data.done){completed=true;break;}
        if(data.processed===0)throw new Error(
          "The server did not process a document. Refresh the audit and retry.");
      }
      const latest=await refresh();
      if(completed)setMessage("Extraction complete: "+latest.attempted+
        " PDF(s) processed and saved in Neon. "+latest.review+
        " fund(s) need review; "+latest.incompleteFields+
        " have unavailable fields. Future proposal PDFs use these saved records.");
      else if(paused){
        setIsPaused(true);
        setMessage("Paused. Progress is saved in the database ("+
          latest.attempted+"/"+latest.uploaded+"). Select Resume extraction to continue.");
      }else setMessage("Batch limit reached. Select Resume extraction to finish remaining documents.");
    }catch(e){
      setError(e instanceof Error?e.message:"PDF processing was interrupted.");
      await refresh().catch(()=>{});
    }finally{activeRequest.current=false;setBusy(false);}
  }
  return <section className="panel padded" style={{marginTop:20,marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <div>
        <span className="eyebrow">SAVED FACTSHEET CONTENT</span>
        <h2 style={{marginTop:7}}>PDF descriptions and risk data</h2>
        <p className="muted">Extracts factsheet information from Aviva, Zurich, New Ireland and Standard Life and stores it once. Proposal PDFs use these saved descriptions, objectives, investment styles, risk details, charges and dates. Returns remain sourced from the workbook.</p>
      </div>
      <div className="button-row">
        <button className="btn quiet" type="button" disabled={busy} onClick={()=>
          void refresh().catch(e=>setError(e instanceof Error?e.message:"Could not refresh."))}>
          <RefreshCw size={15}/>Refresh audit
        </button>
        {busy?
          <button className="btn quiet" type="button" onClick={()=>{pauseAfterCurrent.current=true;setMessage(
            "Pausing after the current PDF. Saved progress will be retained.");}}>
            <PauseCircle size={15}/>Pause after current PDF
          </button>:null}
        <button className="btn primary" type="button"
          disabled={busy||!report?.uploaded||report.pending===0}
          onClick={()=>void run()}>
          <FileText size={15}/>{busy?"Saving PDF data…":
            report?.pending===0?"Extraction complete":
            isPaused?"Resume extraction":"Extract and save PDF details"}
        </button>
      </div>
    </div>
    {error&&<div className="notice error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    {message&&<div className="notice neutral" role="status" aria-live="polite">{message}</div>}
    {(busy||runCount>0)&&report? <div style={{marginTop:12,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:6}}>
        <strong>Saved to database: {report.attempted}/{report.uploaded} PDFs</strong>
        <span className="muted">{report.uploaded?
          Math.round(report.attempted/report.uploaded*100):0}%</span>
      </div>
      <progress max={report.uploaded||1} value={Math.min(report.attempted,report.uploaded)}
        style={{width:"100%",height:12}} aria-label="Saved factsheet extraction progress"/>
      {busy?<p className="fineprint">The current file is being processed.
        Scanned New Ireland PDFs can take longer; leave this page open or pause after the current file.</p>:null}
    </div>:null}
    {report&&<>
      <div className="stats-grid" style={{marginTop:15}}>
        <div className="stat"><span>PDF sources</span><strong>{report.uploaded}/{report.expected}</strong></div>
        <div className="stat"><span>Processed</span><strong>{report.attempted}/{report.uploaded}</strong></div>
        <div className="stat"><span>Matched and extracted</span><strong>{report.extracted}</strong></div>
        <div className="stat"><span>Needs review</span><strong>{report.review}</strong></div>
        <div className="stat"><span>Incomplete fields</span><strong>{report.incompleteFields}</strong></div>
        <div className="stat"><span>Not separately stated in source</span><strong>{report.notStatedFields??0}</strong></div>
        <div className="stat"><span>Identity warnings</span><strong>{report.identityConflicts}</strong></div>
      </div>
      <p className="fineprint">New Ireland: {report.byProvider["New Ireland"]?.extracted??0}/
        {report.byProvider["New Ireland"]?.total??0} extracted. Source fields not published in an individual PDF are counted separately from unreadable information; no amounts are inferred.
        {report.pending>0?" "+report.pending+" PDFs remain to be processed.":""}
      </p>
      {report.issues.length>0&&<details style={{marginTop:15}}>
        <summary style={{cursor:"pointer",fontWeight:600}}>Review missing or unreadable source information ({report.issues.length})</summary>
        <div className="table-scroll" style={{marginTop:12}}>
          <table className="data-table">
            <thead><tr><th>FUND</th><th>STATUS</th><th>MISSING / WARNING</th></tr></thead>
            <tbody>{report.issues.map((item,i)=><tr key={item.provider+"-"+item.fund+"-"+i}>
              <td>{item.provider} · {item.fund}</td>
              <td>{item.status.replaceAll("_"," ")}</td>
              <td>{[...item.missing,item.identityIssue,...item.warnings].filter(Boolean).join("; ")||"No missing fields"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      <p className="fineprint" style={{marginTop:12}}>Charges and strategy fields not separately published in a factsheet are not extraction failures. Their values remain blank in the database and PDF proposal; no estimates are inserted.</p>
      <p className="fineprint" style={{marginTop:12}}>The extraction audit is separate from workbook performance and proposal suitability approval. No workbook values are changed during PDF processing.</p>
    </>}
  </section>;
}
