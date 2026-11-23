"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronDown, Database,
  FileText, FolderOpen, LayoutDashboard, LogOut,
  Menu, Plus, Search, ShieldAlert, SlidersHorizontal, UploadCloud, X
} from "lucide-react";
import OmegaLogo from "@/components/omega-logo";
import SecureFundUploads from "@/components/secure-fund-uploads";
import FundSourceAudit from "@/components/fund-source-audit";
import { APPROVED_FUND_GROUPS, type ApprovedFund } from "@/lib/approved-funds";
import type { Portfolio } from "@/lib/types";
import { fmtEuro, sumWeights } from "@/lib/analytics";

type View = "overview" | "funds" | "imports" | "builder" | "compare" | "proposal";
const NAV: { key: View; label: string; icon: typeof Database }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "funds", label: "Fund library", icon: Database },
  { key: "imports", label: "Fund uploads", icon: UploadCloud },
  { key: "builder", label: "Portfolio builder", icon: SlidersHorizontal },
  { key: "compare", label: "Compare portfolios", icon: BookOpen },
  { key: "proposal", label: "Client proposal", icon: FileText },
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
const prettyFeeBasis=(value:string|undefined)=>({
  gross_of_amc:"Gross of AMC",net_of_amc:"Net of AMC",
  net_of_ter:"Net of fund TER",before_full_policy_amc:"Before full policy AMC",
  not_stated:"Not stated"
}[value??""]??"Not stated");
const PROVIDERS = Object.keys(APPROVED_FUND_GROUPS);
const isValidWeight = (weight: number) => Number.isFinite(weight) && weight >= 0 && weight <= 100;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input className="form-input" type="number" min={1} max={1000000000} step={1000}
    value={value} onChange={event => onChange(Math.max(1, Math.min(1000000000, Number(event.target.value) || 1)))}/>;
}

export default function Workspace() {
  const [view, setView] = useState<View>("overview");
  const [funds,setFunds]=useState<ApprovedFund[]>([]);
  const names=useMemo(()=>new Map(funds.map(f=>[f.id,f.name])),[funds]);
  const [mobile, setMobile] = useState(false);
  const [published,setPublished] = useState<Record<string,ReconciledFund>>({});
  useEffect(()=>{
    if(!["funds","builder","overview","compare","proposal"].includes(view))return;
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
  const [activePortfolio, setActivePortfolio] = useState(0);
  const [addFundId, setAddFundId] = useState("");
  useEffect(()=>{
    if(!funds.some(f=>f.id===addFundId))setAddFundId(funds[0]?.id??"");
  },[funds,addFundId]);
  const [investment, setInvestment] = useState(490000);
  const [client, setClient] = useState("");
  const [adviser, setAdviser] = useState("Omega Financial Management");
  const [objective, setObjective] = useState("Review diversified investment options in line with the client's objectives and risk profile.");
  const [proposalBusy,setProposalBusy]=useState(false);
  const [proposalError,setProposalError]=useState("");
  const [proposalMessage,setProposalMessage]=useState("");
  const [includePortfolios,setIncludePortfolios]=useState<Record<string,boolean>>({a:true,b:true,c:true});

  const filtered = useMemo(() => funds.filter(f =>
    (provider === "All providers" || f.provider === provider) &&
    (f.name + " " + f.provider).toLowerCase().includes(search.trim().toLowerCase())
  ), [funds, provider, search]);

  const current = portfolios[activePortfolio];
  const total = sumWeights(current);
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
  const linked=(fund:ReconciledFund|undefined)=>
    Boolean(fund?.evidence?.matchBasis==="unique_provider_qualified_filename" &&
      fund?.factsheet_import_id && fund?.evidence?.displayedReturnsSource==="uploaded_workbook");
  const proposalPortfolios=portfolios.filter(p=>
    includePortfolios[p.id] && Object.entries(p.weights).some(([,weight])=>weight>0));
  const readyForProposal=proposalPortfolios.length>0 &&
    proposalPortfolios.every(p=>Math.abs(sumWeights(p)-100)<.005 &&
      Object.entries(p.weights).filter(([,weight])=>weight>0).every(([id])=>linked(published[id])));

  async function generateProposal(){
    setProposalError("");setProposalMessage("");
    if(!readyForProposal){
      setProposalError("Select a portfolio with 100% allocation and current workbook/PDF filename matches for every fund.");
      return;
    }
    setProposalBusy(true);
    try{
      const response=await fetch("/api/proposal/pdf",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client,adviser,objective,investment,portfolios:proposalPortfolios})
      });
      if(!response.ok){
        const data=await response.json().catch(()=>({error:"Proposal PDF export failed."}));
        throw new Error(data.error||"Proposal PDF export failed.");
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download="Omega-Investment-Bond-Proposal-Draft.pdf";
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      setProposalMessage("Proposal PDF created from the latest uploaded workbook and the linked PDF factsheet details.");
    }catch(error){
      setProposalError(error instanceof Error?error.message:"Proposal PDF export failed.");
    }finally{setProposalBusy(false);}
  }

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
        <div className="sidebar-help"><CheckCircle2 size={19}/><b>Approved fund shortlist</b>
          <p>{funds.length} selected funds. Published returns come from the latest uploaded workbook. Missing periods remain unavailable.</p>
        </div>
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
        <div className="notice neutral" style={{marginBottom:24}}>
          <ShieldAlert size={18}/><span><strong>Workbook-backed workflow.</strong> Fund names and cumulative returns come from the current workbook; exact PDF filenames link supporting documents. Investment advice, factsheet content, return-date and charge checks remain separate. No monthly price history is fabricated.</span>
        </div>

        {view === "overview" && <>
          <section className="page-heading hero-heading">
            <div><span className="eyebrow">OMEGA FUND UNIVERSE</span><h1>Your approved investment funds.</h1>
              <p>A controlled list of the funds Omega uses for bond proposals. Each fund will be linked to its factsheet and published performance figures following verification.</p>
              <div className="button-row">
                <button className="btn primary" onClick={() => go("funds")}><Database size={16}/> Explore funds</button>
                <button className="btn quiet" onClick={() => go("imports")}><UploadCloud size={16}/> Uploaded documents</button>
              </div>
            </div>
            <div className="hero-art"><span className="orbit orbit-a"/><span className="orbit orbit-b"/><span className="orbit orbit-c"/><span className="hero-initial">Ω</span></div>
          </section>
          <div className="stats-grid">
            <Stat label="Approved funds" value={String(funds.length)} sub="From the active workbook"/>
            <Stat label="Aviva" value={String(funds.filter(f=>f.provider==="Aviva").length)} sub="Fund shortlist"/>
            <Stat label="Zurich" value={String(funds.filter(f=>f.provider==="Zurich").length)} sub="Fund shortlist"/>
            <Stat label="New Ireland / Standard Life" value={funds.filter(f=>f.provider==="New Ireland").length+" / "+funds.filter(f=>f.provider==="Standard Life").length} sub="Fund shortlist"/>
          </div>
          <div className="two-col">
            <section className="panel padded"><span className="eyebrow">DATA QUALITY</span><h2>Source verification</h2>
              <p className="muted">Different providers and fund series use different document styles. Abbreviated names must be reconciled against the precise share class before returns are enabled.</p>
              <div className="notice neutral"><FolderOpen size={18}/> Original files remain available in private Vercel Blob. Source matching and approval are the next steps.</div>
            </section>
            <section className="panel action-panel"><span className="eyebrow">QUICK ACCESS</span><h2>Working with your fund list</h2>
              <button onClick={() => go("funds")}><span className="action-icon"><Database size={19}/></span><span><b>Fund library</b><small>All {funds.length} approved funds</small></span><ArrowRight size={17}/></button>
              <button onClick={() => go("builder")}><span className="action-icon"><SlidersHorizontal size={19}/></span><span><b>Portfolio builder</b><small>Draft allocations using approved funds only</small></span><ArrowRight size={17}/></button>
              <button onClick={() => go("imports")}><span className="action-icon"><UploadCloud size={19}/></span><span><b>Source files</b><small>Factsheets and the November performance workbook</small></span><ArrowRight size={17}/></button>
            </section>
          </div>
        </>}

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
              <thead><tr><th>FUND</th><th>PROVIDER</th><th>1 YEAR*</th><th>3 YEARS CUM.*</th><th>5 YEARS CUM.*</th><th>10 YEARS CUM.*</th><th>PERFORMANCE SOURCE</th><th></th></tr></thead>
              <tbody>{filtered.map(f=><tr key={f.id}>
                <td><b>{f.name}</b></td><td>{f.provider}</td>
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
          <p className="fineprint">{filtered.length} of {funds.length} approved funds displayed. Unselected funds in the source workbook are intentionally excluded. * Returns come only from the newly uploaded performance workbook, not from older PDFs. All displayed periods, including 3-, 5- and 10-year returns, are cumulative percentages, as confirmed for the workbook; they are not annualised. Reporting dates and charges must still be verified before client use. Differences in reporting dates and charges must be considered; these figures are not yet approved for client proposals.</p>
        </>}

        {view === "imports" && <SecureFundUploads/>}

        {view === "builder" && <>
          <div className="page-heading"><div><span className="eyebrow">PORTFOLIO CONSTRUCTION</span><h1>Portfolio builder</h1>
            <p>Build up to three draft portfolios using only the approved Omega funds. No investment performance is estimated without verified return data.</p></div>
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
              <label className="form-label" htmlFor="capital">Initial investment (€)</label>
              <MoneyInput value={investment} onChange={setInvestment}/>
              <div className="allocation-heading"><h2>Fund allocations</h2>
                <span className={Math.abs(total-100)<0.00001?"allocation-ok":"allocation-error"}>{total.toFixed(1)}% allocated</span>
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
                  <div><strong>{fund.name}</strong><small>{fund.provider}</small></div>
                  <div className="allocation-controls">
                    <input type="number" className="weight-input" min={0} max={100} step={.5} aria-label={"Allocation for "+fund.name}
                      value={percentage} onChange={e=>setWeight(id,Number(e.target.value))}/>
                    <span>%</span>
                    <button type="button" className="icon-action" title={"Remove "+fund.name} onClick={()=>removeFund(id)}><X size={15}/></button>
                  </div>
                </div>;
              })}
              <div className="notice neutral"><ShieldAlert size={17}/> Allocations must total 100%. Drafts currently remain in your browser session; no performance or volatility is simulated.</div>
            </section>
            <section className="panel padded"><span className="eyebrow">PORTFOLIO SUMMARY</span><h2>{current.title}</h2>
              <div className="mini-stats">
                <Stat label="Initial investment" value={fmtEuro(investment)}/>
                <Stat label="Allocated funds" value={String(allocated.length)}/>
                <Stat label="Allocation total" value={total.toFixed(1)+"%"}/>
                <Stat label="Historical portfolio return" value="Not calculated"/>
              </div>
              <div className="separator"/>
              <h3>Selected funds</h3>
              {allocated.length ? allocated.map(({fund,percentage})=>
                <div className="allocation-row" key={fund.id}><div><strong>{fund.name}</strong><small>{fund.provider}</small></div><b>{percentage.toFixed(1)}%</b></div>
              ) : <p className="muted">No funds have a positive allocation.</p>}
              <p className="fineprint">Published return figures cannot be used until the corresponding share class, horizon basis and reporting date are confirmed.</p>
            </section>
          </div>
        </>}

        {view === "compare" && <>
          <div className="page-heading"><div><span className="eyebrow">PORTFOLIO COMPARISON</span><h1>Compare portfolios</h1>
            <p>Compare the selected allocations. The workbook provides fund-level cumulative returns, not aligned monthly price observations for calculating historical portfolio performance.</p></div>
            <button className="btn quiet" onClick={()=>go("builder")}>Edit allocations <ArrowRight size={16}/></button>
          </div>
          <div className="portfolio-card-grid">{portfolios.map(p=>{
            const holdings=Object.entries(p.weights).filter(([id,v])=>v>0 && names.has(id));
            const valid=Math.abs(sumWeights(p)-100)<0.00001;
            return <div className="portfolio-card" key={p.id}>
              <span className="eyebrow">PORTFOLIO {p.id.toUpperCase()}</span>
              <h2>{p.title}</h2><p>{p.description}</p>
              <div className="portfolio-card-value">{sumWeights(p).toFixed(1)}%</div>
              <small>Allocation total {valid?"— complete":"— incomplete"}</small>
              <div className="portfolio-card-bottom"><span>Selected funds <b>{holdings.length}</b></span>
                <span>Historical performance <b>Not calculated</b></span></div>
            </div>;
          })}</div>
          <div className="panel table-panel">
            <div className="panel-heading"><div><span className="eyebrow">SIDE BY SIDE</span><h2>Allocation comparison</h2></div></div>
            <div className="table-scroll"><table className="data-table compare-table">
              <thead><tr><th>MEASURE</th>{portfolios.map(p=><th key={p.id}>{p.title}</th>)}</tr></thead>
              <tbody>
                <tr><td>Initial investment</td>{portfolios.map(p=><td key={p.id}>{fmtEuro(investment)}</td>)}</tr>
                <tr><td>Number of funds</td>{portfolios.map(p=><td key={p.id}>{Object.values(p.weights).filter(v=>v>0).length}</td>)}</tr>
                <tr><td>Allocation total</td>{portfolios.map(p=><td key={p.id}>{sumWeights(p).toFixed(1)}%</td>)}</tr>
                <tr><td>3-year published return</td>{portfolios.map(p=><td key={p.id}>Not calculated</td>)}</tr>
                <tr><td>5-year published return</td>{portfolios.map(p=><td key={p.id}>Not calculated</td>)}</tr>
                <tr><td>10-year published return</td>{portfolios.map(p=><td key={p.id}>Not calculated</td>)}</tr>
              </tbody>
            </table></div>
            <p className="fineprint padded-note">No portfolio return, volatility or value history is calculated from unmatched date/fee conventions. The generated PDF lists the original cumulative returns for each allocated fund.</p>
          </div>
        </>}

        {view === "proposal" && <>
          <div className="page-heading"><div><span className="eyebrow">CLIENT DOCUMENTS</span><h1>Investment bond proposal</h1>
            <p>Generate an A4 Omega-branded proposal using allocations from Portfolio builder, cumulative returns from the current workbook and supporting information extracted from each linked PDF.</p></div>
          </div>
          <section className="panel padded">
            <span className="eyebrow">PROPOSAL DETAILS</span>
            <label className="form-label" htmlFor="clientname">Client name</label>
            <input id="clientname" className="form-input" maxLength={120} value={client}
              placeholder="Client name (optional for internal drafts)" onChange={e=>setClient(e.target.value)}/>
            <label className="form-label" htmlFor="advisername">Prepared by</label>
            <input id="advisername" className="form-input" maxLength={120} value={adviser} onChange={e=>setAdviser(e.target.value)}/>
            <label className="form-label" htmlFor="objective">Investment objective</label>
            <textarea id="objective" className="form-input textarea" rows={2} maxLength={600} value={objective} onChange={e=>setObjective(e.target.value)}/>
            <label className="form-label" style={{marginTop:18}}>Portfolios to include</label>
            <div className="portfolio-card-grid">
              {portfolios.map(p=>{
                const weighted=Object.entries(p.weights).filter(([,v])=>v>0);
                const totalWeight=sumWeights(p);
                const matched=weighted.filter(([id])=>linked(published[id])).length;
                return <label key={p.id} className="panel padded" style={{display:"block",cursor:"pointer"}}>
                  <span style={{display:"flex",gap:9,alignItems:"center"}}>
                    <input type="checkbox" checked={!!includePortfolios[p.id]}
                      onChange={e=>setIncludePortfolios(state=>({...state,[p.id]:e.target.checked}))}/>
                    <strong>{p.title}</strong>
                  </span>
                  <p className="muted">{weighted.length} funds · {totalWeight.toFixed(1)}% allocated · {matched}/{weighted.length} PDF filenames linked</p>
                </label>;
              })}
            </div>
            <div className="notice neutral" style={{marginTop:17}}>
              <ShieldAlert size={18}/><span>This PDF uses the workbook for all fund names and cumulative return percentages. The linked PDFs supply objectives, strategy, risk rating, charges, factsheet date and source references where extractable. Missing PDF fields are labelled unavailable. Historical portfolio performance and charts are not invented.</span>
            </div>
            <div className="notice neutral">
              <ShieldAlert size={18}/><span>The export is marked <strong>draft for adviser review</strong> because PDF contents, share classes, return reporting dates and charges have not been independently verified for client distribution. A matched filename does not constitute this sign-off.</span>
            </div>
            {proposalError&&<div className="notice error" role="alert"><ShieldAlert size={16}/>{proposalError}</div>}
            {proposalMessage&&<div className="notice success" role="status"><CheckCircle2 size={16}/>{proposalMessage}</div>}
            <div className="button-row" style={{marginTop:14}}>
              <button className="btn primary" type="button" disabled={proposalBusy||!readyForProposal}
                onClick={()=>void generateProposal()}><FileText size={16}/>{proposalBusy?"Generating PDF…":"Generate proposal PDF"}</button>
              <button className="btn quiet" type="button" onClick={()=>go("builder")}><SlidersHorizontal size={16}/> Edit portfolio allocations</button>
            </div>
            {!readyForProposal&&<p className="fineprint">To enable export, select at least one portfolio with 100% allocation and current workbook/PDF filename matches for all of its funds.</p>}
          </section>
          <FundSourceAudit/>
        </>}
      </main>
    </div>
    {selectedFund && <div className="modal-overlay" onClick={()=>setSelectedFund(null)}>
      <div className="fund-modal" role="dialog" aria-modal="true" aria-label="Approved fund details" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={()=>setSelectedFund(null)}><X size={20}/></button>
        <span className="eyebrow">OMEGA-APPROVED FUND</span><h2>{selectedFund.name}</h2>
        <p className="muted">{selectedFund.provider}</p>
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
          {published[selectedFund.id].extracted_factsheet && <>
            <h3>Original provider factsheet — recorded source</h3>
            <p><strong>Fund title:</strong> {published[selectedFund.id].extracted_factsheet?.title??"Not extracted"}</p>
            <p><strong>MoneyMate ID:</strong> {published[selectedFund.id].extracted_factsheet?.moneyMateId??"N/A"} · <strong>Factsheet date:</strong> {published[selectedFund.id].extracted_factsheet?.asOf??"N/A"}</p>
            <p><strong>AMC:</strong> {formatReported(published[selectedFund.id].extracted_factsheet?.amcPct)} · <strong>CIV charge:</strong> {formatReported(published[selectedFund.id].extracted_factsheet?.civPct)}</p>
            {published[selectedFund.id].extracted_factsheet?.objective && <p><strong>Objective:</strong> {published[selectedFund.id].extracted_factsheet!.objective}</p>}
            {published[selectedFund.id].factsheet_import_id && <a target="_blank" rel="noopener noreferrer" href={"/api/fund-uploads/"+published[selectedFund.id].factsheet_import_id+"/download?view=1"}>View original factsheet and charts</a>}
          </>}
        </>:<div className="notice neutral"><ShieldAlert size={17}/> No matched current workbook return row and new PDF yet. Upload both sources, then run automatic matching.</div>}
        <p className="fineprint">Workbook returns and supporting PDF filenames have been linked where shown. PDF contents, share class, reporting dates and fee treatment still require adviser verification before client distribution.</p>
        <button className="btn quiet" onClick={()=>setSelectedFund(null)}>Close details</button>
      </div>
    </div>}
  </div>;
}
