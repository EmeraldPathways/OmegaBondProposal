"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const recorded = documents.length;
  const factsheets = documents.filter(d => d.kind === "factsheet").length;
  const performance = recorded - factsheets;

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">PRIVATE FUND DATABASE</span>
        <h1>Upload fund documents</h1>
        <p>Upload official factsheets and the Omega 10-year performance workbook. The originals are stored privately and each upload is recorded in Neon.</p>
      </div>
      <span className="soft-pill"><FolderLock size={14} /> Private storage</span>
    </div>
    <div className="two-col import-grid">
      <section className="panel padded">
        <div className="section-icon" style={{ width: "fit-content" }}><FileText size={20} /></div>
        <h2 style={{ marginTop: 18 }}>Fund factsheets</h2>
        <p className="muted">Choose one or more official fund factsheets. Keep each fund and unit-class version as a separate PDF.</p>
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
        <h2 style={{ marginTop: 18 }}>Fund performance workbook</h2>
        <p className="muted">Upload the Excel workbook containing fund returns, or a dated historical-price CSV. Workbook summaries are retained as reported; they are not invented monthly prices.</p>
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
        <button className="btn quiet" type="button" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={15} /> Refresh</button>
      </div>
      <p className="muted">Original files are stored in private Vercel Blob. Only your signed-in account can download them through this application.</p>
      {loading ? <p className="muted">Loading your documents...</p> : recorded === 0 ? (
        <div className="notice neutral"><FolderLock size={17} /> No documents have been uploaded yet. Start with your Omega performance workbook and then the matching factsheets.</div>
      ) : (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>DOCUMENT</th><th>TYPE</th><th>UPLOADED</th><th>REVIEW</th><th></th></tr></thead>
          <tbody>{documents.map(d => <tr key={d.id}>
            <td><b style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{d.filename}</b></td>
            <td>{d.kind === "factsheet" ? "Factsheet PDF" : "Performance data"}</td>
            <td>{new Date(d.uploaded_at).toLocaleDateString("en-IE")}</td>
            <td><span className="soft-pill">{d.status === "pending" ? "Pending review" : d.status}</span></td>
            <td><a className="btn quiet" href={"/api/fund-uploads/" + encodeURIComponent(d.id) + "/download"} aria-label={"Download " + d.filename}>
              <ArrowDownToLine size={15} /> Download
            </a></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>

    <div className="notice neutral" style={{ marginBottom: 22 }}>
      <ShieldAlert size={18} />
      <span><strong>Source intake only.</strong> Uploaded figures are not automatically approved or used in portfolio comparisons. Fund identity, share class, observation dates, return basis and charges must be validated before they replace demonstration data. No client personal information should be uploaded.</span>
    </div>
  </>;
}
