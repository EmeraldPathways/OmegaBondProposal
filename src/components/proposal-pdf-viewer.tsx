"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowDownToLine,FileText,RefreshCw,ShieldCheck} from "lucide-react";
import type {Portfolio} from "@/lib/types";

export type WorkbookProposalInput={
  client:string;adviser:string;objective:string;investment:number;
  portfolios:Portfolio[];
};

/**
 * Signed-in, live preview of the exact same server-generated PDF that the
 * Download button exports. Blob lives only in the browser session.
 * No print flow, synthetic prices, or separately reconstructed preview.
 */
export default function ProposalPdfViewer({input}:{input:WorkbookProposalInput}){
  const [url,setUrl]=useState<string|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  const ownedBlob=useRef<string|null>(null);
  const body=JSON.stringify(input);

  useEffect(()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|null=null;
    setBusy(true);
    setError("");
    if(ownedBlob.current){
      URL.revokeObjectURL(ownedBlob.current);
      ownedBlob.current=null;
    }
    setUrl(null);
    timer=setTimeout(async()=>{
      try{
        const response=await fetch("/api/proposal/pdf",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body,credentials:"same-origin",cache:"no-store",
          signal:controller.signal
        });
        if(!response.ok){
          const message=await response.json().catch(()=>({error:"Unable to generate the proposal preview."}));
          throw new Error(message.error||"Unable to generate the proposal preview.");
        }
        const blob=await response.blob();
        if(controller.signal.aborted)return;
        if(!blob.size || !blob.type.includes("application/pdf"))
          throw new Error("The server did not return a valid PDF.");
        const next=URL.createObjectURL(blob);
        if(controller.signal.aborted){URL.revokeObjectURL(next);return;}
        ownedBlob.current=next;
        setUrl(next);
        setBusy(false);
      }catch(err){
        if(!controller.signal.aborted){
          setError(err instanceof Error?err.message:"PDF preview is unavailable.");
          setBusy(false);
        }
      }
    },500);
    return ()=>{
      controller.abort();
      if(timer)clearTimeout(timer);
      if(ownedBlob.current){
        URL.revokeObjectURL(ownedBlob.current);
        ownedBlob.current=null;
      }
    };
  },[body,refresh]);

  function download(){
    if(!url || busy)return;
    const a=document.createElement("a");
    a.href=url;
    a.download="Omega-Investment-Bond-Proposal.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return <section className="pdf-document-section" style={{marginTop:24}}>
    <div className="pdf-toolbar">
      <div className="pdf-toolbar-label">
        <FileText size={18} aria-hidden="true"/>
        <div>
          <strong>Live A4 PDF preview</strong>
          <span>Preview and download use exactly the same PDF generated from the current workbook and linked factsheets.</span>
        </div>
      </div>
      <div className="pdf-toolbar-buttons">
        <button className="btn quiet" type="button" disabled={busy}
          onClick={()=>setRefresh(n=>n+1)}>
          <RefreshCw size={15}/> Refresh preview
        </button>
        <button className="btn primary" type="button" disabled={!url||busy}
          onClick={download}>
          <ArrowDownToLine size={16}/> Download PDF
        </button>
      </div>
    </div>
    {error&&<div role="alert" className="notice error pdf-error">{error}</div>}
    {busy&&<div className="pdf-loading"><RefreshCw size={23} className="pdf-spin"/>
      <span>Preparing your updated proposal PDF preview…</span></div>}
    {url&&!busy&&<iframe className="pdf-document-frame"
      title="Omega investment bond proposal live A4 PDF preview"
      src={url+"#toolbar=0&navpanes=0&view=FitH"}/>}
    <p className="pdf-document-note"><ShieldCheck size={15} aria-hidden="true"/>
      Prepared privately for this signed-in session.</p>
  </section>;
}
