"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowRight, BookOpen, ChevronDown, Database,
  FileText, LogOut,
  Menu, Plus, Search, ShieldAlert, SlidersHorizontal, UploadCloud, X, TrendingUp, ArrowDownCircle
} from "lucide-react";
import OmegaLogo from "@/components/omega-logo";
import SecureFundUploads from "@/components/secure-fund-uploads";
import PerformanceWorkspace from "@/components/performance-workspace";
import ProposalPdfViewer from "@/components/proposal-pdf-viewer";
import FundPriceHistoryChart from "@/components/fund-price-history-chart";
import { APPROVED_FUND_GROUPS, type ApprovedFund } from "@/lib/approved-funds";
import type { Portfolio } from "@/lib/types";
import { fmtEuro } from "@/lib/analytics";
import {allocateInvestment,allocationBasisPoints,displayAllocationTotal,
  isAllocationComplete,remainingAllocationPct,validInvestmentAmount,
  weightBasisPoints} from "@/lib/allocation-precision";
import {weightedPublishedPortfolioReturn,type WeightedPublishedReturn} from "@/lib/reconciliation/portfolio-performance";
import {getFundRiskRating,riskRatingLabel,RISK_RATING_CAVEAT} from "@/lib/fund-risk-ratings";

type View = "funds" | "imports" | "builder" | "compare" | "proposal" | "performance" | "withdrawals";
const NAV: { key: View; label: string; icon: typeof Database }[] = [
  { key: "funds", label: "Fund library", icon: Database },
  { key: "imports", label: "Fund uploads", icon: UploadCloud },
  { key: "builder", label: "Portfolio builder", icon: SlidersHorizontal },
  { key: "compare", label: "Compare portfolios", icon: BookOpen },
  { key: "proposal", label: "Client proposal", icon: FileText },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "withdrawals", label: "Withdrawals", icon: ArrowDownCircle },
];

const INITIAL_PORTFOLIOS: Portfolio[] = [
  { id: "a", title: "Portfolio A", description: "Draft investment strategy", weights: {} },
  { id: "b", title: "Portfolio B", description: "Alternative strategy", weights: {} },
  { id: "c", title: "Portfolio C", description: "Alternative strategy", weights: {} },
];

type ReconciledFund = {
  fund_id:string; status:string; confidence:number;selected_source_name:string|null;
  reported_returns:Record<string,number|null>|null;returns_approved:boolean;
  evidence?:{factsheetIdentityApproved?:boolean;seriesIdentityApproved?:boolean;
    displayedReturnsSource?:string|null;matchBasis?:string;pdfContentsIndependentlyVerified?:boolean;publishedPerformance?:{asOf?:string|null;feeBasis?:string;asOfPrecision?:string}|null};
  factsheet_import_id:string|null;
  reason:string;
  extracted_factsheet:{
    title?:string;moneyMateId?:string|null;asOf?:string|null;launchDate?:string|null;
    baseCurrency?:string|null;objective?:string|null;strategy?:string|null;
    amcPct?:number|null;civPct?:number|null;riskRating?:number|null;
    holdings?:{name:string;percentage:number}[];
    allocations?:{name:string;percentage:number}[];
    chartReferences?:{page:number;label:string}[];
    extractionWarnings?:string[];
    performance?:{source:string;status:string;asOf:string|null;
      feeBasis:string;asOfPrecision:string;
      returns:Record<string,number|null>;notes:string[]}|null;
  }|null;
};
const formatReported=(value:number|null|undefined)=>value==null?"—":(value>0?"+":"")+value.toFixed(2)+"%";
const workbookReturns = (fund:ReconciledFund|undefined)=>
  fund?.evidence?.displayedReturnsSource==="uploaded_workbook"?
    fund.reported_returns:null;
function displayWeightedReturn(value:WeightedPublishedReturn,compact=false):string{
  if(value.status==="available")return formatReported(value.returnPct);
  if(compact)return "—";
  if(value.status==="empty")return "No funds selected";
  if(value.status==="incomplete")return "Incomplete allocation";
  if(value.status==="incompatible")return "Incompatible sources";
  return "Insufficient data ("+value.covered+"/"+value.selected+" funds)";
}
const prettyFeeBasis=(value:string|undefined)=>({
  gross_of_amc:"Gross of AMC",net_of_amc:"Net of AMC",
  net_of_ter:"Net of fund TER",before_full_policy_amc:"Before full policy AMC",
  not_stated:"Not stated"
}[value??""]??"Not stated");
const PROVIDERS = Object.keys(APPROVED_FUND_GROUPS);
const isValidWeight = (weight: number) => weightBasisPoints(weight)!==null;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

/** Maintain a typed suffix such as 40. or 40.80 while updating
 * the numeric calculation immediately; reject more than two decimals. */
function DecimalInput({value,onChange,max,className,id,label}:{
  value:number;onChange:(n:number)=>void;max:number;
  className:string;id?:string;label?:string;
}){
  const [draft,setDraft]=useState(value.toFixed(2));
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setDraft(value.toFixed(2));},[value,focused]);
  return <input type="text" inputMode="decimal" autoComplete="off"
    className={className} id={id} aria-label={label}
    value={draft} onFocus={()=>setFocused(true)}
    onChange={event=>{
      const next=event.target.value.replace(/,/g,"");
      if(!/^\d*(?:\.\d{0,2})?$/.test(next))return;
      const number=Number(next);
      if(!Number.isFinite(number)||number>max)return;
      setDraft(next);
      onChange(number);
    }}
    onBlur={()=>{setFocused(false);setDraft(value.toFixed(2));}}/>;
}
function MoneyInput({value,onChange}:{value:number;onChange:(v:number)=>void}){
  return <DecimalInput id="capital" className="form-input" label="Amount"
    value={value} onChange={onChange} max={1000000000}/>;
}

export default function Workspace() {
  const [view, setView] = useState<View>("funds");
  const [funds,setFunds]=useState<ApprovedFund[]>([]);
  const names=useMemo(()=>new Map(funds.map(f=>[f.id,f.name])),[funds]);
  const [mobile, setMobile] = useState(false);
  const [published,setPublished] = useState<Record<string,ReconciledFund>>({});
  useEffect(()=>{
    if(!["funds","builder","compare","proposal"].includes(view))return;
    let active=true;
    fetch("/api/fund-reconciliation",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>{if(!response.ok)return null;return response.json() as Promise<{reviews?:ReconciledFund[];funds?:ApprovedFund[]}>})
      .then(data=>{if(active&&data?.reviews){
        setPublished(Object.fromEntries(data.reviews.map(row=>[row.fund_id,row])));
        if(Array.isArray(data.funds))setFunds(data.funds);
      }}).catch(()=>{});
    return ()=>{active=false};
  },[view]);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("All providers");
  const [selectedFund, setSelectedFund] = useState<ApprovedFund | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(INITIAL_PORTFOLIOS);
  const comparisonReturns=useMemo(()=>portfolios.map(portfolio=>({
    id:portfolio.id,
    threeYear:weightedPublishedPortfolioReturn(portfolio,published,"threeYear"),
    fiveYear:weightedPublishedPortfolioReturn(portfolio,published,"fiveYear"),
    tenYear:weightedPublishedPortfolioReturn(portfolio,published,"tenYear")
  })),[portfolios,published]);
  const [activePortfolio, setActivePortfolio] = useState(0);
  const [addFundId, setAddFundId] = useState("");
  useEffect(()=>{
    if(!funds.some(f=>f.id===addFundId))setAddFundId(funds[0]?.id??"");
  },[funds,addFundId]);
  const [investment, setInvestment] = useState(490000);
  const [proposalTitle,setProposalTitle]=useState("Investment bond proposal");
  const [client, setClient] = useState("");
  const [adviser, setAdviser] = useState("Omega Financial Management");
  const [objective, setObjective] = useState("Review diversified investment options in line with the client's objectives and risk profile.");
  const [includePortfolios,setIncludePortfolios]=useState<Record<string,boolean>>({a:true,b:true,c:true});

  const filtered = useMemo(() => funds.filter(f =>
    (provider === "All providers" || f.provider === provider) &&
    (f.name + " " + f.provider).toLowerCase().includes(search.trim().toLowerCase())
  ), [funds, provider, search]);

  const current = portfolios[activePortfolio];
  const allocated = Object.entries(current.weights)
    .filter(([, percentage]) => percentage > 0)
    .map(([id, percentage]) => ({ fund: funds.find(f => f.id === id), percentage }))
    .filter((v): v is { fund: ApprovedFund; percentage: number } => Boolean(v.fund));

  function go(next: View) { setView(next); setMobile(false); }
  function changePortfolio(index: number, changes: Partial<Portfolio>) {
    setPortfolios(current => current.map((p, i) => i === index ? { ...p, ...changes } : p));
  }
  function setWeight(fundId: string, percentage: number) {
    if (!isValidWeight(percentage)) return;
    changePortfolio(activePortfolio, { weights: { ...current.weights, [fundId]: percentage } });
  }
  function addFund() {
    if (!funds.some(f => f.id === addFundId)) return;
    changePortfolio(activePortfolio, { weights: { ...current.weights, [addFundId]: current.weights[addFundId] ?? 0 } });
  }
  function removeFund(id: string) {
    const weights = { ...current.weights }; delete weights[id]; changePortfolio(activePortfolio, { weights });
  }
  const allocationAmounts=isAllocationComplete(current.weights)&&
    validInvestmentAmount(investment)?allocateInvestment(investment,current.weights):null;
  const linked=(fund:ReconciledFund|undefined)=>
    Boolean(fund?.evidence?.matchBasis==="unique_provider_qualified_filename" &&
      fund?.factsheet_import_id && fund?.evidence?.displayedReturnsSource==="uploaded_workbook");
  const proposalPortfolios=portfolios.filter(p=>
    includePortfolios[p.id] && Object.entries(p.weights).some(([,weight])=>weight>0));
  const invalidProposal=proposalPortfolios.find(p=>!isAllocationComplete(p.weights));
  const unlinkedProposal=proposalPortfolios.find(p=>
    Object.entries(p.weights).some(([id,weight])=>weight>0&&!linked(published[id])));
  const readyForProposal=proposalPortfolios.length>0&&
    validInvestmentAmount(investment)&&!!adviser.trim()&&!!objective.trim()&&
    !invalidProposal&&!unlinkedProposal;
  const pdfBlockReason=proposalPortfolios.length===0?
    "Select a portfolio containing at least one fund.":
    invalidProposal?
      invalidProposal.title+" totals "+displayAllocationTotal(invalidProposal.weights)+
      ". Adjust the allocations to exactly 100.00% before exporting.":
    unlinkedProposal?
      unlinkedProposal.title+" has a fund without an approved current workbook return or linked PDF.":
    !validInvestmentAmount(investment)?
      "Enter a positive amount with no more than two decimal places.":
    !adviser.trim()||!objective.trim()?
      "Complete the Prepared by and Objective fields before exporting.":"";


  return <div className="app-shell">
    <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
      <div className="sidebar-brand">
        <OmegaLogo variant="dark" width={177}/>
        <button className="sidebar-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={18}/></button>
      </div>
      <div className="sidebar-group-label">WORKSPACE</div>
      <nav className="nav-list">{NAV.map(item =>
        <button key={item.key} className={"nav-link " + (view === item.key ? "selected" : "")}
          onClick={() => go(item.key)}><item.icon size={18}/>{item.label}</button>
      )}</nav>
      <div className="sidebar-bottom">
        <p className="side-footer">OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</p>
      </div>
    </aside>
    {mobile && <div className="mobile-backdrop" onClick={() => setMobile(false)}/>}
    <div className="main-area">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={22}/></button>
        <span className="crumb">OMEGA <span>/</span> BOND PROPOSALS <span>/</span> <b>{NAV.find(n => n.key === view)?.label}</b></span>
        <div className="topbar-right"><span className="status-dot"/>
          <span className="desktop-only">Approved fund universe</span>
          <span className="avatar">OF</span>
          <button className="app-signout" type="button" title="Sign out" onClick={() => signOut({ redirectTo: "/login" })}>
            <LogOut size={16}/><span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="content">
        {view === "funds" && <>
          <div className="page-heading"><div><span className="eyebrow">CONTROLLED FUND LIBRARY</span><h1>Fund library</h1>
            <p>{funds.length} Omega-selected funds. The corrected workbook controls fund display names and percentage returns; new PDFs are linked as supporting evidence.</p></div>
            <button className="btn primary" onClick={() => go("imports")}><UploadCloud size={16}/> View source documents</button>
          </div>
          <div className="panel">
            <div className="filter-row">
              <label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search approved funds…"/></label>
              <label className="select-wrap"><select aria-label="Filter by provider" value={provider} onChange={e=>setProvider(e.target.value)}>
                <option>All providers</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}
              </select><ChevronDown size={15}/></label>
            </div>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>FUND</th><th>PROVIDER</th><th>RISK (1–7)</th><th>1 YEAR*</th><th>3 YEARS CUM.*</th><th>5 YEARS CUM.*</th><th>10 YEARS CUM.*</th><th>PERFORMANCE SOURCE</th><th></th></tr></thead>
              <tbody>{filtered.map(f=><tr key={f.id}>
                <td><b>{f.name}</b></td><td>{f.provider}</td>
                <td>{riskRatingLabel(f)}</td>
                <td>{formatReported(workbookReturns(published[f.id])?.oneYear)}</td>
                <td>{formatReported(workbookReturns(published[f.id])?.threeYear)}</td>
                <td>{formatReported(workbookReturns(published[f.id])?.fiveYear)}</td>
                <td>{formatReported(workbookReturns(published[f.id])?.tenYear)}</td>
                <td><span className="soft-pill">{workbookReturns(published[f.id])?
  "Workbook returns + PDF filename linked":
  published[f.id]?.status==="manual_rejected"?"Rejected · review required":
  published[f.id]?.extracted_factsheet?.performance?.status==="not_published"?"Workbook value unavailable":
  "Filename not linked"}</span></td>
                <td><button className="icon-action" aria-label={"View " + f.name} onClick={()=>setSelectedFund(f)}><ArrowRight size={17}/></button></td>
              </tr>)}</tbody>
            </table>{filtered.length===0 && <div className="empty">No matching funds found.</div>}</div>
          </div>
          <p className="fineprint">{RISK_RATING_CAVEAT} {filtered.length} of {funds.length} approved funds displayed. Unselected funds in the source workbook are intentionally excluded. * Returns come only from the newly uploaded performance workbook, not from older PDFs. All displayed periods, including 3-, 5- and 10-year returns, are cumulative percentages, as confirmed for the workbook; they are not annualised. Reporting dates and charges must still be verified before client use. Differences in reporting dates and charges must be considered; these figures are not yet approved for client proposals.</p>
        </>}

        {view === "imports" && <SecureFundUploads/>}

        {(view === "performance" || view === "withdrawals") &&
          <PerformanceWorkspace mode={view}/>}

        {view === "builder" && <>
          <div className="page-heading"><div><span className="eyebrow">PORTFOLIO CONSTRUCTION</span><h1>Portfolio builder</h1>
</div>
            <button className="btn primary" onClick={()=>go("compare")}>Compare allocations <ArrowRight size={16}/></button>
          </div>
          <div className="portfolio-tabs">{portfolios.map((p,i)=><button key={p.id} className={i===activePortfolio?"active":""} onClick={()=>setActivePortfolio(i)}>
            <span className="tab-letter">{p.id.toUpperCase()}</span>{p.title}
          </button>)}</div>
          <div className="two-col builder-grid">
            <section className="panel padded">
              <span className="eyebrow">PORTFOLIO DETAILS</span>
              <label className="form-label" htmlFor="ptitle">Portfolio name</label>
              <input className="form-input" id="ptitle" maxLength={80} value={current.title} onChange={e=>changePortfolio(activePortfolio,{title:e.target.value})}/>
              <label className="form-label" htmlFor="pdesc">Strategy description</label>
              <textarea className="form-input textarea" id="pdesc" rows={2} maxLength={250} value={current.description}
                onChange={e=>changePortfolio(activePortfolio,{description:e.target.value})}/>
              <label className="form-label" htmlFor="capital">Amount</label>
              <MoneyInput value={investment} onChange={setInvestment}/>
              <div className="allocation-heading"><h2>Fund allocations</h2>
                <span className={isAllocationComplete(current.weights)?"allocation-ok":"allocation-error"}>
                  {displayAllocationTotal(current.weights)} allocated
                </span>
              </div>
              <label className="form-label" htmlFor="addfund">Add an approved fund</label>
              <div className="button-row">
                <select className="form-input" style={{flex:1,minWidth:200}} id="addfund" value={addFundId} onChange={e=>setAddFundId(e.target.value)}>
                  {PROVIDERS.map(p=><optgroup key={p} label={p}>
                    {funds.filter(f=>f.provider===p).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </optgroup>)}
                </select>
                <button className="btn primary" type="button" onClick={addFund}><Plus size={15}/> Add</button>
              </div>
              {Object.keys(current.weights).length===0 && <div className="notice neutral">Select funds from the approved list to begin.</div>}
              {Object.entries(current.weights).map(([id,percentage])=>{
                const fund=funds.find(f=>f.id===id);
                if(!fund)return null;
                return <div className="allocation-row" key={id}>
                  <div><strong>{fund.name}</strong><small>{fund.provider} · Risk {riskRatingLabel(fund)}</small></div>
                  <div className="allocation-controls">
                    <DecimalInput className="weight-input" max={100}
                      label={"Allocation for "+fund.name} value={percentage}
                      onChange={value=>setWeight(id,value)}/>
                    <span>%</span>
                    <button type="button" className="icon-action" title={"Remove "+fund.name} onClick={()=>removeFund(id)}><X size={15}/></button>
                  </div>
                </div>;
              })}
              {allocated.length>0&&!isAllocationComplete(current.weights)&&
                allocationBasisPoints(current.weights)!==null&&
                <p className="fineprint">
                  {(() => {const remaining=remainingAllocationPct(current.weights)!;
                    return remaining>=0?
                      remaining.toFixed(2)+"% remaining to reach 100.00%.":
                      Math.abs(remaining).toFixed(2)+"% over 100.00%.";
                  })()}
                  {" "}PDF export requires an exact 100.00% total.
                </p>}

            </section>
            <section className="panel padded"><span className="eyebrow">PORTFOLIO SUMMARY</span><h2>{current.title}</h2>
              <div className="mini-stats">
                <Stat label="Initial investment" value={fmtEuro(investment)}/>
                <Stat label="Allocated funds" value={String(allocated.length)}/>
                <Stat label="Allocation total" value={displayAllocationTotal(current.weights)}/>
              </div>
              <div className="separator"/>
              <h3>Selected funds</h3>
              {allocated.length ? allocated.map(({fund,percentage})=>
                <div className="allocation-row" key={fund.id}>
                  <div><strong>{fund.name}</strong><small>{fund.provider}</small></div>
                  <b>{percentage.toFixed(2)}%
                    {allocationAmounts&&<small>{fmtEuro(allocationAmounts[fund.id]??0)}</small>}
                  </b>
                </div>
              ) : <p className="muted">No funds have a positive allocation.</p>}
              <p className="fineprint">Published return figures cannot be used until the corresponding share class, horizon basis and reporting date are confirmed.</p>
            </section>
          </div>
        </>}

        {view === "compare" && <>
          <div className="page-heading"><div><span className="eyebrow">PORTFOLIO COMPARISON</span><h1>Compare portfolios</h1>
            </div>
            <button className="btn quiet" onClick={()=>go("builder")}>Edit allocations <ArrowRight size={16}/></button>
          </div>
          <div className="portfolio-card-grid">{portfolios.map(p=>{
            const holdings=Object.entries(p.weights).filter(([id,v])=>v>0 && names.has(id));
            const valid=isAllocationComplete(p.weights);
            const comparison=comparisonReturns.find(item=>item.id===p.id)!;
            return <div className="portfolio-card" key={p.id}>
              <span className="eyebrow">PORTFOLIO {p.id.toUpperCase()}</span>
              <h2>{p.title}</h2><p>{p.description}</p>
              <div className="portfolio-card-value">{displayAllocationTotal(p.weights)}</div>
              <small>Allocation total {valid?"— complete":"— incomplete"}</small>
              <div className="portfolio-card-bottom"><span>Selected funds <b>{holdings.length}</b></span>
                <span>Indicative 5-year return <b title={displayWeightedReturn(comparison.fiveYear)}>{displayWeightedReturn(comparison.fiveYear,true)}</b></span></div>
            </div>;
          })}</div>
          <div className="panel table-panel">
            <div className="panel-heading"><div><span className="eyebrow">SIDE BY SIDE</span><h2>Allocation comparison</h2></div></div>
            <div className="table-scroll"><table className="data-table compare-table">
              <thead><tr><th>MEASURE</th>{portfolios.map(p=><th key={p.id}>{p.title}</th>)}</tr></thead>
              <tbody>
                <tr><td>Initial investment</td>{portfolios.map(p=><td key={p.id}>{fmtEuro(investment)}</td>)}</tr>
                <tr><td>Number of funds</td>{portfolios.map(p=><td key={p.id}>{Object.values(p.weights).filter(v=>v>0).length}</td>)}</tr>
                <tr><td>Allocation total</td>{portfolios.map(p=><td key={p.id}>{displayAllocationTotal(p.weights)}</td>)}</tr>
                <tr><td>3-year weighted return (indicative)</td>{comparisonReturns.map(p=><td key={p.id}>{displayWeightedReturn(p.threeYear)}</td>)}</tr>
                <tr><td>5-year weighted return (indicative)</td>{comparisonReturns.map(p=><td key={p.id}>{displayWeightedReturn(p.fiveYear)}</td>)}</tr>
                <tr><td>10-year weighted return (indicative)</td>{comparisonReturns.map(p=><td key={p.id}>{displayWeightedReturn(p.tenYear)}</td>)}</tr>
              </tbody>
            </table></div>
            <p className="fineprint padded-note">Displayed percentages are indicative allocation-weighted sums of fund-level cumulative returns from one workbook, not verified historical portfolio returns or unit-price performance. Each selected fund must report the full period. Reporting dates and fees have not been independently verified; additional charges, taxes and rebalancing are not modelled. Do not use these figures as approved client performance.</p>
          </div>
        </>}

        {view === "proposal" && <>
          <div className="page-heading"><div><span className="eyebrow">CLIENT DOCUMENTS</span><h1>{proposalTitle.trim()||"Investment bond proposal"}</h1>
            </div>
          </div>
          <section className="panel padded">
            <span className="eyebrow">PROPOSAL DETAILS</span>
            <label className="form-label" htmlFor="proposaltitle">Proposal title</label>
            <input id="proposaltitle" className="form-input" maxLength={120}
              value={proposalTitle} onChange={e=>setProposalTitle(e.target.value)}
              placeholder="Investment bond proposal"/>
            <label className="form-label" htmlFor="clientname">Client name</label>
            <input id="clientname" className="form-input" maxLength={120} value={client}
              placeholder="Client name (optional for internal drafts)" onChange={e=>setClient(e.target.value)}/>
            <label className="form-label" htmlFor="advisername">Prepared by</label>
            <input id="advisername" className="form-input" maxLength={120} value={adviser} onChange={e=>setAdviser(e.target.value)}/>
            <label className="form-label" htmlFor="objective">Objective</label>
            <textarea id="objective" className="form-input textarea" rows={2} maxLength={600} value={objective} onChange={e=>setObjective(e.target.value)}/>
            <label className="form-label" style={{marginTop:18}}>Portfolios to include</label>
            <div className="portfolio-card-grid">
              {portfolios.map(p=>{
                const weighted=Object.entries(p.weights).filter(([,v])=>v>0);
                const matched=weighted.filter(([id])=>linked(published[id])).length;
                return <label key={p.id} className="panel padded" style={{display:"block",cursor:"pointer"}}>
                  <span style={{display:"flex",gap:9,alignItems:"center"}}>
                    <input type="checkbox" checked={!!includePortfolios[p.id]}
                      onChange={e=>setIncludePortfolios(state=>({...state,[p.id]:e.target.checked}))}/>
                    <strong>{p.title}</strong>
                  </span>
                  <p className="muted">{weighted.length} funds · {displayAllocationTotal(p.weights)} allocated · {matched}/{weighted.length} PDF filenames linked</p>
                </label>;
              })}
            </div>
            <div className="button-row" style={{marginTop:14}}>
              <button className="btn quiet" type="button" onClick={()=>go("builder")}>
                <SlidersHorizontal size={16}/> Edit portfolio allocations
              </button>
            </div>
            {!readyForProposal&&<p className="notice neutral" role="status">{pdfBlockReason}</p>}
          </section>
          {!readyForProposal&&<section className="pdf-document-section omega-report-pdf" aria-label="Proposal A4 PDF preview">
            <div className="pdf-toolbar">
              <div className="pdf-toolbar-label"><FileText size={18} aria-hidden="true"/>
                <div><strong>Live A4 PDF preview</strong>
                  <span>The proposal preview and download will appear here when the portfolio is ready.</span>
                </div>
              </div>
            </div>
            <div className="omega-report-pdf-empty" role="status">
              <FileText size={30} aria-hidden="true"/>
              <strong>Complete the proposal to preview its PDF</strong>
              <span>{pdfBlockReason}</span>
            </div>
          </section>}
          {readyForProposal&&<ProposalPdfViewer input={{
            proposalTitle:proposalTitle.trim()||"Investment bond proposal",
            client,adviser,objective,investment,portfolios:proposalPortfolios
          }}/>}
        </>}
      </main>
    </div>
    {selectedFund && <div className="modal-overlay" onClick={()=>setSelectedFund(null)}>
      <div className="fund-modal" role="dialog" aria-modal="true" aria-label="Approved fund details" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={()=>setSelectedFund(null)}><X size={20}/></button>
        <span className="eyebrow">OMEGA-APPROVED FUND</span><h2>{selectedFund.name}</h2>
        <p className="muted">{selectedFund.provider}</p>
        <p><strong>Risk rating (1–7):</strong> {riskRatingLabel(selectedFund)}
          {getFundRiskRating(selectedFund)?.source&&
            <small> · {getFundRiskRating(selectedFund)!.source}</small>}
        </p>
        <p className="fineprint">{RISK_RATING_CAVEAT}</p>
        {published[selectedFund.id] ? <>
          <p><strong>Performance source:</strong> {workbookReturns(published[selectedFund.id])?"Current workbook + linked PDF":"PDF filename not linked"}</p>
          <p><strong>Workbook returns as of:</strong> {published[selectedFund.id].evidence?.publishedPerformance?.asOf??"Date not provided"} ·
            <strong> Fee treatment:</strong> {prettyFeeBasis(published[selectedFund.id].evidence?.publishedPerformance?.feeBasis)}</p>
          <p><strong>Source link:</strong> {linked(published[selectedFund.id])?"Workbook row and PDF filename matched":"PDF filename not linked"}.</p>
          <div className="mini-stats">
            <Stat label="1-year reported" value={formatReported(workbookReturns(published[selectedFund.id])?.oneYear)} />
            <Stat label="3-year cumulative" value={formatReported(workbookReturns(published[selectedFund.id])?.threeYear)} />
            <Stat label="5-year cumulative" value={formatReported(workbookReturns(published[selectedFund.id])?.fiveYear)} />
            <Stat label="10-year cumulative" value={formatReported(workbookReturns(published[selectedFund.id])?.tenYear)} />
          </div>
          <FundPriceHistoryChart fundId={selectedFund.id}/>
          {published[selectedFund.id].extracted_factsheet && <>
            <h3>Original provider factsheet — recorded source</h3>
            <p><strong>Fund title:</strong> {published[selectedFund.id].extracted_factsheet?.title??"Not extracted"}</p>
            <p><strong>MoneyMate ID:</strong> {published[selectedFund.id].extracted_factsheet?.moneyMateId??"N/A"} · <strong>Factsheet date:</strong> {published[selectedFund.id].extracted_factsheet?.asOf??"N/A"}</p>
            <p><strong>AMC:</strong> {formatReported(published[selectedFund.id].extracted_factsheet?.amcPct)} · <strong>CIV charge:</strong> {formatReported(published[selectedFund.id].extracted_factsheet?.civPct)}</p>
            {published[selectedFund.id].extracted_factsheet?.objective && <p><strong>Objective:</strong> {published[selectedFund.id].extracted_factsheet!.objective}</p>}
            {published[selectedFund.id].factsheet_import_id && <a target="_blank" rel="noopener noreferrer" href={"/api/fund-uploads/"+published[selectedFund.id].factsheet_import_id+"/download?view=1"}>View original factsheet and charts</a>}
          </>}
        </>:<div className="notice neutral"><ShieldAlert size={17}/> No matched current workbook return row and new PDF yet. Upload both sources, then run automatic matching.</div>}
        <button className="btn quiet" onClick={()=>setSelectedFund(null)}>Close details</button>
      </div>
    </div>}
  </div>;
}
