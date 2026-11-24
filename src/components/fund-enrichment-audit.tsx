"use client";

import {useCallback,useEffect,useState} from "react";
import {FileText,RefreshCw,ShieldAlert,CheckCircle2} from "lucide-react";

type Report={
  expected:number;uploaded:number;attempted:number;pending:number;
  extracted:number;review:number;identityConflicts:number;incompleteFields:number;
  complete:boolean;
  byProvider:Record<string,{total:number;extracted:number;needsReview:number;pending:number}>;
  issues:{fund:string;provider:string;filename:string|null;status:string;
    missing:string[];identityIssue:string|null;warnings:string[]}[];
};
type Batch={processed:number;remaining:number;done:boolean;
  results:{filename:string;status:string;message:string|null}[];error?:string};
export default function FundEnrichmentAudit(){
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/fund-enrichment",{credentials:"same-origin",cache:"no-store"});
    const payload=await response.json() as Report&{error?:string};
    if(!response.ok)throw new Error(payload.error??"The extraction audit is unavailable.");
    setReport(payload);
    return payload;
  },[]);
  useEffect(()=>{void refresh().catch(error=>
    setError(error instanceof Error?error.message:"Extraction audit unavailable."))},[refresh]);
  async function run(){
    if(busy)return;
    setBusy(true);setError("");setMessage("");
    let checked=0,completed=false;
    try{
      // Each call processes two PDFs, resuming from the saved parser-version cursor.
      for(let batch=0;batch<160;batch++){
        const response=await fetch("/api/fund-enrichment",{
          method:"POST",credentials:"same-origin",cache:"no-store",
          headers:{"Content-Type":"application/json"},body:"{}"
        });
        const data=await response.json() as Batch;
        if(!response.ok)throw new Error(data.error??"PDF extraction failed.");
        checked+=data.processed;
        setMessage("Processed "+checked+" PDFs in this run. "+data.remaining+" still to check.");
        if(data.done){completed=true;break;}
        if(data.processed===0)throw new Error("No documents processed; check the stored PDF sources.");
      }
      const latest=await refresh();
      if(completed)setMessage("PDF processing finished. "+latest.extracted+
        " matched records extracted; "+latest.review+
        " need manual review. New proposals use these saved factsheet records.");
      else setMessage("Batch limit reached. Select Resume to continue from the saved progress.");
    }catch(e){
      setError(e instanceof Error?e.message:"PDF processing was interrupted.");
      await refresh().catch(()=>{});
    }finally{setBusy(false);}
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
        <button className="btn primary" type="button" disabled={busy||!report?.uploaded} onClick={()=>void run()}>
          <FileText size={15}/>{busy?"Processing PDFs…":report?.pending===0?"Recheck completed":"Extract and save PDF details"}
        </button>
      </div>
    </div>
    {error&&<div className="notice error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    {message&&<div className="notice neutral" role="status">{message}</div>}
    {report&&<>
      <div className="stats-grid" style={{marginTop:15}}>
        <div className="stat"><span>PDF sources</span><strong>{report.uploaded}/{report.expected}</strong></div>
        <div className="stat"><span>Processed</span><strong>{report.attempted}/{report.uploaded}</strong></div>
        <div className="stat"><span>Matched and extracted</span><strong>{report.extracted}</strong></div>
        <div className="stat"><span>Needs review</span><strong>{report.review}</strong></div>
        <div className="stat"><span>Incomplete fields</span><strong>{report.incompleteFields}</strong></div>
        <div className="stat"><span>Identity warnings</span><strong>{report.identityConflicts}</strong></div>
      </div>
      <p className="fineprint">New Ireland: {report.byProvider["New Ireland"]?.extracted??0}/
        {report.byProvider["New Ireland"]?.total??0} extracted. Blank fields remain unavailable rather than being filled with inferred values.
        {report.pending>0?" "+report.pending+" PDFs remain to be processed.":""}
      </p>
      {report.issues.length>0&&<details style={{marginTop:15}}>
        <summary style={{cursor:"pointer",fontWeight:600}}>Review extraction issues ({report.issues.length})</summary>
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
      <p className="fineprint" style={{marginTop:12}}>The extraction audit is separate from workbook performance and proposal suitability approval. No workbook values are changed during PDF processing.</p>
    </>}
  </section>;
}
