"use client";
import {useMemo,useState} from "react";
import { signOut } from "next-auth/react";
import {Activity,ArrowDownToLine,ArrowRight,BookOpen,ChartNoAxesCombined,Check,ChevronDown,CircleHelp,Database,FileCheck,FileText,Files,Filter,FlaskConical,FolderOpen,LayoutDashboard,Menu,Plus,RefreshCw,Search,Settings2,ShieldAlert,ShieldCheck,SlidersHorizontal,TrendingUp,UploadCloud,Wallet, X, LogOut} from "lucide-react";
import OmegaLogo from "@/components/omega-logo";
import ProposalPdfViewer from "@/components/proposal-pdf-viewer";
import SecureFundUploads from "@/components/secure-fund-uploads";
import {demoFunds,demoPortfolios} from "@/lib/sample";
import type {Fund,Portfolio,SeriesPoint} from "@/lib/types";
import {blendedFee,fmtEuro,fmtPercent,isValidPortfolio,metrics,portfolioSeries,sumWeights} from "@/lib/analytics";
type View="overview"|"funds"|"imports"|"builder"|"compare"|"proposal";
const NAV:{key:View;label:string;icon:typeof Activity}[]=[
  {key:"overview",label:"Overview",icon:LayoutDashboard},
  {key:"funds",label:"Fund library",icon:Database},
  {key:"imports",label:"Fund uploads",icon:UploadCloud},
  {key:"builder",label:"Portfolio builder",icon:SlidersHorizontal},
  {key:"compare",label:"Compare portfolios",icon:ChartNoAxesCombined},
  {key:"proposal",label:"Client proposal",icon:FileText},
];
const BARS=["#6a252c","#a39359","#c28b8e"];
const money=(v:number)=>fmtEuro(v);
function LineChart({series,colors=BARS,height=270}:{series:SeriesPoint[][];colors?:string[];height?:number}) {
  const active=series.filter(s=>s.length>1);
  if(!active.length)return <div className="empty-chart">Insufficient price history to display a chart.</div>;
  const all=active.flatMap(s=>s.map(p=>p.value));
  const min=Math.min(...all)*0.91, max=Math.max(...all)*1.05;
  const width=820,h=height,plotW=width-66,plotH=h-48,x0=44,y0=12;
  const length=Math.max(...active.map(s=>s.length));
  const y=(n:number)=>y0+plotH-(n-min)/(max-min||1)*plotH;
  return <svg className="linechart" viewBox={"0 0 "+width+" "+h} role="img" aria-label="Historical synthetic portfolio performance line chart">
    {[0,.25,.5,.75,1].map((pct,i)=>{
      const yy=y0+plotH*pct;
      return <g key={i}><line x1={x0} x2={x0+plotW} y1={yy} y2={yy} stroke="#e7e2db" strokeDasharray="3 5"/>
        <text x={x0-9} y={yy+4} fontSize="11" textAnchor="end" fill="#8a8580">{Math.round(max-(max-min)*pct).toLocaleString("en-IE")}</text></g>;
    })}
    {active.map((points,i)=>{
      const d=points.map((p,k)=>(k===0?"M":"L")+(x0+(k/(length-1))*plotW).toFixed(2)+","+(y(p.value)).toFixed(2)).join(" ");
      return <path key={i} d={d} stroke={colors[i%colors.length]} strokeWidth={i===0?3.5:2.7} fill="none" strokeLinejoin="round" strokeLinecap="round"/>;
    })}
    <text x={x0} y={h-5} fill="#938d86" fontSize="11">{active[0][0].date.slice(0,7)}</text>
    <text x={x0+plotW} y={h-5} fill="#938d86" fontSize="11" textAnchor="end">{active[0][active[0].length-1].date.slice(0,7)}</text>
  </svg>;
}
function Donut({values,labels}:{values:number[];labels:string[]}) {
  let prior=0;
  const gradient=values.map((v,i)=>{const start=prior;prior+=v;return (["#6a252c","#a39359","#bd8188","#d6c9b7","#87968c","#cab4a5"][i%6])+" "+start+"% "+prior+"%";}).join(", ");
  return <div className="donut-wrap"><div className="donut" style={{background:"conic-gradient("+gradient+")"}}><div className="donut-hole"><strong>100%</strong><small>allocated</small></div></div><div className="donut-legend">{values.map((v,i)=><div key={i}><span className="legend-dot" style={{background:["#6a252c","#a39359","#bd8188","#d6c9b7","#87968c","#cab4a5"][i%6]}}/><span>{labels[i]}</span><b>{v.toFixed(0)}%</b></div>)}</div></div>;
}
function Stat({label,value,sub}:{label:string;value:string;sub?:string}) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>;
}
export default function Workspace() {
 const [view,setView]=useState<View>("overview");
 const [mobile,setMobile]=useState(false);
 const [funds,setFunds]=useState<Fund[]>(demoFunds);
 const [portfolios,setPortfolios]=useState<Portfolio[]>(demoPortfolios);
 const [activePortfolio,setActivePortfolio]=useState(0);
 const [investment,setInvestment]=useState(490000);
 const [client,setClient]=useState("");
 const [adviser,setAdviser]=useState("");
 const [objective,setObjective]=useState("Review diversified investment options with consideration for long-term growth and volatility.");
 const [search,setSearch]=useState("");
 const [category,setCategory]=useState("All categories");
 const [selectedFund,setSelectedFund]=useState<string|null>(null);
 const [chartWindow,setChartWindow]=useState<3|5|10>(5);
 const [issued,setIssued]=useState(false);
 const lastAsOf=funds[0]?.prices.at(-1)?.date??"—";
 const series=useMemo(()=>portfolios.map(p=>portfolioSeries(p,funds,investment)),[portfolios,funds,investment]);
 const historical=useMemo(()=>series.map(s=>metrics(s,chartWindow)),[series,chartWindow]);
 const bestReturn=historical.reduce((best,m)=>m&&m.returnPct>(best??-Infinity)?m.returnPct:best,null as number|null);
 const categories=["All categories",...new Set(funds.map(f=>f.category))];
 const filtered=funds.filter(f=>(category==="All categories"||f.category===category)&&[f.name,f.code,f.provider].join(" ").toLowerCase().includes(search.toLowerCase()));
 const current=portfolios[activePortfolio],selected=funds.find(f=>f.id===selectedFund)??null;
 const currentSeries=series[activePortfolio],currentStats=historical[activePortfolio];
 const weights=Object.entries(current.weights).filter(([,v])=>v>0);
 const sum=sumWeights(current);
 function changeWeight(id:string,weight:number){
   setPortfolios(prev=>prev.map((p,i)=>i===activePortfolio?{...p,weights:{...p.weights,[id]:Math.max(0,Math.min(100,Number.isFinite(weight)?weight:0))}}:p));
   setIssued(false);
 }
 function changePortfolio(key:"title"|"description",value:string) {
   setPortfolios(prev=>prev.map((p,i)=>i===activePortfolio?{...p,[key]:value}:p));setIssued(false);
 }
 function go(next:View){setView(next);setMobile(false);}
 const validComparison=portfolios.every(p=>isValidPortfolio(p,funds));
 const canPrint=validComparison && historical.some(Boolean);
 return <div className="app-shell">
   <aside className={"sidebar "+(mobile?"mobile-open":"")}>
     <div className="sidebar-brand"><OmegaLogo variant="dark" width={177} /><button className="sidebar-close" onClick={()=>setMobile(false)}><X size={18}/></button></div>
     <div className="sidebar-group-label">WORKSPACE</div>
     <nav className="nav-list">{NAV.map(item=><button key={item.key} className={"nav-link "+(view===item.key?"selected":"")} onClick={()=>go(item.key)}><item.icon size={18}/>{item.label}{item.key==="compare"&&<span className="nav-count">3</span>}</button>)}</nav>
     <div className="sidebar-bottom"><div className="sidebar-help"><FlaskConical size={19}/><b>Demo workspace</b><p>Synthetic fund data only. Do not enter real client information.</p></div><p className="side-footer">OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</p></div>
   </aside>
   {mobile&&<div className="mobile-backdrop" onClick={()=>setMobile(false)}/>}
   <div className="main-area">
     <header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu size={22}/></button><span className="crumb">OMEGA <span>/</span> BOND PROPOSALS <span>/</span> <b>{NAV.find(n=>n.key===view)?.label}</b></span><div className="topbar-right"><span className="status-dot"/> <span className="desktop-only">Prototype environment</span><span className="avatar">OF</span><button className="app-signout" type="button" title="Sign out" aria-label="Sign out" onClick={() => signOut({ redirectTo: "/login" })}><LogOut size={16}/><span>Sign out</span></button></div></header>
     <main className="content">
       <div className="demo-warning"><FlaskConical size={17}/><span><strong>Portfolio analytics are demonstration-only.</strong> Published performance data and factsheets can be archived securely under Fund uploads, but remain pending review and are not yet used in comparisons.</span></div>
       {view==="overview"&&<>
         <section className="page-heading hero-heading"><div><span className="eyebrow">INVESTMENT PROPOSAL WORKSPACE</span><h1>Clearer investment decisions.</h1><p>Bring your funds, portfolio strategies and client proposals together in one considered workspace.</p><div className="button-row"><button className="btn primary" onClick={()=>go("builder")}><Plus size={16}/> Build a portfolio</button><button className="btn quiet" onClick={()=>go("compare")}>Compare strategies <ArrowRight size={16}/></button></div></div><div className="hero-art"><span className="orbit orbit-a"/><span className="orbit orbit-b"/><span className="orbit orbit-c"/><span className="hero-initial">Ω</span></div></section>
         <div className="stats-grid"><Stat label="Funds in library" value={String(funds.length).padStart(2,"0")} sub="Including sample strategies"/><Stat label="Prepared portfolios" value={String(portfolios.length).padStart(2,"0")} sub="Ready for comparison"/><Stat label="Reference investment" value={money(investment)} sub="Editable in portfolio builder"/><Stat label="Latest sample price" value={lastAsOf} sub="Synthetic observation date"/></div>
         <section className="two-col"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ANALYTICS</span><h2>Portfolio growth overview</h2></div><button className="tiny-link" onClick={()=>go("compare")}>Full comparison <ArrowRight size={14}/></button></div><LineChart series={series}/><div className="chart-key">{portfolios.map((p,i)=><span key={p.id}><i style={{background:BARS[i]}}/>{p.title}</span>)}</div><p className="fineprint">Illustrative buy-and-hold results derived from generated test prices, not actual market history.</p></div>
         <div className="panel action-panel"><span className="eyebrow">QUICK ACCESS</span><h2>What would you like to do?</h2><button onClick={()=>go("funds")}><span className="action-icon"><Database size={19}/></span><span><b>Explore fund library</b><small>Review fund records and available history</small></span><ArrowRight size={17}/></button><button onClick={()=>go("imports")}><span className="action-icon"><UploadCloud size={19}/></span><span><b>Upload fund documents</b><small>Save official factsheets and performance workbooks</small></span><ArrowRight size={17}/></button><button onClick={()=>go("proposal")}><span className="action-icon"><FileText size={19}/></span><span><b>Prepare a proposal</b><small>Review the print-ready investment report</small></span><ArrowRight size={17}/></button></div></section>
       </>}
       {view==="funds"&&<>
         <div className="page-heading"><div><span className="eyebrow">SOURCE DATA</span><h1>Fund library</h1><p>A central reference for every fund, its documented characteristics and historic unit prices.</p></div><button className="btn primary" onClick={()=>go("imports")}><UploadCloud size={16}/> Import data</button></div>
         <div className="panel"><div className="filter-row"><label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by fund, provider or code..."/></label><label className="select-wrap"><Filter size={16}/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={15}/></label></div>
         <div className="table-scroll"><table className="data-table"><thead><tr><th>FUND / PROVIDER</th><th>CATEGORY</th><th>RISK*</th><th>INDICATIVE FEE*</th><th>PRICE HISTORY</th><th></th></tr></thead><tbody>{filtered.map(f=><tr key={f.id}><td><b>{f.name}</b><small>{f.provider} · {f.code}</small></td><td><span className="soft-pill">{f.category}</span></td><td>{f.risk??"—"} / 7</td><td>{fmtPercent(f.fee)}</td><td>{f.prices.length} observations</td><td><button className="icon-action" aria-label={"Open "+f.name} onClick={()=>setSelectedFund(f.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty">No matching funds found.</div>}</div></div>
         <p className="fineprint">* Risk indicators and charges in this table are fabricated demonstration values; verify actual figures against the exact product factsheet/KID.</p>
       </>}
       {view==="imports"&&<SecureFundUploads />}
       {view==="builder"&&<>
         <div className="page-heading"><div><span className="eyebrow">PORTFOLIO CONSTRUCTION</span><h1>Portfolio builder</h1><p>Allocate funds, review historical behaviour and prepare strategies for comparison.</p></div><button className="btn primary" onClick={()=>go("compare")}>Compare portfolios <ArrowRight size={16}/></button></div>
         <div className="portfolio-tabs">{portfolios.map((p,i)=><button key={p.id} className={i===activePortfolio?"active":""} onClick={()=>setActivePortfolio(i)}><span className="tab-letter">{p.id.toUpperCase()}</span>{p.title}</button>)}</div>
         <div className="two-col builder-grid"><section className="panel padded"><span className="eyebrow">PORTFOLIO DETAILS</span><label className="form-label" htmlFor="portfolioTitle">Portfolio name</label><input id="portfolioTitle" className="form-input" value={current.title} maxLength={80} onChange={e=>changePortfolio("title",e.target.value)}/><label className="form-label" htmlFor="portfolioDesc">Strategy description</label><textarea id="portfolioDesc" className="form-input textarea" value={current.description} maxLength={250} rows={2} onChange={e=>changePortfolio("description",e.target.value)}/><label className="form-label" htmlFor="capital">Initial investment (€)</label><input id="capital" type="number" min={1} max={1000000000} step="1000" className="form-input" value={investment} onChange={e=>setInvestment(Math.max(1,Number(e.target.value)||1))}/>
         <div className="allocation-heading"><h2>Fund allocations</h2><span className={Math.abs(sum-100)<0.00001?"allocation-ok":"allocation-error"}>{sum.toFixed(1)}% allocated</span></div>
         {funds.map(f=><div className="allocation-row" key={f.id}><div><strong>{f.name}</strong><small>{f.provider}</small></div><div className="allocation-controls"><input aria-label={"Allocation of "+f.name} type="range" min={0} max={100} step={1} value={current.weights[f.id]||0} onChange={e=>changeWeight(f.id,Number(e.target.value))}/><input aria-label={"Percentage allocation of "+f.name} type="number" min={0} max={100} className="weight-input" value={current.weights[f.id]||0} onChange={e=>changeWeight(f.id,Number(e.target.value))}/><span>%</span></div></div>)}
         <div className="notice neutral"><CircleHelp size={16}/>Allocations must total exactly 100% for the calculation engine to display performance. These edits are not saved to a server.</div></section>
         <section className="panel padded"><span className="eyebrow">PORTFOLIO ANALYSIS</span><h2>{current.title}</h2>{weights.length>0&&<Donut values={weights.map(([,v])=>v)} labels={weights.map(([id])=>funds.find(f=>f.id===id)?.name??id)}/>}
         <div className="mini-stats"><Stat label="Illustrative 5Y cumulative return" value={validComparison&&currentStats?fmtPercent(currentStats.returnPct,true):"—"}/><Stat label="Historical volatility (5Y)*" value={validComparison&&currentStats?fmtPercent(currentStats.volatilityPct):"—"}/><Stat label="Weighted reported fees*" value={fmtPercent(blendedFee(current,funds))}/><Stat label="Investment value" value={money(investment)}/></div><div className="separator"/><h3>Historical value illustration</h3><LineChart series={currentSeries.length?[currentSeries]:[] } colors={[BARS[activePortfolio]]} height={230}/><p className="fineprint">* Synthetic test data; fees are informational and already reflected according to source price basis. This is not a forecast, and fees must not be deducted twice.</p></section></div>
       </>}
       {view==="compare"&&<>
         <div className="page-heading"><div><span className="eyebrow">RISK & RETURN</span><h1>Portfolio comparison</h1><p>Three alternative allocations, evaluated consistently over the same historical period.</p></div><button className="btn primary" onClick={()=>go("proposal")}><FileText size={16}/> Prepare proposal</button></div>
         <div className="comparison-controls"><span><Settings2 size={16}/> Analysis period</span><div className="segmented">{([3,5,10] as const).map(y=><button key={y} className={chartWindow===y?"active":""} onClick={()=>setChartWindow(y)}>{y} years</button>)}</div><span className="asof">Synthetic data to {lastAsOf}</span></div>
         {!validComparison&&<div className="notice error"><ShieldAlert size={17}/>One or more portfolios do not total 100%. Correct allocations in the Portfolio Builder to enable analysis.</div>}
         <div className="portfolio-card-grid">{portfolios.map((p,i)=>{const result=historical[i];return <div className="portfolio-card" key={p.id}><span className="eyebrow">PORTFOLIO {p.id.toUpperCase()}</span><h2>{p.title}</h2><p>{p.description}</p><div className="portfolio-card-value">{validComparison&&result?fmtPercent(result.returnPct,true):"—"}</div><small>{chartWindow}-year historical cumulative return*</small><div className="portfolio-card-bottom"><span>Annualised: <b>{validComparison&&result?fmtPercent(result.cagrPct):"—"}</b></span><span>Volatility: <b>{validComparison&&result?fmtPercent(result.volatilityPct):"—"}</b></span></div><span className="accent-line" style={{background:BARS[i]}}/></div>})}</div>
         <div className="panel"><div className="panel-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>Historical portfolio value</h2></div><span className="soft-pill">Buy & hold · no rebalancing</span></div><LineChart series={validComparison?series:[] }/><div className="chart-key">{portfolios.map((p,i)=><span key={p.id}><i style={{background:BARS[i]}}/>Portfolio {p.id.toUpperCase()} — {p.title}</span>)}</div></div>
         <div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">SIDE-BY-SIDE</span><h2>Detailed comparison</h2></div></div><div className="table-scroll"><table className="data-table compare-table"><thead><tr><th>MEASURE</th>{portfolios.map(p=><th key={p.id}>PORTFOLIO {p.id.toUpperCase()}</th>)}</tr></thead><tbody>
         <tr><td>Initial investment</td>{portfolios.map(p=><td key={p.id}>{money(investment)}</td>)}</tr>
         <tr><td>{chartWindow}-year cumulative return*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.returnPct,true):"Insufficient data"}</td>)}</tr>
         <tr><td>{chartWindow}-year illustrative gain*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?money(investment*r.returnPct/100):"—"}</td>)}</tr>
         <tr><td>Annualised return*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.cagrPct):"—"}</td>)}</tr>
         <tr><td>Annualised historical volatility*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.volatilityPct):"—"}</td>)}</tr>
         <tr><td>Indicative weighted fund fee*</td>{portfolios.map(p=><td key={p.id}>{fmtPercent(blendedFee(p,funds))}</td>)}</tr>
         <tr><td>Number of allocated funds</td>{portfolios.map(p=><td key={p.id}>{Object.values(p.weights).filter(x=>x>0).length}</td>)}</tr>
         </tbody></table></div><p className="fineprint padded-note">* Synthetic prices, fees and hypothetical returns for interface testing only. This table is not suitable for investment decisions or client distribution. Regulatory risk classifications cannot be inferred from a weighted average of SRI ratings.</p></div>
       </>}
       {view==="proposal"&&<>
         <div className="page-heading">
           <div>
             <span className="eyebrow">CLIENT DOCUMENTS</span>
             <h1>Investment bond proposal</h1>
             <p>The A4 viewer and downloaded PDF use the same professionally formatted document, based on the Omega projection report design.</p>
           </div>
         </div>
         <div className="panel padded proposal-config">
           <div>
             <label className="form-label" htmlFor="client">Client name (demonstration only)</label>
             <input id="client" className="form-input" placeholder="Use fictional test data only" value={client}
               maxLength={120} onChange={e=>setClient(e.target.value)} />
           </div>
           <div>
             <label className="form-label" htmlFor="adviser">Prepared by</label>
             <input id="adviser" className="form-input" placeholder="Adviser" value={adviser}
               maxLength={120} onChange={e=>setAdviser(e.target.value)} />
           </div>
           <div>
             <label className="form-label" htmlFor="analysis-period">Historical review period</label>
             <select id="analysis-period" className="form-input" value={chartWindow} onChange={e=>setChartWindow(Number(e.target.value) as 3|5|10)}>
               <option value={3}>3 years</option>
               <option value={5}>5 years</option>
               <option value={10}>10 years</option>
             </select>
           </div>
           <div>
             <label className="form-label" htmlFor="proposal-investment">Investment amount (EUR)</label>
             <input id="proposal-investment" type="number" min={1} max={1000000000} className="form-input"
               value={investment} onChange={e=>setInvestment(Math.max(1,Number(e.target.value)||1))}/>
           </div>
           <div className="full-column">
             <label className="form-label" htmlFor="objective">Client objective</label>
             <textarea className="form-input textarea" id="objective" rows={2} maxLength={600} value={objective}
               onChange={e=>setObjective(e.target.value)}/>
           </div>
           <p className="fineprint full-column">Demo-only: do not enter actual client information. Fund prices are synthetic or session-provided and are not verified for financial advice.</p>
         </div>
         <ProposalPdfViewer input={{ client, adviser, objective, investment, chartWindow, funds, portfolios }}/>
       </>}
     </main>
   </div>
   {selected&&<div className="modal-overlay" onClick={()=>setSelectedFund(null)}><div className="fund-modal" role="dialog" aria-modal="true" aria-label="Fund details" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedFund(null)}><X size={20}/></button><span className="eyebrow">FUND DETAILS · SAMPLE DATA</span><h2>{selected.name}</h2><p className="muted">{selected.provider} · {selected.code}</p><div className="modal-meta"><Stat label="Category" value={selected.category}/><Stat label="Risk indicator*" value={selected.risk!=null?selected.risk+" / 7":"—"}/><Stat label="Indicative fee*" value={fmtPercent(selected.fee)}/></div><h3>Illustrative unit-price history</h3><LineChart series={[selected.prices.map(p=>({date:p.date,value:p.price*100}))]} colors={["#6a252c"]} height={210}/><p className="fineprint">* Synthetic. Price series: {selected.prices.length} observations. These are not published market prices and cannot be used for actual recommendations.</p><button className="btn quiet" onClick={()=>setSelectedFund(null)}>Close details</button></div></div>}
 </div>;
}
