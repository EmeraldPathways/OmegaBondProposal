"use client";

import {useEffect, useMemo, useState} from "react";
import {ClipboardPaste, FileText, Plus, Save, Trash2} from "lucide-react";
import {
  type InvestmentRecord, type FundPosition, type FlowEntry, type ValuationEntry,
  calculatePerformance, checkPolicyValuations, emptyRecord, portfolioChartSeries
} from "@/lib/v2-investment-performance";
import {calculateCombinedPortfolio,reconcileStatementTotals,portfolioWarnings} from "@/lib/v2-policy-portfolios";
import {parseValuationTable,parseValuationMatrix,parseCashFlowTable} from "@/lib/v2-manual-table";
import ActualReportPdfViewer from "@/components/actual-report-pdf-viewer";

type Mode = "performance" | "withdrawals";
type SavedRecord = InvestmentRecord & {updatedAt?: string};
const euro = (n: number | null) => n === null || !Number.isFinite(n) ? "—" :
  new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const pct = (n: number | null) => n === null || !Number.isFinite(n) ? "—" :
  (n > 0 ? "+" : "") + n.toFixed(2) + "%";
const today = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
};
const uid = () => crypto.randomUUID();
function Amount({value,onChange,label,placeholder}:{value:number|null;onChange:(n:number|null)=>void;label:string;placeholder?:string}) {
  const [draft,setDraft]=useState(value===null?"":String(value));
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setDraft(value===null?"":String(value));},[value,focused]);
  return <input className="form-input" type="text" inputMode="decimal"
    aria-label={label} placeholder={placeholder ?? "0.00"} value={draft}
    onFocus={()=>setFocused(true)}
    onChange={e => {
      const next=e.target.value.replace(/,/g,"");
      if(!/^\d*(?:\.\d{0,2})?$/.test(next))return;
      setDraft(next);
      const n=next===""||next==="."?null:Number(next);
      onChange(n!==null&&Number.isFinite(n)?n:null);
    }}
    onBlur={()=>{setFocused(false);setDraft(value===null?"":String(value));}}/>;
}
function Metric({label,value,detail}:{label:string;value:string;detail?:string}) {
  return <div className="omega-v2-metric"><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>;
}
function ValuationChart({record,start,end}:{record:InvestmentRecord;start:string;end:string}) {
  const series = portfolioChartSeries(record).filter(p=>p.date>=start&&p.date<=end);
  if(series.length < 2) return <p className="muted">Add at least two dated portfolio valuations to display the actual value history.</p>;
  const values = series.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || Math.max(max, 1);
  const from = Date.parse(series[0].date+"T00:00:00Z");
  const to = Date.parse(series[series.length-1].date+"T00:00:00Z");
  const range = to - from || 1;
  const coords = series.map(p => {
    const x = 56 + 600*(Date.parse(p.date+"T00:00:00Z")-from)/range;
    const y = 174 - 118*(p.value-min)/span;
    return {x,y,...p};
  });
  return <div className="omega-v2-chart" role="img" aria-label="Recorded portfolio valuations over time, not cash-flow-adjusted">
    <svg viewBox="0 0 720 220" width="100%" aria-hidden="true">
      <line x1="52" x2="662" y1="180" y2="180" stroke="#E4E3DE"/>
      <line x1="52" x2="662" y1="48" y2="48" stroke="#E4E3DE" strokeDasharray="4 5"/>
      <polyline fill="none" stroke="#671E27" strokeWidth="3" strokeLinejoin="round"
        points={coords.map(p=>p.x+","+p.y).join(" ")}/>
      {coords.map(p=><circle key={p.date} cx={p.x} cy={p.y} r="4.5" fill="#988B54" stroke="#FFF" strokeWidth="1.5"/>)}
      <text x="52" y="29" fill="#72766F" fontSize="12">{euro(max)}</text>
      <text x="52" y="200" fill="#72766F" fontSize="12">{series[0].date}</text>
      <text x="662" y="200" fill="#72766F" fontSize="12" textAnchor="end">{series[series.length-1].date}</text>
    </svg>
    <p className="fineprint">Recorded market values only. Contributions and withdrawals affect this line; use the cash-flow-adjusted return for investment performance.</p>
  </div>;
}
function addMonth(date:string,offset:number) {
  const parts=date.split("-").map(Number);
  const first=new Date(Date.UTC(parts[0],parts[1]-1+offset,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const day=Math.min(parts[2],last);
  return first.getUTCFullYear()+"-"+String(first.getUTCMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}

export default function PerformanceWorkspace({mode}:{mode:Mode}) {
  const [record,setRecord]=useState<InvestmentRecord>(emptyRecord);
  const [saved,setSaved]=useState<SavedRecord[]>([]);
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [status,setStatus]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [repeatDate,setRepeatDate]=useState("");
  const [repeatAmount,setRepeatAmount]=useState<number|null>(null);
  const [repeatCadence,setRepeatCadence]=useState<"monthly"|"annually">("monthly");
  const [repeatCount,setRepeatCount]=useState(12);
  const [repeatFund,setRepeatFund]=useState("policy");
  const [pasteMode,setPasteMode]=useState<"dates"|"matrix"|"cash"|null>(null);
  const [pasteSource,setPasteSource]=useState("");
  const [includedPolicyIds,setIncludedPolicyIds]=useState<string[]>([]);

  useEffect(()=>{
    let cancelled=false;
    fetch("/api/v2/investments",{credentials:"same-origin",cache:"no-store"})
      .then(async r=>{const json=await r.json();if(!r.ok)throw new Error(json.error||"Could not load cases");return json as {records:SavedRecord[]};})
      .then(json=>{if(cancelled)return;setSaved(json.records);if(json.records.length){
        const first=json.records[0];setRecord(first);
        setStart(first.investmentDate);
        setEnd(first.valuations.map(v=>v.date).sort().at(-1)??today());
      }})
      .catch(error=>{if(!cancelled)setStatus(error instanceof Error?error.message:"Could not load V2 records.");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[]);
  const performance=useMemo(()=>calculatePerformance(record,start,end),[record,start,end]);
  const portfolioCandidates=saved.filter(p=>p.id&&record.clientName.trim()&&
    p.clientName.trim().toLowerCase()===record.clientName.trim().toLowerCase()&&
    (p.portfolioGroup??"").trim().toLowerCase()===(record.portfolioGroup??"").trim().toLowerCase());
  const selectedPolicies=portfolioCandidates.filter(p=>includedPolicyIds.includes(p.id!)).map(p=>p.id===record.id?record:p);
  const combined=calculateCombinedPortfolio(selectedPolicies,start,end);
  const statementChecks=reconcileStatementTotals(record);
  const funds=useMemo(()=>record.funds.map(f=>({fund:f,result:calculatePerformance(record,start,end,f.id)})),[record,start,end]);
  const periodFlows=record.flows.filter(f=>f.date>start&&f.date<=end);
  const notes=[start,end].filter(Boolean).map(date=>checkPolicyValuations(record,date)).filter((v):v is string=>!!v);
  const initialFundTotal=record.funds.length>0&&record.funds.every(f=>f.initialAmount!==null)
    ?record.funds.reduce((sum,f)=>sum+(f.initialAmount??0),0):null;
  if(initialFundTotal!==null&&record.originalInvestment>0&&Math.abs(initialFundTotal-record.originalInvestment)>0.02)
    notes.push("Initial fund amounts do not total the original policy investment.");
  function edit(changes:Partial<InvestmentRecord>){
    const changesEvidence=["flows","valuations","funds","originalInvestment","investmentDate",
      "statementContributions","statementWithdrawals","statementAsOf"].some(key=>key in changes);
    setRecord(r=>({...r,...changes,...(changesEvidence?{cashFlowsConfirmed:false}:{})}));
    setStatus(changesEvidence?"Unsaved changes · recheck the complete cash-flow ledger.":"Unsaved changes");
  }
  useEffect(()=>{setIncludedPolicyIds(record.id?[record.id]:[]);},[record.id]);
  function newCase(){setRecord(emptyRecord());setStart("");setEnd("");setStatus("New unsaved policy");}
  function openCase(id:string){const next=saved.find(r=>r.id===id);if(!next)return;
    setRecord(next);setStart(next.investmentDate);setEnd(next.valuations.map(v=>v.date).sort().at(-1)??today());setStatus("Loaded saved policy");
  }
  async function save(){
    if(!record.clientName.trim()||!record.policyName.trim()){setStatus("Enter the client name and policy name before saving.");return;}
    setSaving(true);setStatus("");
    try{
      const response=await fetch("/api/v2/investments",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(record)
      });
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"Save failed");
      const next=json.record as SavedRecord;
      setRecord(next);
      setSaved(previous=>[next,...previous.filter(p=>p.id!==next.id)]);
      setStatus("Policy saved to the separate V2 database.");
    }catch(error){setStatus(error instanceof Error?error.message:"Unable to save.");}
    finally{setSaving(false);}
  }
  function changeFund(id:string,changes:Partial<FundPosition>){
    edit({funds:record.funds.map(f=>f.id===id?{...f,...changes}:f)});
  }
  function changeValuation(id:string,changes:Partial<ValuationEntry>){
    edit({valuations:record.valuations.map(v=>v.id===id?{...v,...changes}:v)});
  }
  function changeFlow(id:string,changes:Partial<FlowEntry>){
    edit({flows:record.flows.map(f=>f.id===id?{...f,...changes}:f)});
  }
  function addValuation(){
    const date=end||today();
    edit({valuations:[...record.valuations,{id:uid(),date,fundId:null,value:null}]});
    if(!end)setEnd(date);
  }
  function addFlow(kind:"contribution"|"withdrawal"){
    edit({flows:[...record.flows,{id:uid(),kind,date:today(),fundId:null,amount:0,note:""}]});
  }
  function addRecurring(){
    if(!repeatDate||!repeatAmount||repeatAmount<=0||repeatCount<1||repeatCount>240){
      setStatus("Enter a first payment date, positive amount and 1–240 payments.");return;
    }
    const additions:Array<FlowEntry>=[];
    for(let i=0;i<repeatCount;i++){
      const date=addMonth(repeatDate,i*(repeatCadence==="monthly"?1:12));
      additions.push({id:uid(),date,kind:"contribution",amount:repeatAmount,
        fundId:repeatFund==="policy"?null:repeatFund,note:repeatCadence==="monthly"?"Monthly contribution":"Annual contribution"});
    }
    if(additions.some(f=>f.date>today())){
      setStatus("The schedule includes future payments. Enter only contributions actually received; reduce the count or change the first date.");return;
    }
    if(record.investmentDate&&additions.some(f=>f.date<record.investmentDate)){
      setStatus("The schedule cannot begin before the policy's original investment date.");return;
    }
    edit({flows:[...record.flows,...additions]});
    setStatus(String(additions.length)+" dated contributions added. Verify each payment against the provider statement before saving.");
  }
  const totalWithdrawn=periodFlows.filter(f=>f.kind==="withdrawal").reduce((n,f)=>n+f.amount,0);
  const totalAdded=periodFlows.filter(f=>f.kind==="contribution").reduce((n,f)=>n+f.amount,0);
  const lifetimeAdded=record.flows.filter(f=>f.kind==="contribution").reduce((n,f)=>n+f.amount,0);
  const lifetimeWithdrawn=record.flows.filter(f=>f.kind==="withdrawal").reduce((n,f)=>n+f.amount,0);
  const showCashTable=mode==="withdrawals";
  const reportWarnings=portfolioWarnings([record],start,end);
  const reportDisabledReason=!record.clientName.trim()||!record.policyName.trim()
    ?"Enter the client and policy names to prepare a PDF."
    :!record.investmentDate||!start||!end||start>=end||start<record.investmentDate
    ?"Select valid reporting dates from the original investment onwards."
    :!record.cashFlowsConfirmed
    ?"Confirm that the dated contributions and withdrawals are complete before preparing a client PDF."
    :reportWarnings.length>0
    ?"Resolve valuation and statement reconciliation warnings before generating a client report."
    :mode==="performance"&&!performance.available
    ?"Enter the opening and closing valuations to calculate actual performance."
    :null;
  const combinedWarnings=portfolioWarnings(selectedPolicies,start,end);
  const combinedDisabledReason=selectedPolicies.length<2
    ?"Select at least two saved policies for the same client and group."
    :selectedPolicies.some(p=>!p.cashFlowsConfirmed)
    ?"Confirm the dated cash flows for each selected policy."
    :!combined.available
    ?combined.reason
    :combinedWarnings.length>0
    ?"Resolve policy reconciliation warnings before preparing the combined PDF."
    :null;
  function applyPastedRows(){
    if(!pasteMode)return;
    if(pasteMode==="cash"){
      const parsed=parseCashFlowTable(pasteSource,record.funds);
      if(parsed.errors.length){setStatus(parsed.errors.slice(0,5).join(" ")+" No rows were imported.");return;}
      if(!parsed.rows.length){setStatus("No transactions were found. Check the source table and headings.");return;}
      if(record.flows.length+parsed.rows.length>2000){setStatus("A policy supports at most 2,000 dated cash flows.");return;}
      if(record.investmentDate&&parsed.rows.some(row=>row.date<record.investmentDate)){
        setStatus("Pasted cash flows cannot predate the original investment.");return;
      }
      edit({flows:[...record.flows,...parsed.rows.map(row=>({...row,id:uid()}))]});
      setPasteMode(null);setPasteSource("");
      setStatus(String(parsed.rows.length)+" dated transactions added to the draft. Review and save the record.");
      return;
    }
    const parsed=pasteMode==="matrix"?
      parseValuationMatrix(pasteSource,record.funds):parseValuationTable(pasteSource,record.funds);
    if(parsed.errors.length){setStatus(parsed.errors.slice(0,5).join(" ")+" No rows were imported.");return;}
    if(!parsed.rows.length){setStatus("No dated valuations were found.");return;}
    const keys=new Set(record.valuations.map(v=>v.date+":"+(v.fundId??"policy")));
    if(parsed.rows.some(row=>keys.has(row.date+":"+(row.fundId??"policy")))){
      setStatus("A valuation with the same date and holding already exists. No rows were imported.");return;
    }
    if(record.valuations.length+parsed.rows.length>2000){setStatus("A policy supports at most 2,000 valuations.");return;}
    edit({valuations:[...record.valuations,...parsed.rows.map(row=>({...row,id:uid()}))]});
    setPasteMode(null);setPasteSource("");
    setStatus(String(parsed.rows.length)+" dated valuations added to the draft. Review and save the record.");
  }
  return <section className="omega-v2-workspace">
    <div className="page-heading"><div>
      <span className="eyebrow">{showCashTable?"CASH FLOW RECORDS":"ACTUAL INVESTMENT PERFORMANCE"}</span>
      <h1>{showCashTable?"Withdrawals & contributions":"Investment performance"}</h1>
      <p>{showCashTable?"Record dated pension withdrawals and additional investments.":"Calculate cumulative, cash-flow-adjusted growth using actual dated values."}</p>
    </div></div>
    <div className="omega-v2-toolbar panel padded">
      <label className="omega-v2-field"><span>Saved policy</span>
        <select className="form-input" value={record.id||""} onChange={e=>openCase(e.target.value)}>
          <option value="">New / unsaved policy</option>
          {saved.map(r=><option key={r.id} value={r.id}>{r.clientName+" · "+r.policyName}</option>)}
        </select>
      </label>
      <button className="btn quiet" onClick={newCase} type="button"><Plus size={16}/> New policy</button>
      <button className="btn primary" disabled={saving} onClick={save} type="button"><Save size={16}/>{saving?"Saving…":"Save policy"}</button>
      <a className="btn quiet" href="#omega-pdf-viewer"><FileText size={16}/> Go to PDF preview</a>
    </div>
    {(loading||status)&&<p role="status" className="omega-v2-status">{loading?"Loading policies…":status}</p>}

    <div className="panel padded omega-v2-section">
      <span className="eyebrow">01 · POLICY DETAILS</span>
      <div className="omega-v2-fields">
        <label className="omega-v2-field"><span>Client name</span><input className="form-input" maxLength={120} value={record.clientName} onChange={e=>edit({clientName:e.target.value})}/></label>
        <label className="omega-v2-field"><span>Policy name</span><input className="form-input" maxLength={120} placeholder="e.g. Retirement portfolio" value={record.policyName} onChange={e=>edit({policyName:e.target.value})}/></label>
        <label className="omega-v2-field"><span>Client portfolio group (optional)</span><input className="form-input" maxLength={120} placeholder="e.g. Retirement Portfolio" value={record.portfolioGroup??""} onChange={e=>edit({portfolioGroup:e.target.value})}/></label>
        <label className="omega-v2-field"><span>Portfolio type</span><select className="form-input" value={record.policyType} onChange={e=>edit({policyType:e.target.value as InvestmentRecord["policyType"]})}>
          <option>Investment</option><option>Pension</option><option>Post-Retirement (ARF)</option>
        </select></label>
        <label className="omega-v2-field"><span>Provider</span><input className="form-input" maxLength={120} value={record.provider} onChange={e=>edit({provider:e.target.value})}/></label>
        <label className="omega-v2-field"><span>Policy number</span><input className="form-input" maxLength={80} value={record.policyNumber} onChange={e=>edit({policyNumber:e.target.value})}/></label>
        <label className="omega-v2-field"><span>Original investment date</span><input className="form-input" type="date" value={record.investmentDate} onChange={e=>{edit({investmentDate:e.target.value});if(!start)setStart(e.target.value);}}/></label>
        <label className="omega-v2-field"><span>Original investment (€)</span><Amount label="Original investment in euro" value={record.originalInvestment} onChange={n=>edit({originalInvestment:n??0})}/></label>
      </div>
      <div className="omega-v2-reconciliation">
        <h3>Provider statement control totals (optional)</h3>
        <p className="muted">The source valuation workbook lists total contributions and withdrawals, but not their individual dates. Use these totals to check the dated transactions entered below. They do not create cash flows automatically.</p>
        <div className="omega-v2-fields">
          <label className="omega-v2-field"><span>Statement as-of date</span><input className="form-input" type="date" value={record.statementAsOf??""} onChange={e=>edit({statementAsOf:e.target.value})}/></label>
          <label className="omega-v2-field"><span>Total contributions, including original (€)</span><Amount label="Statement total contributions" value={record.statementContributions??null} onChange={n=>edit({statementContributions:n})}/></label>
          <label className="omega-v2-field"><span>Total withdrawals (€)</span><Amount label="Statement total withdrawals" value={record.statementWithdrawals??null} onChange={n=>edit({statementWithdrawals:n})}/></label>
        </div>
        {statementChecks.map(c=><p key={c.label} className={c.matches?"fineprint":"notice neutral"}>
          {c.matches?"Reconciled: ":"Reconciliation needed: "}{c.label} · Provider {euro(c.expected)} · Entered {euro(c.entered)} · Difference {euro(c.difference)}
        </p>)}
      </div>
      <p className="fineprint">Enter the original investment only once. The investment-date opening value defaults to this amount unless an actual policy valuation is entered for that date. Additional deposits belong in the contribution table below.</p>
    </div>

    <div className="panel padded omega-v2-section">
      <div className="omega-v2-section-head"><div><span className="eyebrow">02 · FUND HOLDINGS</span><p className="muted">Optional fund-level breakdown; allocate cash flows to funds when available.</p></div>
        <button className="btn quiet" type="button" onClick={()=>edit({funds:[...record.funds,{id:uid(),name:"",initialAmount:null}]})}><Plus size={16}/> Add fund</button>
      </div>
      <div className="table-scroll"><table className="data-table omega-v2-table"><thead><tr><th>FUND NAME</th><th>ORIGINAL ALLOCATION (€)</th><th></th></tr></thead><tbody>
        {record.funds.map(f=><tr key={f.id}>
          <td><input className="form-input" aria-label="Fund name" value={f.name} maxLength={160} onChange={e=>changeFund(f.id,{name:e.target.value})}/></td>
          <td><Amount label={"Initial investment allocated to "+(f.name||"fund")} placeholder="Optional" value={f.initialAmount} onChange={n=>changeFund(f.id,{initialAmount:n})}/></td>
          <td><button className="omega-v2-icon" aria-label={"Remove fund "+f.name} type="button" onClick={()=>{
            if(record.valuations.some(v=>v.fundId===f.id)||record.flows.some(v=>v.fundId===f.id)){setStatus("Remove this fund's valuations and cash flows before removing the fund.");return;}
            edit({funds:record.funds.filter(x=>x.id!==f.id)});
          }}><Trash2 size={16}/></button></td>
        </tr>)}
        {!record.funds.length&&<tr><td colSpan={3}>Add each underlying fund for individual fund performance. Policy-only valuations are also supported.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="panel padded omega-v2-section">
      <div className="omega-v2-section-head"><div><span className="eyebrow">03 · DATED VALUATIONS</span>
        <p className="muted">Enter actual valuation dates from provider statements. Use policy total or individual fund values.</p></div>
        <div className="button-row">
          <button className="btn quiet" type="button" onClick={addValuation}><Plus size={16}/> Add valuation</button>
          <button className="btn quiet" type="button" onClick={()=>{setPasteMode("dates");setPasteSource("");}}><ClipboardPaste size={16}/> Paste dated rows</button>
          <button className="btn quiet" type="button" onClick={()=>{setPasteMode("matrix");setPasteSource("");}}><ClipboardPaste size={16}/> Paste Excel fund matrix</button>
        </div>
      </div>
      <div className="table-scroll"><table className="data-table omega-v2-table"><thead><tr><th>DATE</th><th>HOLDING</th><th>MARKET VALUE (€)</th><th></th></tr></thead><tbody>
        {record.valuations.map(v=><tr key={v.id}>
          <td><input className="form-input" aria-label="Valuation date" type="date" value={v.date} onChange={e=>changeValuation(v.id,{date:e.target.value})}/></td>
          <td><select className="form-input" aria-label="Valuation holding" value={v.fundId??"policy"} onChange={e=>changeValuation(v.id,{fundId:e.target.value==="policy"?null:e.target.value})}>
            <option value="policy">Whole policy</option>{record.funds.map(f=><option key={f.id} value={f.id}>{f.name||"Unnamed fund"}</option>)}
          </select></td>
          <td><Amount value={v.value} label="Market valuation in euro" onChange={n=>changeValuation(v.id,{value:n})}/></td>
          <td><button type="button" className="omega-v2-icon" aria-label="Remove valuation" onClick={()=>edit({valuations:record.valuations.filter(x=>x.id!==v.id)})}><Trash2 size={16}/></button></td>
        </tr>)}
        {!record.valuations.length&&<tr><td colSpan={4}>No valuations yet. Add the current valuation and any historical statements available.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="panel padded omega-v2-section">
      <div className="omega-v2-section-head"><div><span className="eyebrow">04 · CONTRIBUTIONS & WITHDRAWALS</span>
        <p className="muted">Cash flows must be dated to measure growth separately from invested and withdrawn money.</p></div>
        <div className="button-row"><button className="btn quiet" type="button" onClick={()=>addFlow("contribution")}><Plus size={16}/> Contribution</button>
          <button className="btn quiet" type="button" onClick={()=>addFlow("withdrawal")}><Plus size={16}/> Withdrawal</button>
          <button className="btn quiet" type="button" onClick={()=>{setPasteMode("cash");setPasteSource("");}}><ClipboardPaste size={16}/> Paste transactions</button></div>
      </div>
      <div className="table-scroll"><table className="data-table omega-v2-table"><thead><tr><th>DATE</th><th>TYPE</th><th>ALLOCATED TO</th><th>AMOUNT (€)</th><th>NOTES</th><th></th></tr></thead><tbody>
        {record.flows.map(f=><tr key={f.id}>
          <td><input className="form-input" aria-label="Cash flow date" type="date" value={f.date} onChange={e=>changeFlow(f.id,{date:e.target.value})}/></td>
          <td><select className="form-input" aria-label="Cash flow type" value={f.kind} onChange={e=>changeFlow(f.id,{kind:e.target.value as FlowEntry["kind"]})}>
            <option value="contribution">Contribution</option><option value="withdrawal">Withdrawal</option>
          </select></td>
          <td><select className="form-input" aria-label="Cash flow fund allocation" value={f.fundId??"policy"} onChange={e=>changeFlow(f.id,{fundId:e.target.value==="policy"?null:e.target.value})}>
            <option value="policy">Whole policy / unallocated</option>{record.funds.map(fund=><option key={fund.id} value={fund.id}>{fund.name||"Unnamed fund"}</option>)}
          </select></td>
          <td><Amount label="Cash flow amount in euro" value={f.amount} onChange={n=>changeFlow(f.id,{amount:n??0})}/></td>
          <td><input className="form-input" aria-label="Cash flow note" maxLength={250} value={f.note} onChange={e=>changeFlow(f.id,{note:e.target.value})}/></td>
          <td><button type="button" className="omega-v2-icon" aria-label="Remove transaction" onClick={()=>edit({flows:record.flows.filter(x=>x.id!==f.id)})}><Trash2 size={16}/></button></td>
        </tr>)}
        {!record.flows.length&&<tr><td colSpan={6}>No additional contributions or withdrawals recorded.</td></tr>}
      </tbody></table></div>
      <div className="omega-v2-recurring">
        <div><strong>Generate recurring pension contributions</strong><p className="muted">Create individually dated contributions for monthly or annual regular premiums.</p></div>
        <label className="omega-v2-field"><span>First date</span><input className="form-input" type="date" value={repeatDate} onChange={e=>setRepeatDate(e.target.value)}/></label>
        <label className="omega-v2-field"><span>Frequency</span><select className="form-input" value={repeatCadence} onChange={e=>setRepeatCadence(e.target.value as "monthly"|"annually")}><option value="monthly">Monthly</option><option value="annually">Annual</option></select></label>
        <label className="omega-v2-field"><span>Number</span><input className="form-input" type="number" min={1} max={240} value={repeatCount} onChange={e=>setRepeatCount(Number(e.target.value))}/></label>
        <label className="omega-v2-field"><span>Amount (€)</span><Amount label="Recurring contribution amount" value={repeatAmount} onChange={setRepeatAmount}/></label>
        <label className="omega-v2-field"><span>Holding</span><select className="form-input" value={repeatFund} onChange={e=>setRepeatFund(e.target.value)}>
          <option value="policy">Whole policy</option>{record.funds.map(f=><option key={f.id} value={f.id}>{f.name||"Unnamed fund"}</option>)}
        </select></label>
        <button className="btn quiet" type="button" onClick={addRecurring}><Plus size={15}/> Add schedule</button>
      </div>
      <label className="omega-v2-confirmation">
        <input type="checkbox" checked={record.cashFlowsConfirmed===true}
          onChange={e=>edit({cashFlowsConfirmed:e.target.checked})}/>
        <span><strong>Confirm complete dated cash flows</strong>
          <small>I have checked all actual additional contributions and withdrawals against the available provider statements for this policy. Future planned payments are excluded. This confirmation is required to export a client PDF, but not to save a draft.</small></span>
      </label>
    </div>

    <div className="panel padded omega-v2-section">
      <span className="eyebrow">05 · REPORTING PERIOD</span>
      <div className="omega-v2-fields omega-v2-short">
        <label className="omega-v2-field"><span>From (inclusive valuation)</span><input className="form-input" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label className="omega-v2-field"><span>To (inclusive valuation)</span><input className="form-input" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      </div>
      <p className="fineprint">Choose any dates, provided the opening and closing values are known. Additional contributions and withdrawals dated after the opening valuation and through the closing valuation are included. No values are interpolated.</p>
    </div>

    <div className="panel padded omega-v2-section">
      <div className="omega-v2-section-head"><div><span className="eyebrow">06 · {showCashTable?"CASH FLOW SUMMARY":"PERFORMANCE SUMMARY"}</span>
        <h2>{showCashTable?"Withdrawals statement":"Investment performance report"}</h2></div>
        <a className="btn primary" href="#omega-pdf-viewer"><FileText size={16}/> Preview and download PDF</a>
      </div>
      <div className="omega-v2-metrics">
        <Metric label="Original investment" value={euro(record.originalInvestment)}/>
        <Metric label="Lifetime contributions" value={euro(record.originalInvestment+lifetimeAdded)}/>
        <Metric label="Lifetime withdrawals" value={euro(lifetimeWithdrawn)}/>
        <Metric label="Net invested capital" value={euro(record.originalInvestment+lifetimeAdded-lifetimeWithdrawn)}/>
        <Metric label="Period opening value" value={euro(performance.openingValue)}/>
        <Metric label="Current / closing value" value={euro(performance.closingValue)}/>
        <Metric label="Additional contributions" value={euro(totalAdded)}/>
        <Metric label="Withdrawals" value={euro(totalWithdrawn)}/>
        <Metric label="Euro gain / loss" value={euro(performance.gain)}/>
        <Metric label="Cumulative return · Modified Dietz" value={pct(performance.cumulativeReturnPct)} detail="Not annualised"/>
      </div>
      {!record.cashFlowsConfirmed&&<p className="notice neutral" role="status">Draft calculation only. Confirm that all actual dated contributions and withdrawals have been entered before exporting a client report.</p>}
      {!performance.available&&<p className="notice neutral" role="status">Return unavailable: {performance.reason}</p>}
      {notes.map((n,i)=><p key={i} className="notice neutral">{n}</p>)}
      {!showCashTable&&<><h3>Recorded portfolio value history</h3><ValuationChart record={record} start={start} end={end}/>
        <h3>Fund-level cumulative performance</h3>
        <div className="table-scroll"><table className="data-table omega-v2-table"><thead><tr><th>FUND</th><th>OPENING VALUE</th><th>CLOSING VALUE</th><th>EURO GAIN / LOSS</th><th>CUMULATIVE RETURN</th></tr></thead>
          <tbody>{funds.map(({fund,result})=><tr key={fund.id}>
            <td><b>{fund.name||"Unnamed fund"}</b></td><td>{euro(result.openingValue)}</td><td>{euro(result.closingValue)}</td><td>{euro(result.gain)}</td>
            <td title={result.reason||"Modified Dietz return"}>{pct(result.cumulativeReturnPct)}{!result.available&&<small className="omega-v2-cell-note"> {result.reason}</small>}</td>
          </tr>)}
          {!funds.length&&<tr><td colSpan={5}>Add funds and dated values to calculate individual fund performance.</td></tr>}
          </tbody></table></div>
      </>}
      {showCashTable&&<><h3>Transactions in the reporting period</h3>
        <div className="table-scroll"><table className="data-table omega-v2-table"><thead><tr><th>DATE</th><th>TYPE</th><th>HOLDING</th><th>AMOUNT (€)</th><th>DETAILS</th></tr></thead><tbody>
          {periodFlows.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(f=><tr key={f.id}>
            <td>{f.date}</td><td>{f.kind==="contribution"?"Contribution":"Withdrawal"}</td>
            <td>{record.funds.find(x=>x.id===f.fundId)?.name||"Policy"}</td><td>{euro(f.amount)}</td><td>{f.note||"—"}</td>
          </tr>)}
          {!periodFlows.length&&<tr><td colSpan={5}>No transactions in this reporting period.</td></tr>}
        </tbody></table></div>
      </>}
      <p className="fineprint">Methodology: cumulative Modified Dietz return measures investment gain after adjusting for dated external cash flows and the capital invested for the remaining portion of the period. Not a time-weighted return or annualised figure. Assumes flows occur at the close of their entered date. Reported valuation accuracy, fees, tax treatment and transaction dates must be checked against provider statements before client use.</p>
    </div>

    <ActualReportPdfViewer key={mode}
      id="omega-pdf-viewer"
      title={showCashTable?"Withdrawals PDF preview":"Performance PDF preview"}
      description={showCashTable
        ?"Review the dated contributions and withdrawals statement before downloading the same A4 PDF."
        :"Review actual cumulative, cash-flow-adjusted performance before downloading the same A4 PDF."}
      filename={showCashTable?"Omega-Withdrawals-Statement.pdf":"Omega-Investment-Performance.pdf"}
      request={{record,startDate:start,endDate:end,reportType:mode}}
      disabledReason={reportDisabledReason}/>

    {portfolioCandidates.length>=2&&<div className="panel padded omega-v2-section">
      <span className="eyebrow">07 · COMBINED CLIENT PORTFOLIO</span>
      <h2>Combined policy performance</h2>
      <p className="muted">Select two or more saved policies for the same client and portfolio group. All must have valid valuations at the selected reporting dates. This calculates from combined cash flows and capital, not an average of percentage returns.</p>
      <div className="omega-v2-policy-grid">
        {portfolioCandidates.map(p=><label key={p.id} className="omega-v2-policy-checkbox">
          <input type="checkbox" checked={includedPolicyIds.includes(p.id!)}
            onChange={e=>setIncludedPolicyIds(current=>e.target.checked?[...current,p.id!]:current.filter(id=>id!==p.id))}/>
          <span><strong>{p.policyName}</strong><small>{p.provider||"Provider not entered"} · {p.policyType}</small></span>
        </label>)}
      </div>
      {selectedPolicies.length>=2&&<>
        <div className="omega-v2-metrics">
          <Metric label="Combined opening valuation" value={euro(combined.openingValue)}/>
          <Metric label="Combined closing valuation" value={euro(combined.closingValue)}/>
          <Metric label="Combined contributions" value={euro(combined.contributions)}/>
          <Metric label="Combined withdrawals" value={euro(combined.withdrawals)}/>
          <Metric label="Combined euro gain / loss" value={euro(combined.gain)}/>
          <Metric label="Combined cumulative return" value={pct(combined.cumulativeReturnPct)} detail="Modified Dietz · not annualised"/>
        </div>
        {!combined.available&&<p className="notice neutral">{combined.reason}</p>}
        {portfolioWarnings(selectedPolicies,start,end).map((w,i)=><p key={i} className="notice neutral">{w}</p>)}
        <div className="table-scroll"><table className="data-table omega-v2-table">
          <thead><tr><th>POLICY</th><th>OPENING VALUE</th><th>CLOSING VALUE</th><th>EURO GAIN / LOSS</th><th>CUMULATIVE RETURN</th></tr></thead>
          <tbody>{combined.policyResults.map(({record:p,performance:v},i)=><tr key={p.id??i}>
            <td>{p.policyName}</td><td>{euro(v.openingValue)}</td><td>{euro(v.closingValue)}</td><td>{euro(v.gain)}</td><td>{pct(v.cumulativeReturnPct)}</td>
          </tr>)}</tbody>
        </table></div>
        <ActualReportPdfViewer
          id="omega-combined-pdf-viewer"
          title="Combined portfolio PDF preview"
          description="Review all selected policies, cumulative results and dated cash flows before downloading."
          filename="Omega-Combined-Portfolio-Performance.pdf"
          request={{records:selectedPolicies,startDate:start,endDate:end,reportType:"portfolio"}}
          disabledReason={combinedDisabledReason}/>
      </>}
    </div>}

    {pasteMode&&<div className="panel padded omega-v2-section omega-v2-paste" role="dialog" aria-modal="true" aria-label="Paste financial table" onKeyDown={e=>{if(e.key==="Escape"){setPasteMode(null);setPasteSource("");}}}>
      <h2>{pasteMode==="matrix"?"Paste dated fund valuation matrix":pasteMode==="cash"?"Paste dated transactions":"Paste dated valuations"}</h2>
      <p className="muted">{pasteMode==="matrix"?
        "Copy a rectangle from Excel starting with Fund Invested, Value @ DD/MM/YYYY, Value @ DD/MM/YYYY. Fund names must already exist in Fund Holdings. Blank cells stay missing.":
        pasteMode==="cash"?
        "Paste tab-separated columns: Date, Type, Holding, Amount, Notes. Use Contribution or Withdrawal. Holding may be Policy or an existing fund name.":
        "Paste tab-separated Date, Holding, Market value. Holding may be Policy or an existing fund name. Two-column Date, Value is also supported."}</p>
      <textarea className="form-input textarea omega-v2-paste-area" rows={8} spellCheck={false}
        aria-label="Paste spreadsheet cells" value={pasteSource} onChange={e=>setPasteSource(e.target.value)}
        placeholder={pasteMode==="matrix"?"Fund Invested\tValue @ 29/03/2022\tValue @ 26/11/2026":
          pasteMode==="cash"?"Date\tType\tHolding\tAmount\tNotes":"Date\tHolding\tMarket value"}/>
      {status&&<p role="status" className="omega-v2-status">{status}</p>}
      <div className="button-row">
        <button className="btn primary" type="button" onClick={applyPastedRows}>Validate and add rows</button>
        <button className="btn quiet" type="button" onClick={()=>{setPasteMode(null);setPasteSource("");}}>Cancel</button>
      </div>
    </div>}
  </section>;
}
