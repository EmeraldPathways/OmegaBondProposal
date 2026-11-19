"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, CheckCircle2, Database, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import FundManualReview from "@/components/fund-manual-review";

type Returns = Record<string,number|null>;
type Review = {
  fund_id:string; provider:string; approved_name:string; status:string; confidence:number;
  auto_score?:number;auto_status?:string;manual_decision?:"confirmed"|"rejected"|null;
  selected_source_name:string|null; reported_returns:Returns|null;
  extracted_factsheet:{
    title?:string; filename?:string; moneyMateId?:string|null; asOf?:string|null; launchDate?:string|null;
    objective?:string|null; strategy?:string|null; amcPct?:number|null; civPct?:number|null;
    riskRating?:number|null; chartReferences?:{page:number;label:string}[];
    extractionWarnings?:string[];
    performance?:{status:string;asOf:string|null;returns:Returns;feeBasis:string}|null;
  }|null;
  evidence?:{
    candidatePerformanceRows?:{name:string;row:number;returns:Returns}[];
    candidateFactsheets?:{importId:string;title:string|null;filename:string;score?:number}[];
    matchScores?:{factsheet:number;workbook:number;combined:number};
    factsheetIdentityApproved?:boolean;seriesIdentityApproved?:boolean;
  };
  factsheet_import_id:string|null; reason:string; returns_approved:boolean;
};
type Status={
  initialized:boolean;approvedUniverse:number;totalFactsheets:number;processedFactsheets:number;workbookRows:number;
  reviews:Review[];error?:string;
};
type Phase="workbook"|"factsheets"|"reconcile";
type PdfProgress={total:number;processed:number;extracted:number;failed:number;
  unavailable:number;libraryFunds:number;hasMore?:boolean;justProcessed?:number;message?:string;error?:string};
const empty:Status={initialized:false,approvedUniverse:115,totalFactsheets:0,processedFactsheets:0,workbookRows:0,reviews:[]};

export default function FundPerformanceReview(){
  const [status,setStatus]=useState<Status>(empty);
  const [busy,setBusy]=useState(false),[step,setStep]=useState("");
  const [pdfBusy,setPdfBusy]=useState(false),[pdfStep,setPdfStep]=useState("");
  const [pdfStatus,setPdfStatus]=useState<PdfProgress|null>(null);
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const [provider,setProvider]=useState("All providers");
  const [statusFilter,setStatusFilter]=useState("Needs manual review");
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

  const refreshPdf=useCallback(async()=>{
    const response=await fetch("/api/fund-performance/pdf",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json() as PdfProgress;
    if(!response.ok)throw new Error(data.error||"Could not read official PDF import progress.");
    if(alive.current)setPdfStatus(data);
    return data;
  },[]);
  useEffect(()=>{void refreshPdf().catch(()=>{})},[refreshPdf]);

  async function pdfAction(phase:"extract"|"publish"):Promise<PdfProgress>{
    const response=await fetch("/api/fund-performance/pdf",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({phase})
    });
    const data=await response.json() as PdfProgress;
    if(!response.ok)throw new Error(data.error||"Official PDF source processing failed.");
    return data;
  }
  async function importPdfPerformance(){
    if(pdfBusy||busy)return;
    setPdfBusy(true);setError("");setMessage("");
    try{
      let latest:PdfProgress|null=null;
      let done=false;
      for(let i=0;i<150;i++){
        const data=await pdfAction("extract");
        latest=data;
        if(alive.current){
          setPdfStatus(data);
          setPdfStep("Reading return tables: "+data.processed+" of "+data.total+" PDFs");
        }
        if(!data.hasMore){done=true;break}
        if(data.justProcessed===0)throw new Error("The PDF source scan did not advance.");
      }
      if(!done)throw new Error("Batch limit reached. Run the import again to resume.");
      setPdfStep("Publishing official PDF figures for matched fund identities");
      const result=await pdfAction("publish");
      await Promise.all([refresh(),refreshPdf()]);
      if(alive.current)setMessage("PDF import completed: "+result.extracted+" of "+
        result.total+" factsheets contain extractable performance tables; "+
        result.libraryFunds+" approved fund identities now use original PDF returns. "+
        "Unreadable and missing periods remain unavailable. No workbook returns were used.");
    }catch(e){
      if(alive.current)setError(e instanceof Error?e.message:"PDF performance import failed.");
    }finally{
      if(alive.current){setPdfBusy(false);setPdfStep("")}
    }
  }

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
        (result.counts?.auto_approved||0)+" strong identity matches and "+
        (result.counts?.suggested||0)+" additional scored suggestions; "+
        (result.counts?.needs_review||0)+" need further review; "+
        (result.counts?.unmatched||0)+" unmatched. Fund identities may be approved automatically, but no unverified return is approved for client proposals.");
    }catch(e){
      if(alive.current)setError(e instanceof Error?e.message:"Reconciliation failed. You can resume it.");
    }finally{
      running.current=false;
      if(alive.current){setBusy(false);setStep("")}
    }
  }
  const rank:Record<string,number>={suggested:0,needs_review:1,manual_rejected:2,unmatched:3,auto_approved:4,manually_confirmed:5};
  const filtered=status.reviews.filter(r=>
    (provider==="All providers"||r.provider===provider)&&
    (statusFilter==="All statuses"||statusFilter==="Needs manual review"&&
      ["suggested","needs_review","unmatched","manual_rejected"].includes(r.status)||
      r.status===statusFilter)&&
    (r.approved_name+" "+r.provider+" "+(r.selected_source_name||"")).toLowerCase().includes(query.toLowerCase())
  ).sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||
    Number(b.auto_score??b.confidence??0)-Number(a.auto_score??a.confidence??0));
  const advanceReview=()=>{
    const currentIndex=filtered.findIndex(r=>r.fund_id===expanded);
    setExpanded(filtered[currentIndex>=0?currentIndex+1:0]?.fund_id??null);
  };
  function downloadExceptions(){
    const exceptions=status.reviews.filter(r=>!["auto_approved","manually_confirmed"].includes(r.status));
    const columns=["Provider","Approved fund","Status","Candidate workbook series","Candidate PDF title","MoneyMate ID","Factsheet date","Automatic score","Current score","Manual decision","Reason","Other workbook candidates"];
    const safe=(v:unknown)=>{
      let value=String(v??"").replace(/\r?\n/g," ");
      if(/^[=+@\-\t\r]/.test(value))value="'"+value;
      return '"'+value.replace(/"/g,'""')+'"';
    };
    const rows=exceptions.map(r=>[
      r.provider,r.approved_name,r.status,r.selected_source_name,
      r.extracted_factsheet?.title,r.extracted_factsheet?.moneyMateId,
      r.extracted_factsheet?.asOf,r.auto_score??r.confidence,r.confidence,r.manual_decision??"pending",r.reason,
      (r.evidence?.candidatePerformanceRows??[]).map(v=>v.name).join(" | ")
    ]);
    const blob=new Blob(["\uFEFF"+[columns,...rows].map(r=>r.map(safe).join(",")).join("\r\n")],
      {type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="Omega-Fund-Reconciliation-Exceptions.csv";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const count=(kind:string)=>status.reviews.filter(r=>r.status===kind).length;
  const loaded=status.reviews.length>0;

  return <section className="panel padded" style={{marginTop:22,marginBottom:24}}>
    <div className="panel-heading"><div>
      <span className="eyebrow">EVIDENCE-BASED DATA RECONCILIATION</span>
      <h2 style={{marginTop:8}}>Factsheets and reported performance</h2>
    </div><span className="soft-pill">Four providers · 115 approved funds</span></div>
    <p className="muted">Clear, uniquely corroborated PDF-title and workbook-series identities are approved automatically. Only uncertain or conflicting matches need manual approval or rejection; you can also override any automatic approval. Only names inside the PDFs are used to establish fund identity; filenames are not used for matching.</p>

    <div className="button-row">
      <button className="btn primary" type="button"
        disabled={busy||pdfBusy||status.totalFactsheets===0}
        onClick={()=>void importPdfPerformance()}>
        {pdfBusy?<LoaderCircle className="pdf-spin" size={17}/>:<Database size={17}/>}
        {pdfBusy?"Extracting PDF return tables…":"Import performance from all original PDFs"}
      </button>
      <button className="btn quiet" type="button" onClick={()=>void run()}
        disabled={busy||pdfBusy||status.totalFactsheets===0}>
        {busy?<LoaderCircle className="pdf-spin" size={17}/>:<RefreshCw size={16}/>}
        {busy?"Checking identities…":"Recheck fund identity suggestions"}
      </button>
      <button className="btn quiet" type="button" disabled={busy||pdfBusy}
        onClick={()=>void Promise.all([refresh(),refreshPdf()])}><RefreshCw size={15}/> Refresh results</button>
      <button className="btn quiet" type="button" disabled={busy||pdfBusy||!status.reviews.length}
        onClick={downloadExceptions}><ArrowDownToLine size={15}/> Download exception report</button>
    </div>
    {pdfBusy&&<div className="notice neutral" role="status">
      <LoaderCircle className="pdf-spin" size={16}/>{pdfStep}. Keep this tab open while the PDFs are processed.
    </div>}
    {busy&&<div className="notice neutral" role="status">
      <LoaderCircle className="pdf-spin" size={16}/>{step}.
    </div>}
    {pdfStatus&&<div className="notice neutral" role="status">
      Original PDF performance: {pdfStatus.extracted} tables extracted from {pdfStatus.processed} of {pdfStatus.total} documents.
      {" "}{pdfStatus.libraryFunds} approved fund identities currently display original PDF returns.
      {pdfStatus.failed>0?" "+pdfStatus.failed+" documents require extraction review.":""}
    </div>}
    {error&&<div role="alert" className="notice error"><ShieldAlert size={17}/>{error}</div>}
    {message&&<div role="status" className="notice success"><CheckCircle2 size={17}/>{message}</div>}

    <div className="stats-grid" style={{marginTop:18}}>
      <div className="stat"><span>Factsheets processed</span><strong>{status.processedFactsheets} / {status.totalFactsheets}</strong></div>
      <div className="stat"><span>Workbook series rows</span><strong>{status.workbookRows}</strong></div>
      <div className="stat"><span>Auto-approved factsheet identities</span><strong>{status.reviews.filter(r=>r.evidence?.factsheetIdentityApproved && !r.manual_decision).length}</strong></div>
      <div className="stat"><span>Fully auto-approved matches</span><strong>{count("auto_approved")}</strong></div>
      <div className="stat"><span>Needs manual decision</span><strong>{status.reviews.filter(r=>["suggested","needs_review","unmatched","manual_rejected"].includes(r.status)).length}</strong></div>
      <div className="stat"><span>Manually confirmed</span><strong>{count("manually_confirmed")}</strong></div>
    </div>
    {loaded&&<div className="table-scroll" style={{marginTop:18}}>
      <table className="data-table">
        <thead><tr><th>PROVIDER</th><th>PDF AUTO-APPROVED</th><th>COMPLETE AUTO-APPROVED</th><th>SUGGESTED</th><th>MANUAL CONFIRMED</th><th>NEEDS REVIEW</th></tr></thead>
        <tbody>{["Aviva","Zurich","Standard Life","New Ireland"].map(name=>
          <tr key={name}><td><b>{name}</b></td>
            <td>{status.reviews.filter(r=>r.provider===name&&r.evidence?.factsheetIdentityApproved&&!r.manual_decision).length}</td>
            <td>{status.reviews.filter(r=>r.provider===name&&r.status==="auto_approved").length}</td>
            <td>{status.reviews.filter(r=>r.provider===name&&r.status==="suggested").length}</td>
            <td>{status.reviews.filter(r=>r.provider===name&&r.status==="manually_confirmed").length}</td>
            <td>{status.reviews.filter(r=>r.provider===name&&["needs_review","unmatched","manual_rejected"].includes(r.status)).length}</td>
          </tr>)}</tbody>
      </table>
    </div>}

    {loaded?<>
      <div className="filter-row" style={{marginTop:18}}>
        <label className="search-field"><input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Find an approved fund or workbook row…" /></label>
        <label className="select-wrap"><select value={provider} onChange={e=>setProvider(e.target.value)}>
          <option>All providers</option>{["Aviva","Zurich","New Ireland","Standard Life"].map(x=><option key={x}>{x}</option>)}
        </select></label>
        <label className="select-wrap"><select aria-label="Filter match status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option>Needs manual review</option>
          <option>All statuses</option>
          <option value="auto_approved">Automatically approved</option>
          <option value="suggested">Automatic suggestions</option>
          <option value="manually_confirmed">Manually confirmed</option>
          <option value="manual_rejected">Manually rejected</option>
          <option value="needs_review">Review required</option>
          <option value="unmatched">Unmatched</option>
        </select></label>
      </div>
      <p className="fineprint">Showing {filtered.length} of {status.reviews.length} approved funds. Performance figures are taken from original provider PDFs, not workbook rows. Identity scores are heuristic similarity measures (0–100), not measured accuracy. PDF and workbook scores are shown separately. Even manual identity confirmation does not approve returns for client use.</p>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>APPROVED FUND</th><th>PROVIDER</th><th>AUTO SCORE</th><th>PDF / WORKBOOK</th><th>PDF FACTSHEET</th><th>REVIEW STATUS</th><th></th></tr></thead>
        <tbody>{filtered.map(r=><Fragment key={r.fund_id}><tr>
          <td><b>{r.approved_name}</b><small>{r.selected_source_name||"No source series selected"}</small></td>
          <td>{r.provider}</td>
          <td><strong>{Math.round(Number(r.auto_score??r.confidence??0)*100)}/100</strong></td>
          <td>{Math.round(Number(r.evidence?.matchScores?.factsheet??0)*100)}/100 · {Math.round(Number(r.evidence?.matchScores?.workbook??0)*100)}/100</td>
          <td>{r.extracted_factsheet?.title??"No verified PDF"}
            {r.extracted_factsheet?.performance?.asOf?
              <small>As of {r.extracted_factsheet.performance.asOf}</small>:null}</td>
          <td><span className="soft-pill">{r.status==="manually_confirmed"?"Confirmed by adviser":
            r.status==="manual_rejected"?"Rejected by adviser":
            r.status==="auto_approved"?"Automatically approved":r.evidence?.factsheetIdentityApproved?"PDF approved · series review":r.status==="suggested"?"Possible match":
            r.status==="needs_review"?"Needs checking":"Unmatched"}</span></td>
          <td><button type="button" className="btn quiet"
            aria-expanded={expanded===r.fund_id}
            aria-controls={"fund-review-"+r.fund_id}
            onClick={()=>setExpanded(expanded===r.fund_id?null:r.fund_id)}>
            {expanded===r.fund_id?"Close":"Review match"}
          </button></td>
        </tr>
        {expanded===r.fund_id&&<tr className="reconciliation-accordion-row" id={"fund-review-"+r.fund_id}>
          <td colSpan={7} className="reconciliation-accordion-cell">
            <div className="reconciliation-accordion-content">
              <div className="reconciliation-accordion-title">
                <div>
                  <span className="eyebrow">FUND RECONCILIATION</span>
                  <h3>Review match · {r.approved_name}</h3>
                  <p className="muted">{r.provider} · Compare the printed PDF title against the workbook series.</p>
                </div>
                <button type="button" className="btn quiet"
                  onClick={()=>setExpanded(null)}>Close review</button>
              </div>
              <FundManualReview key={r.fund_id} fundId={r.fund_id}
                onSaved={refresh} onNext={advanceReview}/>
            </div>
          </td>
        </tr>}
        </Fragment>)}</tbody>
      </table></div>
    </>:<div className="notice neutral" style={{marginTop:16}}>
      <ShieldAlert size={17}/> Source documents are stored privately. The full reconciliation has not yet been run against these uploads.
    </div>}
    <p className="fineprint" style={{marginTop:12}}>No monthly price history is requested or inferred. Factsheet charts are accessible as their original PDF pages, not reconstructed numerical time series.</p>
  </section>;
}
