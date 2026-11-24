"use client";

 import { useCallback, useEffect, useRef, useState } from "react";
import FundPerformanceReview from "@/components/fund-performance-review";
import FundSourceAudit from "@/components/fund-source-audit";
import FundEnrichmentAudit from "@/components/fund-enrichment-audit";
import {
  ArrowDownToLine, CheckCircle2, FileSpreadsheet, FileText, FolderLock,
  LoaderCircle, RefreshCw, ShieldAlert, UploadCloud
} from "lucide-react";

type DocumentRecord = {
  id: string;
  filename: string;
  status: string;
  kind: "factsheet" | "performance";
  uploaded_at: string;
};

const MAX_SIZE = 3_500_000;

export default function SecureFundUploads() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetSequence, setResetSequence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const pdfInput = useRef<HTMLInputElement>(null);
  const perfInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/fund-uploads", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load saved documents.");
      const data = await response.json();
      setDocuments(data.documents ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function uploadFiles(files: FileList | null, kind: "factsheet" | "performance") {
    if (!files?.length || busy) return;
    setError("");
    setNote("");
    setBusy(true);
    let successes = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        failures.push(file.name + ": exceeds 3.5 MB; please use a smaller PDF or split the workbook.");
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      try {
        const response = await fetch("/api/fund-uploads", {
          method: "POST", body: form, credentials: "same-origin", cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok) {
          failures.push(file.name + ": " + (result.error || "Upload failed."));
        } else {
          successes++;
        }
      } catch {
        failures.push(file.name + ": Network error.");
      }
    }
    if (pdfInput.current) pdfInput.current.value = "";
    if (perfInput.current) perfInput.current.value = "";
    setBusy(false);
    if (successes) setNote(successes + " document" + (successes === 1 ? "" : "s") + " stored privately and queued for review.");
    if (failures.length) setError(failures.slice(0, 5).join(" "));
    await refresh();
  }

  async function resetAllSources(){
    if(busy)return;
    const typed=window.prompt("This permanently deletes all previous fund PDFs and workbooks from private storage, clears active source matches, and resets current review decisions. Prior review notes are kept only as audit history. Type RESET to continue:");
    if(typed!=="RESET")return;
    setBusy(true);setError("");setNote("");
    try{
      let complete=false;
      let deleted=0;
      for(let i=0;i<200;i++){
        const response=await fetch("/api/fund-uploads/reset",{
          method:"POST",credentials:"same-origin",cache:"no-store",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(i===0?
            {phase:"start",confirm:"DELETE_OLD_FUND_SOURCES"}:{phase:"continue"})
        });
        const result=await response.json() as {error?:string;pending?:number;removed?:number;hasMore?:boolean};
        if(!response.ok)throw new Error(result.error||"Could not clear the old uploads.");
        deleted+=Number(result.removed??0);
        if(!result.hasMore){complete=true;break}
        if(Number(result.removed??0)===0)
          throw new Error("Some private files could not be removed. Retry the cleanup before uploading new sources.");
      }
      if(!complete)throw new Error("Deletion batch limit reached. Continue the cleanup before uploading fresh sources.");
      setResetSequence(n=>n+1);
      setNote("Clean reset complete: "+deleted+
        " previous private source files removed. Upload the corrected XLSX workbook first, then the replacement PDFs.");
    }catch(error){
      setError(error instanceof Error?error.message:"Clean source reset failed.");
    }finally{
      setBusy(false);
      await refresh();
    }
  }

  const recorded = documents.length;
  const factsheets = documents.filter(d => d.kind === "factsheet").length;
  const performance = recorded - factsheets;

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">PRIVATE FUND DATABASE</span>
        <h1>Upload fund documents</h1>
        <p>Start fresh with the corrected XLSX workbook defining the 107 fund names and percentage returns, then upload the new PDF factsheets for automatic identity matching.</p>
      </div>
      <span className="soft-pill"><FolderLock size={14} /> Private storage</span>
    </div>
    <div className="two-col import-grid">
      <section className="panel padded">
        <div className="section-icon" style={{ width: "fit-content" }}><FileText size={20} /></div>
        <h2 style={{ marginTop: 18 }}>Fund factsheets</h2>
        <p className="muted">Upload your renamed PDFs after the workbook. Each PDF links automatically by its unique exact filename against the workbook fund name; the printed PDF title does not control the link.</p>
        <input ref={pdfInput} hidden multiple type="file" accept=".pdf,application/pdf"
          aria-label="Select PDF fund factsheets" onChange={e => void uploadFiles(e.currentTarget.files, "factsheet")} />
        <button type="button" className="dropzone" disabled={busy} onClick={() => pdfInput.current?.click()}>
          {busy ? <LoaderCircle size={28} className="pdf-spin" /> : <UploadCloud size={29} />}
          <b>{busy ? "Uploading documents..." : "Select fund factsheets"}</b>
          <small>PDF only • several files at once • maximum 3.5 MB per file</small>
        </button>
        <p className="fineprint">{factsheets} factsheet{factsheets === 1 ? "" : "s"} recorded.</p>
      </section>

      <section className="panel padded">
        <div className="section-icon" style={{ width: "fit-content" }}><FileSpreadsheet size={20} /></div>
        <h2 style={{ marginTop: 18 }}>Updated performance workbook — upload first</h2>
        <p className="muted">Required first: upload the corrected 107-fund XLSX workbook. Its FUNDS tab defines all fund names; its provider tabs contain every displayed performance return. Old PDF returns are not used.</p>
        <input ref={perfInput} hidden type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Select fund performance workbook" onChange={e => void uploadFiles(e.currentTarget.files, "performance")} />
        <button type="button" className="dropzone" disabled={busy} onClick={() => perfInput.current?.click()}>
          {busy ? <LoaderCircle size={28} className="pdf-spin" /> : <FileSpreadsheet size={29} />}
          <b>{busy ? "Uploading workbook..." : "Select Excel or CSV file"}</b>
          <small>XLSX or CSV • maximum 3.5 MB</small>
        </button>
        <p className="fineprint">{performance} performance file{performance === 1 ? "" : "s"} recorded.</p>
      </section>
    </div>

    {note && <div className="notice success" role="status"><CheckCircle2 size={17} /> {note}</div>}
    {error && <div className="notice error" role="alert"><ShieldAlert size={17} /> {error}</div>}

    <section className="panel padded">
      <div className="panel-heading">
        <div><span className="eyebrow">SOURCE DOCUMENT ARCHIVE</span><h2 style={{ marginTop: 8 }}>Uploaded documents</h2></div>
        <div className="button-row">
          <button className="btn quiet" type="button" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={15} /> Refresh</button>
          <button className="btn quiet" type="button" onClick={()=>void resetAllSources()} disabled={loading||busy}>
            <ShieldAlert size={15}/> Clear old PDFs + workbook
          </button>
        </div>
      </div>
      <p className="muted">These documents are stored privately in Vercel Blob. Use Clear old PDFs + workbook once before the fresh upload. The reset deletes the old sources; prior manual decisions remain only as inactive audit history.</p>
      {loading ? <p className="muted">Loading your documents...</p> : recorded === 0 ? (
        <div className="notice neutral"><FolderLock size={17} /> No documents have been uploaded yet. Start by uploading the official fund factsheets.</div>
      ) : (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>DOCUMENT</th><th>TYPE</th><th>UPLOADED</th><th>REVIEW</th><th></th></tr></thead>
          <tbody>{documents.map(d => <tr key={d.id}>
            <td><b style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{d.filename}</b></td>
            <td>{d.kind === "factsheet" ? "Factsheet PDF" : "Performance data"}</td>
            <td>{new Date(d.uploaded_at).toLocaleDateString("en-IE")}</td>
            <td><span className="soft-pill">{d.status === "linked" ? "Filename linked" : d.status === "imported" ? "Workbook imported" : d.status === "pending" ? "Not yet linked" : d.status}</span></td>
            <td><a className="btn quiet" href={"/api/fund-uploads/" + encodeURIComponent(d.id) + "/download"} aria-label={"Download " + d.filename}>
              <ArrowDownToLine size={15} /> Download
            </a></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>

    <FundSourceAudit/>
    <FundEnrichmentAudit key={resetSequence}/>
    <FundPerformanceReview key={resetSequence} />

    <div className="notice neutral" style={{ marginBottom: 22 }}>
      <ShieldAlert size={18} />
      <span><strong>Source intake only.</strong> New PDFs are automatically matched to the latest workbook fund names. Returns are sourced exclusively from that workbook. Mismatches remain in manual review; client-facing reports remain gated on reporting-date, share-class and fee validation. No client personal information should be uploaded.</span>
    </div>
  </>;
}
