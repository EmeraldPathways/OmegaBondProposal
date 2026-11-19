"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProposalInput } from "@/lib/pdf/model";

/**
 * The iframe and the download link use the identical server-rendered PDF Blob.
 * No browser print flow is used, so Chromium print headers, URLs and page
 * numbers can never be inserted into the exported document.
 */
export default function ProposalPdfViewer({ input }: { input: ProposalInput }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const body = JSON.stringify(input);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setUrl(old => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });

    const handle = setTimeout(async () => {
      try {
        const response = await fetch("/api/proposal/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await response.json().catch(() => ({}));
          throw new Error(message.error || "Unable to generate PDF.");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (blob.type !== "application/pdf" || blob.size === 0) {
          throw new Error("The server did not return a valid PDF.");
        }
        const next = URL.createObjectURL(blob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(next);
          return;
        }
        setUrl(next);
        setBusy(false);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to create preview.");
          setBusy(false);
        }
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [body, refresh]);

  // Release downloaded PDF blobs when the viewer unmounts or the URL changes.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function download() {
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Omega-Investment-Bond-Proposal.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <section className="pdf-document-section">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-label">
          <FileText size={18} aria-hidden="true" />
          <div>
            <strong>Live A4 PDF preview</strong>
            <span>Exactly the same file will be downloaded. No browser print headers, footers, URLs or page numbers.</span>
          </div>
        </div>
        <div className="pdf-toolbar-buttons">
          <button className="btn quiet" type="button" disabled={busy} onClick={() => setRefresh(i=>i+1)}>
            <RefreshCw size={15}/> Refresh
          </button>
          <button className="btn primary" type="button" disabled={!url || busy} onClick={download}>
            <ArrowDownToLine size={16}/> Download PDF
          </button>
        </div>
      </div>
      {error && <div role="alert" className="notice error pdf-error">{error}</div>}
      {busy && <div className="pdf-loading"><RefreshCw size={23} className="pdf-spin"/><span>Preparing your PDF preview…</span></div>}
      {url && !busy && (
        <iframe className="pdf-document-frame" title="Omega investment proposal PDF preview"
          src={url + "#toolbar=0&navpanes=0&view=FitH"} />
      )}
      <p className="pdf-document-note"><ShieldCheck size={15} aria-hidden="true"/>
        Generated securely for this signed-in session. This prototype contains synthetic or unverified fund data and must not be issued to clients.
      </p>
    </section>
  );
}
