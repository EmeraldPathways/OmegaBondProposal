"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";

type Status={total:number;processed:number;ready:number;needsReview:number;
  hasMore:boolean;exceptions?:{name:string;reason:string}[]};
type Props={selectedFundIds?:string[];onUpdated?:()=>void;autoStart?:boolean};
export default function FundChartReconstruction({
  selectedFundIds=[],onUpdated,autoStart=false
}:Props){
  const [status,setStatus]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const stopped=useRef(false),started=useRef(false);
  const callback=useRef(onUpdated);
  const ids=useRef(selectedFundIds);
  callback.current=onUpdated;
  ids.current=selectedFundIds;

  const processAll=useCallback(async()=>{
    if(busy)return;
    stopped.current=false;setBusy(true);setError("");
    try{
      let remaining=true,rounds=0,changed=false;
      while(remaining && !stopped.current && rounds<70){
        rounds++;
        const resp=await fetch("/api/fund-charts",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({fundIds:ids.current.slice(0,30)}),
          credentials:"same-origin",cache:"no-store"
        });
        const result=await resp.json() as Status&{error?:string;completed?:unknown[]};
        if(!resp.ok)throw new Error(result.error??"Chart extraction failed.");
        setStatus(result);
        if(result.completed?.length)changed=true;
        remaining=result.hasMore;
        if(result.completed?.length===0)break;
      }
      if(changed)callback.current?.();
    }catch(e){
      setError(e instanceof Error?e.message:"PDF chart extraction failed.");
    }finally{setBusy(false)}
  },[busy]);
  useEffect(()=>{
    stopped.current=false;
    void (async()=>{
      try{
        const resp=await fetch("/api/fund-charts",{
          cache:"no-store",credentials:"same-origin"
        });
        if(!resp.ok)return;
        const result=await resp.json() as Status;
        if(stopped.current)return;
        setStatus(result);
        if(autoStart&&result.hasMore&&!started.current){
          started.current=true;void processAll();
        }
      }catch{/* The main proposal still works without optional chart extraction. */}
    })();
    return ()=>{stopped.current=true};
  // Run on first mount only; selected IDs are kept current in a ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return <section className="panel padded" style={{marginTop:20}}>
    <span className="eyebrow">RECREATED FACTSHEET GROWTH CURVES</span>
    <h2 style={{marginTop:8}}>Historical chart extraction</h2>
    <p className="muted">Omega traces historical growth lines from the original uploaded PDFs, calibrates their printed date and value axes, and caches the reconstructed readings per fund. The exported proposal draws new charts from these observations, not images copied from factsheets.</p>
    {status&&<>
      <div className="stats-grid">
        <div className="stat"><span>Source PDFs</span><strong>{status.total}</strong></div>
        <div className="stat"><span>PDFs inspected</span><strong>{status.processed}/{status.total}</strong></div>
        <div className="stat"><span>Charts reconstructed</span><strong>{status.ready}</strong></div>
        <div className="stat"><span>Require chart review</span><strong>{status.needsReview}</strong></div>
      </div>
      <p className="fineprint">The source factsheets may use different graph conventions. A reconstructed chart requires readable calendar dates, labelled numeric axes and an identifiable growth curve. Ineligible sources are not estimated or silently marked as complete.</p>
    </>}
    {error&&<div className="notice error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    <div className="button-row">
      <button type="button" className="btn primary" disabled={busy}
        onClick={()=>void processAll()}>
        <RefreshCw size={16}/>{busy?
          "Reconstructing source charts…":"Extract missing historical charts"}
      </button>
      {status&&!status.hasMore&&<span className="soft-pill">
        <CheckCircle2 size={14}/> All source PDFs checked
      </span>}
    </div>
    {status?.exceptions&&status.exceptions.length>0&&
      <details style={{marginTop:18}}>
        <summary style={{fontSize:12,cursor:"pointer"}}>
          View {status.needsReview} charts that could not be reconstructed reliably
        </summary>
        <div className="table-scroll" style={{marginTop:11}}>
          <table className="data-table"><thead><tr><th>FUND</th><th>REASON</th></tr></thead>
            <tbody>{status.exceptions.map(x=><tr key={x.name}><td>{x.name}</td><td>{x.reason}</td></tr>)}</tbody>
          </table>
        </div>
      </details>}
  </section>;
}
