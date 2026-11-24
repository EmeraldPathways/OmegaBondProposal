"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";

type ProviderStatus={total:number;checked:number;saved:number};
type Status={
  total:number;expected:number;checked:number;saved:number;pending:number;
  needsReview:number;hasMore:boolean;byProvider:Record<string,ProviderStatus>;
  exceptions:{fund:string;provider:string;reason:string}[];
  completed?:{fund:string;provider:string;status:string}[];
  error?:string;
};
export default function FundMetadataAudit(){
  const [data,setData]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const working=useRef(false),cancelled=useRef(false),started=useRef(false);
  const fetchStatus=useCallback(async()=>{
    const response=await fetch("/api/fund-metadata",{
      cache:"no-store",credentials:"same-origin"
    });
    const payload=await response.json() as Status;
    if(!response.ok)throw new Error(payload.error||"Could not read fund details.");
    setData(payload);
    return payload;
  },[]);
  const run=useCallback(async(retryIssues=false)=>{
    if(working.current)return;
    working.current=true;cancelled.current=false;
    setBusy(true);setError("");
    try{
      if(retryIssues){
        const retry=await fetch("/api/fund-metadata",{
          method:"POST",headers:{"Content-Type":"application/json"},
          credentials:"same-origin",cache:"no-store",
          body:JSON.stringify({retryIssues:true})
        });
        const result=await retry.json() as Status;
        if(!retry.ok)throw new Error(result.error||"Could not retry metadata extraction.");
        setData(result);
      }
      // Each server request saves the fields of a single factsheet.
      // Progress is durable, so refreshing/closing the page does not erase work.
      for(let count=0;count<150&&!cancelled.current;count++){
        const resp=await fetch("/api/fund-metadata",{
          method:"POST",headers:{"Content-Type":"application/json"},
          credentials:"same-origin",cache:"no-store",body:"{}"
        });
        const next=await resp.json() as Status;
        if(!resp.ok)throw new Error(next.error||"Fund details could not be saved.");
        setData(next);
        if(!next.hasMore||!next.completed?.length)break;
      }
    }catch(e){
      if(!cancelled.current)
        setError(e instanceof Error?e.message:"Metadata processing failed.");
    }finally{working.current=false;setBusy(false);}
  },[]);
  useEffect(()=>{
    cancelled.current=false;
    void (async()=>{
      try{
        const snapshot=await fetchStatus();
        if(snapshot.hasMore&&!started.current){
          started.current=true;
          void run();
        }
      }catch(e){
        if(!cancelled.current)
          setError(e instanceof Error?e.message:"Metadata status unavailable.");
      }
    })();
    return ()=>{cancelled.current=true};
  },[fetchStatus,run]);
  return <section className="panel padded" style={{marginTop:20}}>
    <div className="panel-heading">
      <div>
        <span className="eyebrow">STORED FACTSHEET DATA</span>
        <h2 style={{marginTop:8}}>Fund descriptions and details</h2>
      </div>
      <div className="button-row">
        <button type="button" className="btn quiet"
          disabled={busy} onClick={()=>void fetchStatus().catch(e=>
            setError(e instanceof Error?e.message:"Could not refresh data."))}>
          <RefreshCw size={15}/> Refresh
        </button>
        <button type="button" className="btn primary"
          disabled={busy||data?.total===0}
          onClick={()=>void run(data?.pending===0&&!!data?.needsReview)}>
          {busy?"Saving fund details…":
            data?.pending?"Resume extraction":
            data?.needsReview?"Retry missing details":"Recheck stored details"}
        </button>
      </div>
    </div>
    {data&&<>
      <div className="stats-grid">
        <div className="stat"><span>Linked PDFs</span><strong>{data.total}</strong></div>
        <div className="stat"><span>Checked</span><strong>{data.checked}/{data.total}</strong></div>
        <div className="stat"><span>Saved descriptions</span><strong>{data.saved}</strong></div>
        <div className="stat"><span>Require attention</span><strong>{data.needsReview}</strong></div>
      </div>
      <div className="table-scroll" style={{marginTop:14}}>
        <table className="data-table">
          <thead><tr><th>PROVIDER</th><th>PDFS</th><th>PROCESSED</th><th>SAVED</th></tr></thead>
          <tbody>{Object.entries(data.byProvider).map(([name,detail])=>
            <tr key={name}><td>{name}</td>
              <td>{detail.total}</td><td>{detail.checked}</td><td>{detail.saved}</td>
            </tr>)}</tbody>
        </table>
      </div>
      {data.pending===0&&data.total===data.expected&&
        data.needsReview===0&&<p className="fineprint" style={{marginTop:15}}>
          <CheckCircle2 size={14} style={{verticalAlign:"middle"}}/> All 107 fund
          descriptions are saved in the database for proposal PDF creation.
        </p>}
      {data.exceptions.length>0&&<details style={{marginTop:16}}>
        <summary style={{cursor:"pointer"}}>
          View {data.exceptions.length} funds requiring source review
        </summary>
        <div className="table-scroll" style={{marginTop:9}}>
          <table className="data-table"><thead><tr>
            <th>FUND</th><th>PROVIDER</th><th>EXTRACTION ISSUE</th>
          </tr></thead>
          <tbody>{data.exceptions.map((issue,i)=><tr key={issue.fund+"-"+i}>
            <td>{issue.fund}</td><td>{issue.provider}</td><td>{issue.reason}</td>
          </tr>)}</tbody></table>
        </div>
      </details>}
    </>}
    {error&&<div className="notice error" role="alert">
      <ShieldAlert size={16}/>{error}
    </div>}
  </section>;
}
