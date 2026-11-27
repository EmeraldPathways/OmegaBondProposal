"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowDownToLine,FileText,RefreshCw,ShieldCheck} from "lucide-react";
import type {InvestmentRecord} from "@/lib/v2-investment-performance";

export type ActualPdfRequest =
  | {reportType:"performance"|"withdrawals";record:InvestmentRecord;startDate:string;endDate:string}
  | {reportType:"portfolio";records:InvestmentRecord[];startDate:string;endDate:string};

type Props={
  id:string;
  title:string;
  description:string;
  filename:string;
  request:ActualPdfRequest;
  disabledReason?:string|null;
};

/**
 * Client-only PDF viewer. An on-demand POST generates the exact PDF that
 * is embedded and later downloaded. No separate renderer or stored PDF URL.
 * Requests are cancelled and old object URLs revoked when inputs change.
 */
export default function ActualReportPdfViewer({
  id,title,description,filename,request,disabledReason
}:Props){
  const [url,setUrl]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [hasGenerated,setHasGenerated]=useState(false);
  const ownedBlob=useRef<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  const body=JSON.stringify(request);
  const blocked=Boolean(disabledReason);

  useEffect(()=>{
    // This invalidates an old PDF immediately after edits, tab changes or
    // policy selection. A PDF must never be downloaded for stale inputs.
    controller.current?.abort();
    controller.current=null;
    if(ownedBlob.current){
      URL.revokeObjectURL(ownedBlob.current);
      ownedBlob.current=null;
    }
    setUrl(null);
    setBusy(false);
    setError("");
    setHasGenerated(false);
    return ()=>{
      controller.current?.abort();
      if(ownedBlob.current){
        URL.revokeObjectURL(ownedBlob.current);
        ownedBlob.current=null;
      }
    };
  },[body]);

  async function generate(){
    if(blocked||busy)return;
    const pending=new AbortController();
    controller.current?.abort();
    controller.current=pending;
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/v2/performance/pdf",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body,credentials:"same-origin",cache:"no-store",
        signal:pending.signal
      });
      if(!response.ok){
        const failure=await response.json().catch(()=>({error:"Unable to prepare the PDF."}));
        throw new Error(typeof failure.error==="string"?failure.error:"Unable to prepare the PDF.");
      }
      if(!(response.headers.get("Content-Type")??"").includes("application/pdf")){
        throw new Error("The server did not return a PDF document.");
      }
      const blob=await response.blob();
      if(!blob.size||(await blob.slice(0,5).text())!=="%PDF-"){
        throw new Error("The PDF response was empty or invalid.");
      }
      if(pending.signal.aborted)return;
      const next=URL.createObjectURL(blob);
      if(pending.signal.aborted){URL.revokeObjectURL(next);return;}
      if(ownedBlob.current)URL.revokeObjectURL(ownedBlob.current);
      ownedBlob.current=next;
      setUrl(next);
      setHasGenerated(true);
    }catch(cause){
      if(!pending.signal.aborted){
        setError(cause instanceof Error?cause.message:"PDF preview is unavailable.");
      }
    }finally{
      if(controller.current===pending){
        controller.current=null;
        if(!pending.signal.aborted)setBusy(false);
      }
    }
  }

  function download(){
    if(!url||busy||blocked)return;
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return <section className="pdf-document-section omega-report-pdf" id={id} aria-label={title}>
    <div className="pdf-toolbar">
      <div className="pdf-toolbar-label">
        <FileText size={18} aria-hidden="true"/>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="pdf-toolbar-buttons">
        <button className="btn quiet" type="button" disabled={busy||blocked}
          onClick={generate} aria-label={hasGenerated?"Refresh "+title:"Generate "+title}>
          <RefreshCw size={15} className={busy?"pdf-spin":undefined}/>
          {busy?"Generating…":hasGenerated?"Refresh preview":"Generate preview"}
        </button>
        <button className="btn primary" type="button" disabled={!url||busy||blocked}
          onClick={download}>
          <ArrowDownToLine size={16}/> Download PDF
        </button>
      </div>
    </div>
    {disabledReason&&<p className="notice neutral omega-report-pdf-warning" role="status">{disabledReason}</p>}
    {error&&<div role="alert" className="notice error pdf-error">{error}</div>}
    {busy&&<div className="pdf-loading" role="status">
      <RefreshCw size={23} className="pdf-spin" aria-hidden="true"/>
      <span>Generating the current A4 PDF…</span>
    </div>}
    {!busy&&url&&!blocked&&<iframe className="pdf-document-frame"
      title={title+" — A4 document preview"}
      src={url+"#toolbar=0&navpanes=0&view=FitH"}/>}
    {!busy&&!url&&<div className="omega-report-pdf-empty" role="status">
      <FileText size={30} aria-hidden="true"/>
      <strong>{blocked?"PDF preview not yet available":"Ready to preview"}</strong>
      <span>{blocked?"Complete the required report details above, then generate the preview.":
        "Generate the PDF to review its pages here before downloading the same file."}</span>
    </div>}
    <p className="pdf-document-note">
      <ShieldCheck size={15} aria-hidden="true"/>
      Generated for the signed-in session. Changing report details clears the previous preview.
    </p>
  </section>;
}
