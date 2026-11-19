"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowUpRight,CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";
import {matchScore} from "@/lib/reconciliation/engine";

type PdfChoice={id:string;title:string;filename:string;moneyMateId:string|null;score:number};
type RowChoice={importId:string;row:number;name:string;score:number;returns:Record<string,number|null>};
type Manual={decision:"confirmed"|"rejected";factsheet_import_id:string|null;performance_import_id:string|null;
  performance_row:number|null;score_at_review:number|null;note:string;reviewed_at:string};
type Choices={
  fund:{id:string;provider:string;name:string};
  automatic:{factsheetImportId:string|null;performanceImportId:string|null;performanceRow:number|null};
  manual:Manual|null;pdfs:PdfChoice[];rows:RowChoice[];note:string
};
const labels:[string,string][]=[["ytd","YTD"],["oneMonth","1m"],["threeMonth","3m"],["sixMonth","6m"],["oneYear","1y"],["threeYear","3y"],["fiveYear","5y"],["tenYear","10y"],["sinceLaunch","Since launch"]];
const pct=(n:number|null|undefined)=>n==null?"N/A":(n>0?"+":"")+n.toFixed(2)+"%";
const rowKey=(r:{importId:string;row:number})=>r.importId+":"+r.row;

export default function FundManualReview({fundId,onSaved}:{fundId:string;onSaved:()=>Promise<unknown>}){
  const [choices,setChoices]=useState<Choices|null>(null);
  const [pdfId,setPdfId]=useState("");
  const [workbookKey,setWorkbookKey]=useState("");
  const [note,setNote]=useState("");
  const [acknowledged,setAcknowledged]=useState(false);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[message,setMessage]=useState("");

  async function load(){
    setLoading(true);
    const response=await fetch("/api/fund-reconciliation/"+encodeURIComponent(fundId)+"/review",{
      credentials:"same-origin",cache:"no-store"
    });
    const data=await response.json() as Choices & {error?:string};
    if(!response.ok)throw new Error(data.error||"Unable to load review choices.");
    setChoices(data);
    const reviewed=data.manual?.decision==="confirmed";
    setPdfId(reviewed?data.manual?.factsheet_import_id??"":
      data.automatic.factsheetImportId??data.pdfs[0]?.id??"");
    const selectedRow=reviewed?data.rows.find(r=>
      r.importId===data.manual?.performance_import_id&&r.row===data.manual?.performance_row):
      data.rows.find(r=>r.importId===data.automatic.performanceImportId&&
        r.row===data.automatic.performanceRow);
    setWorkbookKey(selectedRow?rowKey(selectedRow):data.rows[0]?rowKey(data.rows[0]):"");
    setNote(data.manual?.note??"");
    setAcknowledged(false);
    setLoading(false);
  }
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const response=await fetch("/api/fund-reconciliation/"+encodeURIComponent(fundId)+"/review",{
          credentials:"same-origin",cache:"no-store"});
        const data=await response.json() as Choices & {error?:string};
        if(!response.ok)throw new Error(data.error||"Unable to load review choices.");
        if(!active)return;
        setChoices(data);
        const reviewed=data.manual?.decision==="confirmed";
        setPdfId(reviewed?data.manual?.factsheet_import_id??"":
          data.automatic.factsheetImportId??data.pdfs[0]?.id??"");
        const selectedRow=reviewed?data.rows.find(r=>
          r.importId===data.manual?.performance_import_id&&r.row===data.manual?.performance_row):
          data.rows.find(r=>r.importId===data.automatic.performanceImportId&&
            r.row===data.automatic.performanceRow);
        setWorkbookKey(selectedRow?rowKey(selectedRow):data.rows[0]?rowKey(data.rows[0]):"");
        setNote(data.manual?.note??"");
      }catch(e){
        if(active)setError(e instanceof Error?e.message:"Could not load review choices.");
      }finally{if(active)setLoading(false)}
    })();
    return ()=>{active=false};
  },[fundId]);

  const selectedPdf=useMemo(()=>choices?.pdfs.find(p=>p.id===pdfId),[choices,pdfId]);
  const selectedRow=useMemo(()=>choices?.rows.find(r=>rowKey(r)===workbookKey),[choices,workbookKey]);
  const score=choices&&selectedPdf&&selectedRow?
    matchScore(choices.fund.name,selectedPdf.title,selectedRow.name):null;
  const lowScore=!!score && (score.score<.6 || !score.classConsistent);
  async function submit(decision:"confirmed"|"rejected"|"reset"){
    if(decision==="confirmed"&&(!selectedPdf||!selectedRow||!acknowledged))return;
    if(decision==="confirmed"&&lowScore&&note.trim().length<8){
      setError("Please explain the manual override when the score is low or the series/class differs.");
      return;
    }
    if(decision==="rejected"&&note.trim().length<3){
      setError("Add a brief reason before rejecting the suggested match.");
      return;
    }
    const body=decision==="confirmed"?{
      decision,factsheetImportId:selectedPdf!.id,
      performanceImportId:selectedRow!.importId,performanceRow:selectedRow!.row,note:note.trim()
    }:decision==="rejected"?{decision,note:note.trim()}:{decision};
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/fund-reconciliation/"+encodeURIComponent(fundId)+"/review",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
      });
      const result=await response.json() as {error?:string;message?:string};
      if(!response.ok)throw new Error(result.error||"Could not save the review.");
      await onSaved();
      await load();
      setMessage(result.message||(
        decision==="rejected"?"The proposed identity match has been rejected.":
        "Manual decision reset; automatic suggestions are available again."));
    }catch(e){setError(e instanceof Error?e.message:"Could not save the review.");}
    finally{setBusy(false);}
  }

  if(loading)return <div className="notice neutral"><RefreshCw size={16}/> Loading all provider sources for manual review…</div>;
  if(!choices)return <div role="alert" className="notice error">{error||"Review choices are unavailable."}</div>;
  return <section className="panel padded" style={{background:"#faf9f7",marginTop:16,marginBottom:14}}>
    <span className="eyebrow">MANUAL SOURCE VERIFICATION</span>
    <h3 style={{marginTop:8}}>{choices.fund.name}</h3>
    <p className="muted">{choices.fund.provider} · {choices.manual?.decision==="confirmed"?"Identity confirmed on "+new Date(choices.manual.reviewed_at).toLocaleDateString("en-IE"):
      choices.manual?.decision==="rejected"?"Automatic selection rejected":"Not manually reviewed"}</p>
    <p className="fineprint">Select the exact fund name printed inside its PDF and the corresponding workbook series. Uploaded filenames are shown only to help you locate the original file.</p>

    <div className="two-col" style={{gap:16,marginTop:14}}>
      <div>
        <label className="form-label" htmlFor="pdf-choice">Official factsheet title</label>
        <select id="pdf-choice" className="form-input" style={{width:"100%"}} value={pdfId}
          onChange={e=>{setPdfId(e.target.value);setAcknowledged(false)}}>
          <option value="">Choose a PDF title…</option>
          {choices.pdfs.map(p=><option value={p.id} key={p.id}>{p.title} · {p.score}/100</option>)}
        </select>
        {selectedPdf&&<>
          <p className="fineprint">PDF-title similarity: <strong>{selectedPdf.score}/100</strong> · MoneyMate ID: {selectedPdf.moneyMateId||"Not shown"}</p>
          <p><a href={"/api/fund-uploads/"+selectedPdf.id+"/download?view=1"}
            target="_blank" rel="noopener noreferrer">Open original PDF <ArrowUpRight size={13}/></a></p>
          <p className="fineprint">Archive filename (not used for matching): {selectedPdf.filename}</p>
        </>}
      </div>
      <div>
        <label className="form-label" htmlFor="series-choice">Published performance series</label>
        <select id="series-choice" className="form-input" style={{width:"100%"}} value={workbookKey}
          onChange={e=>{setWorkbookKey(e.target.value);setAcknowledged(false)}}>
          <option value="">Choose workbook row…</option>
          {choices.rows.map(r=><option key={rowKey(r)} value={rowKey(r)}>{r.name} · row {r.row} · {r.score}/100</option>)}
        </select>
        {selectedRow&&<p className="fineprint">Workbook name similarity: <strong>{selectedRow.score}/100</strong> · Source row {selectedRow.row}</p>}
      </div>
    </div>

    {score&&<div className="notice neutral" style={{marginTop:14}}>
      <ShieldAlert size={17}/><span>
        <strong>Combined matching score: {Math.round(score.score*100)}/100</strong> ·
        PDF title {Math.round(score.factsheetScore*100)}/100 ·
        Workbook title {Math.round(score.workbookScore*100)}/100.
        {score.classConsistent?" No explicit series conflict detected.":" Share-class or pension/growth designation needs your attention."}
        {" "}These are heuristic similarity scores, not measured accuracy probabilities.
      </span>
    </div>}
    {selectedRow&&<div className="table-scroll" style={{marginTop:16}}>
      <table className="data-table">
        <thead><tr>{labels.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead>
        <tbody><tr>{labels.map(([key])=><td key={key}>{pct(selectedRow.returns?.[key])}</td>)}</tr></tbody>
      </table>
      <p className="fineprint">These published workbook figures are not approved for client proposals. Missing returns remain N/A.</p>
    </div>}

    <label className="form-label" htmlFor="review-note" style={{marginTop:16}}>Review note / source evidence</label>
    <textarea id="review-note" className="form-input textarea" maxLength={800} rows={2}
      placeholder="Record why this particular factsheet and series are the correct match."
      value={note} onChange={e=>setNote(e.target.value)}/>
    <label style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:12,margin:"12px 0"}}>
      <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>
      I have checked the fund title inside the PDF and the workbook share class. I understand this confirms identity only, not return figures.
    </label>
    <div className="button-row">
      <button className="btn primary" type="button" disabled={busy||!selectedPdf||!selectedRow||!acknowledged}
        onClick={()=>void submit("confirmed")}><CheckCircle2 size={16}/> Confirm identity match</button>
      <button className="btn quiet" type="button" disabled={busy} onClick={()=>void submit("rejected")}>
        <ShieldAlert size={15}/> Reject suggested match
      </button>
      <button className="btn quiet" type="button" disabled={busy||!choices.manual} onClick={()=>void submit("reset")}>
        <RefreshCw size={15}/> Reset decision
      </button>
    </div>
    {error&&<div role="alert" className="notice error">{error}</div>}
    {message&&<div role="status" className="notice success">{message}</div>}
  </section>;
}
