"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronDown, Database,
  FileText, FolderOpen, LayoutDashboard, LogOut,
  Menu, Plus, Search, ShieldAlert, SlidersHorizontal, UploadCloud, X
} from "lucide-react";
import OmegaLogo from "@/components/omega-logo";
import SecureFundUploads from "@/components/secure-fund-uploads";
import { APPROVED_FUNDS, APPROVED_FUND_GROUPS, type ApprovedFund } from "@/lib/approved-funds";
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

const PROVIDERS = Object.keys(APPROVED_FUND_GROUPS);
const names = new Map(APPROVED_FUNDS.map(f => [f.id, f.name]));
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
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("All providers");
  const [selectedFund, setSelectedFund] = useState<ApprovedFund | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(INITIAL_PORTFOLIOS);
  const [activePortfolio, setActivePortfolio] = useState(0);
  const [addFundId, setAddFundId] = useState(APPROVED_FUNDS[0].id);
  const [investment, setInvestment] = useState(490000);
  const [client, setClient] = useState("");
  const [adviser, setAdviser] = useState("Omega Financial Management");
  const [objective, setObjective] = useState("Review diversified investment options in line with the client's objectives and risk profile.");

  const filtered = useMemo(() => APPROVED_FUNDS.filter(f =>
    (provider === "All providers" || f.provider === provider) &&
    (f.name + " " + f.provider).toLowerCase().includes(search.trim().toLowerCase())
  ), [provider, search]);

  const current = portfolios[activePortfolio];
  const total = sumWeights(current);
  const allocated = Object.entries(current.weights)
    .filter(([, percentage]) => percentage > 0)
    .map(([id, percentage]) => ({ fund: APPROVED_FUNDS.find(f => f.id === id), percentage }))
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
    if (!APPROVED_FUNDS.some(f => f.id === addFundId)) return;
    changePortfolio(activePortfolio, { weights: { ...current.weights, [addFundId]: current.weights[addFundId] ?? 0 } });
  }
  function removeFund(id: string) {
    const weights = { ...current.weights }; delete weights[id]; changePortfolio(activePortfolio, { weights });
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
          <p>115 funds from the November 2026 Omega workbook. Published performance and factsheet figures require source verification.</p>
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
          <ShieldAlert size={18}/><span><strong>Published-return workflow.</strong> Only the 115 selected funds are available. All source performance, fees and risk details remain unapproved until matched with the correct factsheet/share class. Monthly prices are not required.</span>
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
            <Stat label="Approved funds" value="115" sub="No other funds will appear"/>
            <Stat label="Aviva" value="30" sub="Fund shortlist"/>
            <Stat label="Zurich" value="29" sub="Fund shortlist"/>
            <Stat label="New Ireland / Standard Life" value="42 / 14" sub="Fund shortlist"/>
          </div>
          <div className="two-col">
            <section className="panel padded"><span className="eyebrow">DATA QUALITY</span><h2>Source verification</h2>
              <p className="muted">Different providers and fund series use different document styles. Abbreviated names must be reconciled against the precise share class before returns are enabled.</p>
              <div className="notice neutral"><FolderOpen size={18}/> Original files remain available in private Vercel Blob. Source matching and approval are the next steps.</div>
            </section>
            <section className="panel action-panel"><span className="eyebrow">QUICK ACCESS</span><h2>Working with your fund list</h2>
              <button onClick={() => go("funds")}><span className="action-icon"><Database size={19}/></span><span><b>Fund library</b><small>All 115 approved funds</small></span><ArrowRight size={17}/></button>
              <button onClick={() => go("builder")}><span className="action-icon"><SlidersHorizontal size={19}/></span><span><b>Portfolio builder</b><small>Draft allocations using approved funds only</small></span><ArrowRight size={17}/></button>
              <button onClick={() => go("imports")}><span className="action-icon"><UploadCloud size={19}/></span><span><b>Source files</b><small>Factsheets and the November performance workbook</small></span><ArrowRight size={17}/></button>
            </section>
          </div>
        </>}

        {view === "funds" && <>
          <div className="page-heading"><div><span className="eyebrow">CONTROLLED FUND LIBRARY</span><h1>Fund library</h1>
            <p>Exactly 115 Omega-selected funds. The names below are the approved shortlist, not yet verified performance share classes.</p></div>
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
              <thead><tr><th>FUND</th><th>PROVIDER</th><th>PERFORMANCE STATUS</th><th></th></tr></thead>
              <tbody>{filtered.map(f=><tr key={f.id}>
                <td><b>{f.name}</b></td><td>{f.provider}</td>
                <td><span className="soft-pill">Pending source match</span></td>
                <td><button className="icon-action" aria-label={"View " + f.name} onClick={()=>setSelectedFund(f)}><ArrowRight size={17}/></button></td>
              </tr>)}</tbody>
            </table>{filtered.length===0 && <div className="empty">No matching funds found.</div>}</div>
          </div>
          <p className="fineprint">{filtered.length} of 115 approved funds displayed. Unselected funds in the source workbook are intentionally excluded.</p>
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
                    {APPROVED_FUNDS.filter(f=>f.provider===p).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </optgroup>)}
                </select>
                <button className="btn primary" type="button" onClick={addFund}><Plus size={15}/> Add</button>
              </div>
              {Object.keys(current.weights).length===0 && <div className="notice neutral">Select funds from the approved list to begin.</div>}
              {Object.entries(current.weights).map(([id,percentage])=>{
                const fund=APPROVED_FUNDS.find(f=>f.id===id);
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
                <Stat label="Verified historical return" value="Pending"/>
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
            <p>Review three draft allocations side by side. Historical return comparisons will be activated after the source-data reconciliation.</p></div>
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
                <span>Historical performance <b>Pending</b></span></div>
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
                <tr><td>3-year published return</td>{portfolios.map(p=><td key={p.id}>Pending verification</td>)}</tr>
                <tr><td>5-year published return</td>{portfolios.map(p=><td key={p.id}>Pending verification</td>)}</tr>
                <tr><td>10-year published return</td>{portfolios.map(p=><td key={p.id}>Pending verification</td>)}</tr>
              </tbody>
            </table></div>
            <p className="fineprint padded-note">No monthly price history is requested or generated. Provider reported returns must have matching dates, horizons and charge/return conventions before portfolio arithmetic is enabled.</p>
          </div>
        </>}

        {view === "proposal" && <>
          <div className="page-heading"><div><span className="eyebrow">CLIENT DOCUMENTS</span><h1>Investment bond proposal</h1>
            <p>The A4 Omega PDF design remains ready. Export of actual fund performance is paused until verified fund records replace demonstration data.</p></div>
          </div>
          <section className="panel padded">
            <span className="eyebrow">DRAFT DETAILS</span>
            <label className="form-label" htmlFor="clientname">Client name</label>
            <input id="clientname" className="form-input" maxLength={120} value={client}
              placeholder="Do not enter real client details until approval workflow is enabled" onChange={e=>setClient(e.target.value)}/>
            <label className="form-label" htmlFor="advisername">Prepared by</label>
            <input id="advisername" className="form-input" maxLength={120} value={adviser} onChange={e=>setAdviser(e.target.value)}/>
            <label className="form-label" htmlFor="objective">Investment objective</label>
            <textarea id="objective" className="form-input textarea" rows={2} maxLength={600} value={objective} onChange={e=>setObjective(e.target.value)}/>
            <div className="notice neutral"><ShieldAlert size={18}/>
              <span>The PDF template has not been removed, but client-facing export is withheld until the correct published returns and factsheet details are approved. This prevents showing invented monthly values or mismatched performance for your selected funds.</span></div>
            <button className="btn quiet" onClick={()=>go("funds")}><Database size={16}/> Review approved funds</button>
          </section>
        </>}
      </main>
    </div>
    {selectedFund && <div className="modal-overlay" onClick={()=>setSelectedFund(null)}>
      <div className="fund-modal" role="dialog" aria-modal="true" aria-label="Approved fund details" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={()=>setSelectedFund(null)}><X size={20}/></button>
        <span className="eyebrow">OMEGA-APPROVED FUND</span><h2>{selectedFund.name}</h2>
        <p className="muted">{selectedFund.provider}</p>
        <div className="notice neutral"><ShieldAlert size={17}/> This fund is on the approved shortlist. Its exact share-class mapping, charges, risk and reported returns are awaiting verification.</div>
        <button className="btn quiet" onClick={()=>setSelectedFund(null)}>Close details</button>
      </div>
    </div>}
  </div>;
}
