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
    displayedReturnsSource?:string|null;
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
const empty:Status={initialized:false,approvedUniverse:0,totalFactsheets:0,processedFactsheets:0,workbookRows:0,reviews:[]};

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
  async function importWorkbookPerformance(){
    if(pdfBusy||busy)return;
    setPdfBusy(true);setError("");setMessage("");
    try{
      setPdfStep("Validating current workbook's 107 fund names and returns");
      const master=await invoke("workbook");
      for(let i=0;i<300;i++){
        const scan=await invoke("factsheets");
        if(alive.current)setPdfStep("Reading fresh PDF fund identities: "+scan.processed+" of "+scan.total);
        if(!scan.hasMore)break;
        if(i===299)throw new Error("PDF document batch limit reached; run again to resume.");
      }
      setPdfStep("Automatically matching new PDFs to current workbook names");
      const result=await invoke("reconcile");
      await Promise.all([refresh(),refreshPdf()]);
      if(alive.current)setMessage("Imported "+master.funds+" authoritative fund names and "+
        master.rows+" provider performance rows from the updated workbook. "+
        (result.counts?.auto_approved??0)+" PDF identities matched automatically. "+
        "Uncertain fund or return series remain in manual review. Returns from older PDFs are never used.");
    }catch(e){
      if(alive.current)setError(e instanceof Error?e.message:"Workbook and PDF reconciliation failed.");
    }finally{
      if(alive.current){setPdfBusy(false);setPdfStep("")}
    }
  }

  async function exportAllPdfTables(){
    if(pdfBusy||busy)return;
    setPdfBusy(true);setError("");setMessage("");
    try{
      // Complete server-side extraction against the original privately stored PDFs.
      // Unreadable documents remain in the export with an explicit review status.
      for(let i=0;i<300;i++){
        const scan=await invoke("factsheets");
        if(alive.current)setPdfStep("Indexing PDF documents: "+scan.processed+" of "+scan.total);
        if(!scan.hasMore)break;
        if(i===299)throw new Error("PDF indexing batch limit reached. Retry to resume.");
      }
      let ready=false;
      for(let i=0;i<150;i++){
        const scan=await pdfAction("extract");
        if(alive.current)setPdfStep("Extracting official PDF performance: "+scan.processed+" of "+scan.total);
        if(!scan.hasMore){ready=true;break}
        if(scan.justProcessed===0)throw new Error("PDF performance extraction did not advance.");
      }
      if(!ready)throw new Error("PDF performance extraction batch limit reached. Retry to resume.");
      if(alive.current)setPdfStep("Creating the two-sheet Excel workbook");
      const response=await fetch("/api/fund-performance/export",{
        method:"GET",credentials:"same-origin",cache:"no-store"
      });
      if(!response.ok){
        const payload=await response.json().catch(()=>({error:"The Excel export failed."}));
        throw new Error(payload.error||"The Excel export failed.");
      }
      const blob=await response.blob();
      const fileUrl=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=fileUrl;
      link.download="Omega-All-PDF-Fund-Performance-"+new Date().toISOString().slice(0,10)+".xlsx";
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(fileUrl),1000);
      await Promise.all([refresh(),refreshPdf()]);
      if(alive.current)setMessage("Excel export created from the stored official PDFs: one Performance Tables worksheet and one Funds List worksheet. Each uploaded PDF is included; unavailable values are N/A.");
    }catch(error){
      if(alive.current)setError(error instanceof Error?error.message:"PDF Excel export failed.");
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
      setStep("Loading updated workbook as authoritative source");
      await invoke("workbook");
      setStep("Reading new provider PDF factsheets");
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
      setStep("Matching provider and printed PDF fund identities");
      const result=await invoke("reconcile");
      await Promise.all([refresh(),refreshPdf()]);
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
  const pdfIdentityApproved=(r:Review)=>r.status!=="manual_rejected" &&
    (r.status==="manually_confirmed" || (!r.manual_decision && Boolean(r.evidence?.factsheetIdentityApproved)));
  const needsPdfReview=(r:Review)=>!pdfIdentityApproved(r) || r.evidence?.displayedReturnsSource!=="uploaded_workbook";
  const pdfScore=(r:Review)=>Math.round(Number(r.evidence?.matchScores?.factsheet??r.auto_score??r.confidence??0)*100);
  const rank:Record<string,number>={suggested:0,needs_review:1,manual_rejected:2,unmatched:3,auto_approved:4,manually_confirmed:5};
  const filtered=status.reviews.filter(r=>
    (provider==="All providers"||r.provider===provider)&&
    (statusFilter==="All statuses"||statusFilter==="Needs manual review"&&needsPdfReview(r)||
      statusFilter==="pdf_approved"&&pdfIdentityApproved(r)||r.status===statusFilter)&&
    (r.approved_name+" "+r.provider+" "+(r.extracted_factsheet?.title||"")).toLowerCase().includes(query.toLowerCase())
  ).sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||
    Number(b.auto_score??b.confidence??0)-Number(a.auto_score??a.confidence??0));
  const advanceReview=()=>{
    const currentIndex=filtered.findIndex(r=>r.fund_id===expanded);
    setExpanded(filtered[currentIndex>=0?currentIndex+1:0]?.fund_id??null);
  };
  function downloadExceptions(){
    const exceptions=status.reviews.filter(needsPdfReview);
    const columns=["Provider","Approved fund","Status","PDF fund title","MoneyMate ID","Performance date","PDF match score","Manual decision","Reason","Other PDF candidates"];
    const safe=(v:unknown)=>{
      let value=String(v??"").replace(/\r?\n/g," ");
      if(/^[=+@\-\t\r]/.test(value))value="'"+value;
      return '"'+value.replace(/"/g,'""')+'"';
    };
    const rows=exceptions.map(r=>[
      r.provider,r.approved_name,r.status,
      r.extracted_factsheet?.title,r.extracted_factsheet?.moneyMateId,
      r.extracted_factsheet?.performance?.asOf,pdfScore(r),
      r.manual_decision??"pending",r.reason,
      (r.evidence?.candidateFactsheets??[]).map(v=>v.title??"untitled").join(" | ")
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
    </div><span className="soft-pill">Four providers · {status.approvedUniverse} approved funds</span></div>
    <p className="muted">The newly uploaded workbook defines the {status.approvedUniverse} fund names and all displayed performance returns. Its multi-year returns are cumulative, not annualised. Fresh PDFs provide fund identity, investment information and charts. Exact matches are automatic; missing or conflicting fund/share-class evidence enters manual review. PDF return tables never replace workbook values.</p>

    <div className="button-row">
      <button className="btn primary" type="button"
        disabled={busy||pdfBusy}
        onClick={()=>void importWorkbookPerformance()}>
        {pdfBusy?<LoaderCircle className="pdf-spin" size={17}/>:<Database size={17}/>}
        {pdfBusy?"Matching workbook and PDFs…":"Import updated workbook + auto-match PDFs"}
      </button>
      <button className="btn quiet" type="button" onClick={()=>void exportAllPdfTables()}
        disabled={busy||pdfBusy||status.totalFactsheets===0}>
        {pdfBusy?<LoaderCircle className="pdf-spin" size={16}/>:<ArrowDownToLine size={16}/>}
        Export all PDF tables (.xlsx)
      </button>
      <button className="btn quiet" type="button" onClick={()=>void run()}
        disabled={busy||pdfBusy||status.totalFactsheets===0}>
        {busy?<LoaderCircle className="pdf-spin" size={17}/>:<RefreshCw size={16}/>}
        {busy?"Rechecking current sources…":"Recheck workbook + PDF matches"}
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
      Reference PDF performance: {pdfStatus.extracted} tables extracted from {pdfStatus.processed} of {pdfStatus.total} documents.
      {" "}{pdfStatus.libraryFunds} approved fund identities currently display current workbook returns.
      {pdfStatus.failed>0?" "+pdfStatus.failed+" documents require extraction review.":""}
    </div>}
    {error&&<div role="alert" className="notice error"><ShieldAlert size={17}/>{error}</div>}
    {message&&<div role="status" className="notice success"><CheckCircle2 size={17}/>{message}</div>}

    <div className="stats-grid" style={{marginTop:18}}>
      <div className="stat"><span>Factsheets processed</span><strong>{status.processedFactsheets} / {status.totalFactsheets}</strong></div>
      <div className="stat"><span>Funds displaying updated workbook returns</span><strong>{status.reviews.filter(r=>r.evidence?.displayedReturnsSource==="uploaded_workbook").length}</strong></div>
      <div className="stat"><span>Auto-approved factsheet identities</span><strong>{status.reviews.filter(r=>r.evidence?.factsheetIdentityApproved && !r.manual_decision).length}</strong></div>
      <div className="stat"><span>PDF sources linked</span><strong>{status.reviews.filter(r=>r.extracted_factsheet?.title).length}</strong></div>
      <div className="stat"><span>PDF identities needing review</span><strong>{status.reviews.filter(needsPdfReview).length}</strong></div>
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
          placeholder="Find an approved fund or PDF title…" /></label>
        <label className="select-wrap"><select value={provider} onChange={e=>setProvider(e.target.value)}>
          <option>All providers</option>{["Aviva","Zurich","New Ireland","Standard Life"].map(x=><option key={x}>{x}</option>)}
        </select></label>
        <label className="select-wrap"><select aria-label="Filter match status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option>Needs manual review</option><option value="pdf_approved">PDF identities approved</option>
          <option>All statuses</option>
          <option value="auto_approved">Automatically approved</option>
          <option value="suggested">Automatic suggestions</option>
          <option value="manually_confirmed">Manually confirmed</option>
          <option value="manual_rejected">Manually rejected</option>
          <option value="needs_review">Review required</option>
          <option value="unmatched">Unmatched</option>
        </select></label>
      </div>
      <p className="fineprint">Showing {filtered.length} of {status.reviews.length} approved funds. Performance figures are taken exclusively from the latest imported workbook. Original PDF returns are reference-only. Identity scores are heuristic similarity measures (0–100), not measured accuracy. Even manual identity confirmation does not approve returns for client use.</p>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>APPROVED FUND</th><th>PROVIDER</th><th>PDF MATCH SCORE</th><th>PDF FACTSHEET DATE</th><th>PDF FACTSHEET</th><th>REVIEW STATUS</th><th></th></tr></thead>
        <tbody>{filtered.map(r=><Fragment key={r.fund_id}><tr>
          <td><b>{r.approved_name}</b><small>{r.extracted_factsheet?.title||"PDF title not identified"}</small></td>
          <td>{r.provider}</td>
          <td><strong>{pdfScore(r)}/100</strong></td>
          <td>{r.extracted_factsheet?.performance?.asOf??"Not available"}</td>
          <td>{r.extracted_factsheet?.title??"No verified PDF"}
            {r.extracted_factsheet?.performance?.asOf?
              <small>As of {r.extracted_factsheet.performance.asOf}</small>:null}</td>
          <td><span className="soft-pill">{r.status==="manually_confirmed"?"Confirmed by adviser":
            r.status==="manual_rejected"?"Rejected by adviser":
            pdfIdentityApproved(r)?"PDF identity approved":r.status==="suggested"?"Possible PDF match":
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
                  <p className="muted">{r.provider} · Check the printed PDF title and performance. Excel comparison is optional.</p>
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
    <p className="fineprint" style={{marginTop:12}}>No monthly price history is requested or inferred; displayed performance uses original PDFs only. Factsheet charts are accessible as their original PDF pages, not reconstructed numerical time series.</p>
  </section>;
}
