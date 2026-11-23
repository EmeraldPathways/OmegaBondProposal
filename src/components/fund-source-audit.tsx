"use client";

import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";

type Audit={
  initialized:boolean;checkedAt:string;workbookFilename:string;
  expectedFunds:number;databaseReady:boolean;proposalReady:boolean;
  providerCounts:Record<string,number>;
  storageStatus:"verified"|"unavailable";storageReady:boolean|null;
  counts:{activeFunds:number;workbookReturnRows:number;pdfUploadRecords:number;
    exactFilenamePairs:number;currentReturnRows:number;
    currentReconciliationLinks:number;pdfTextExtracted:number;
    pdfTextUnavailable:number;extraPdfRecords:number;duplicatePdfFilenames:number};
  issues:{fund:string;provider:string;problem:string}[];
  extraPdfFilenames:string[];duplicatePdfFilenames:string[];
  missingBlobFiles:string[];storageNote:string|null;
  note:string
};

export default function FundSourceAudit(){
  const [audit,setAudit]=useState<Audit|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/fund-audit",{cache:"no-store",credentials:"same-origin"});
      const data=await response.json() as Audit&{error?:string};
      if(!response.ok||!data.initialized)throw new Error(data.error??"Fund audit is unavailable.");
      setAudit(data);
    }catch(e){
      setError(e instanceof Error?e.message:"Database check failed.");
    }finally{setBusy(false)}
  },[]);
  useEffect(()=>{void refresh()},[refresh]);

  return <section className="panel padded" style={{marginTop:20,marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <div>
        <span className="eyebrow">LIVE DATABASE AND SOURCE AUDIT</span>
        <h2 style={{marginTop:7}}>Fund data integrity check</h2>
        <p className="muted">Checks current Neon workbook rows, all PDF upload records, one-to-one filename associations and reconciliation links, plus Vercel Blob file references where available.</p>
      </div>
      <button className="btn quiet" onClick={()=>void refresh()} type="button" disabled={busy}>
        <RefreshCw size={15}/>{busy?"Checking…":"Check database"}
      </button>
    </div>
    {error&&<div className="notice error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    {audit&&<>
      <div className={"notice "+(audit.databaseReady?"success":"error")}
        style={{marginTop:12}} role="status">
        {audit.databaseReady?<CheckCircle2 size={17}/>:<ShieldAlert size={17}/>}
        <span><strong>{audit.databaseReady?"All 107 workbook fund rows and their PDF filenames are linked in Neon.":"Database source check found inconsistencies."}</strong>
          {" "}Stored file objects: {audit.storageStatus==="verified"?
            audit.storageReady?"verified present":"some missing":
            "not independently checked"}.
        </span>
      </div>
      <div className="stats-grid" style={{marginTop:15}}>
        <div className="stat"><span>Workbook fund names</span><strong>{audit.counts.activeFunds}/107</strong></div>
        <div className="stat"><span>Workbook return rows</span><strong>{audit.counts.workbookReturnRows}/107</strong></div>
        <div className="stat"><span>PDF files in database</span><strong>{audit.counts.pdfUploadRecords}</strong></div>
        <div className="stat"><span>Exact filename matches</span><strong>{audit.counts.exactFilenamePairs}/107</strong></div>
        <div className="stat"><span>Current reconciliation links</span><strong>{audit.counts.currentReconciliationLinks}/107</strong></div>
        <div className="stat"><span>PDF text extracted</span><strong>{audit.counts.pdfTextExtracted}/{audit.counts.pdfUploadRecords}</strong></div>
      </div>
      <p className="fineprint">Current workbook: <strong>{audit.workbookFilename}</strong>.
        Provider fund counts: Aviva {audit.providerCounts.Aviva??0}, Zurich {audit.providerCounts.Zurich??0},
        New Ireland {audit.providerCounts["New Ireland"]??0}, Standard Life {audit.providerCounts["Standard Life"]??0}.
        {" "}This verifies database links and names, not the contents of the PDFs or client distribution approval.
      </p>
      {audit.storageNote&&<p className="fineprint">{audit.storageNote}</p>}
      {(audit.issues.length>0||audit.extraPdfFilenames.length>0||
        audit.duplicatePdfFilenames.length>0||audit.missingBlobFiles.length>0)&&
        <div style={{marginTop:12}}>
          <h3>Source exceptions</h3>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>DOCUMENT / FUND</th><th>CHECK RESULT</th></tr></thead>
            <tbody>
              {audit.issues.map((x,i)=><tr key={"issue-"+i}>
                <td>{x.provider} · {x.fund}</td><td>{x.problem}</td>
              </tr>)}
              {audit.extraPdfFilenames.map((x,i)=><tr key={"extra-"+i}><td>{x}</td><td>PDF not listed in current workbook</td></tr>)}
              {audit.duplicatePdfFilenames.map((x,i)=><tr key={"dupe-"+i}><td>{x}</td><td>Duplicate uploaded PDF filename</td></tr>)}
              {audit.missingBlobFiles.map((x,i)=><tr key={"blob-"+i}><td>{x}</td><td>Database record exists but private Blob object was not found</td></tr>)}
            </tbody>
          </table></div>
        </div>}
      <p className="fineprint">Checked {new Date(audit.checkedAt).toLocaleString("en-IE")}. Workbook returns remain the sole performance source. PDF text-extraction gaps are shown separately and do not imply missing PDF filename links.</p>
    </>}
  </section>;
}
