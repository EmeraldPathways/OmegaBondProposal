"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {FileText,RefreshCw,ShieldAlert,PauseCircle} from "lucide-react";

type Report={
  expected:number;uploaded:number;attempted:number;pending:number;notStatedFields:number;
  extracted:number;review:number;identityConflicts:number;incompleteFields:number;
  complete:boolean;
  byProvider:Record<string,{total:number;extracted:number;needsReview:number;pending:number}>;
  issues:{fund:string;provider:string;filename:string|null;status:string;
    missing:string[];notStated?:string[];identityIssue:string|null;warnings:string[]}[];
};
type Batch={processed:number;remaining:number;done:boolean;
  results:{filename:string;status:string;message:string|null}[];error?:string};
export default function FundEnrichmentAudit(){
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [runCount,setRunCount]=useState(0);
  const [isPaused,setIsPaused]=useState(false);
  const pauseAfterCurrent=useRef(false);
  const activeRequest=useRef(false);
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/fund-enrichment",{credentials:"same-origin",cache:"no-store"});
    const payload=await response.json() as Report&{error?:string};
    if(!response.ok)throw new Error(payload.error??"The extraction audit is unavailable.");
    setReport(payload);
    return payload;
  },¶»§q«^