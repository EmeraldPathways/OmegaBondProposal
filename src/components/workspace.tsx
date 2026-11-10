"use client";
import {useMemo,useRef,useState} from "react";
import { signOut } from "next-auth/react";
import {Activity,ArrowDownToLine,ArrowRight,BookOpen,ChartNoAxesCombined,Check,ChevronDown,CircleHelp,Database,FileCheck,FileText,Files,Filter,FlaskConical,FolderOpen,LayoutDashboard,Menu,Plus,RefreshCw,Search,Settings2,ShieldAlert,ShieldCheck,SlidersHorizontal,TrendingUp,UploadCloud,Wallet, X, LogOut} from "lucide-react";
import OmegaLogo from "@/components/omega-logo";
import {demoFunds,demoPortfolios} from "@/lib/sample";
import type {Fund,Portfolio,SeriesPoint} from "@/lib/types";
import {blendedFee,fmtEuro,fmtPercent,isValidPortfolio,metrics,portfolioSeries,sumWeights} from "@/lib/analytics";
import {monthlyPrices,parsePriceCSV} from "@/lib/csv";
type View="overview"|"funds"|"imports"|"builder"|"compare"|"proposal";
const NAV:{key:View;label:string;icon:typeof Activity}[]=[
  {key:"overview",label:"Overview",icon:LayoutDashboard},
  {key:"funds",label:"Fund library",icon:Database},
  {key:"imports",label:"Data imports",icon:UploadCloud},
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
 const [importFund,setImportFund]=useState(demoFunds[0].id);
 const [importError,setImportError]=useState("");
 const [importResult,setImportResult]=useState("");
 const [uploadName,setUploadName]=useState("");
 const [pendingCSV,setPendingCSV]=useState("");
 const [pendingFactsheet,setPendingFactsheet]=useState<{name:string;size:number}|null>(null);
 const uploadRef=useRef<HTMLInputElement|null>(null);
 const factsheetRef=useRef<HTMLInputElement|null>(null);
 const [chartWindow,setChartWindow]=useState(5);
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
 function downloadCSV(){
  const lines=["provider,fund_name,fund_code,unit_class,series_currency,price_date,unit_price,price_type,distribution_basis,source","Example Provider,Example Fund,EX123,Series A,EUR,2026-10-30,1.234567,NAV,accumulation,Provider price export"];
  const blob=new Blob([lines.join("\n")],{type:"text/csv"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="omega-fund-import-template.csv";a.click();URL.revokeObjectURL(url);
 }
 function previewCSV(file:File){
   setImportError("");setImportResult("");setUploadName(file.name);
   const reader=new FileReader();
   reader.onload=()=>{try{const parsed=parsePriceCSV(String(reader.result??""));setPendingCSV(String(reader.result??""));setImportResult(parsed.prices.length+" valid rows, "+parsed.rejected.length+" flagged. Review before loading into the temporary demonstration session.");}catch(err){setPendingCSV("");setImportError(err instanceof Error?err.message:"Could not read file.");}};
   reader.readAsText(file);
 }
 function applyCSV(){
   try{
     const {prices,rejected}=parsePriceCSV(pendingCSV);
     if(rejected.length)throw new Error("Resolve "+rejected.length+" rejected rows before accepting prices.");
     if(prices.length<13)throw new Error("At least 13 price observations are needed for the initial analysis.");
     const reduced=monthlyPrices(prices);
     setFunds(old=>old.map(f=>f.id===importFund?{...f,prices:reduced,source:"session",factsheetName:undefined}:f));
     setPendingCSV("");setImportResult("Loaded "+reduced.length+" monthly observations into this browser session. No server storage has occurred.");
     setIssued(false);
   }catch(err){setImportError(err instanceof Error?err.message:"Import failed.");}
 }
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
       <div className="demo-warning"><FlaskConical size={17}/><span><strong>Demonstration only.</strong> All preloaded funds and historical prices are synthetic. Files imported here remain in this browser session; no database or secure client storage is connected.</span></div>
       {view==="overview"&&<>
         <section className="page-heading hero-heading"><div><span className="eyebrow">INVESTMENT PROPOSAL WORKSPACE</span><h1>Clearer investment decisions.</h1><p>Bring your funds, portfolio strategies and client proposals together in one considered workspace.</p><div className="button-row"><button className="btn primary" onClick={()=>go("builder")}><Plus size={16}/> Build a portfolio</button><button className="btn quiet" onClick={()=>go("compare")}>Compare strategies <ArrowRight size={16}/></button></div></div><div className="hero-art"><span className="orbit orbit-a"/><span className="orbit orbit-b"/><span className="orbit orbit-c"/><span className="hero-initial">Ω</span></div></section>
         <div className="stats-grid"><Stat label="Funds in library" value={String(funds.length).padStart(2,"0")} sub="Including sample strategies"/><Stat label="Prepared portfolios" value={String(portfolios.length).padStart(2,"0")} sub="Ready for comparison"/><Stat label="Reference investment" value={money(investment)} sub="Editable in portfolio builder"/><Stat label="Latest sample price" value={lastAsOf} sub="Synthetic observation date"/></div>
         <section className="two-col"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ANALYTICS</span><h2>Portfolio growth overview</h2></div><button className="tiny-link" onClick={()=>go("compare")}>Full comparison <ArrowRight size={14}/></button></div><LineChart series={series}/><div className="chart-key">{portfolios.map((p,i)=><span key={p.id}><i style={{background:BARS[i]}}/>{p.title}</span>)}</div><p className="fineprint">Illustrative buy-and-hold results derived from generated test prices, not actual market history.</p></div>
         <div className="panel action-panel"><span className="eyebrow">QUICK ACCESS</span><h2>What would you like to do?</h2><button onClick={()=>go("funds")}><span className="action-icon"><Database size={19}/></span><span><b>Explore fund library</b><small>Review fund records and available history</small></span><ArrowRight size={17}/></button><button onClick={()=>go("imports")}><span className="action-icon"><UploadCloud size={19}/></span><span><b>Import fund data</b><small>Preview your price files for validation</small></span><ArrowRight size={17}/></button><button onClick={()=>go("proposal")}><span className="action-icon"><FileText size={19}/></span><span><b>Prepare a proposal</b><small>Review the print-ready investment report</small></span><ArrowRight size={17}/></button></div></section>
       </>}
       {view==="funds"&&<>
         <div className="page-heading"><div><span className="eyebrow">SOURCE DATA</span><h1>Fund library</h1><p>A central reference for every fund, its documented characteristics and historic unit prices.</p></div><button className="btn primary" onClick={()=>go("imports")}><UploadCloud size={16}/> Import data</button></div>
         <div className="panel"><div className="filter-row"><label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by fund, provider or code..."/></label><label className="select-wrap"><Filter size={16}/><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={15}/></label></div>
         <div className="table-scroll"><table className="data-table"><thead><tr><th>FUND / PROVIDER</th><th>CATEGORY</th><th>RISK*</th><th>INDICATIVE FEE*</th><th>PRICE HISTORY</th><th></th></tr></thead><tbody>{filtered.map(f=><tr key={f.id}><td><b>{f.name}</b><small>{f.provider} · {f.code}</small></td><td><span className="soft-pill">{f.category}</span></td><td>{f.risk??"—"} / 7</td><td>{fmtPercent(f.fee)}</td><td>{f.prices.length} observations</td><td><button className="icon-action" aria-label={"Open "+f.name} onClick={()=>setSelectedFund(f.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty">No matching funds found.</div>}</div></div>
         <p className="fineprint">* Risk indicators and charges in this table are fabricated demonstration values; verify actual figures against the exact product factsheet/KID.</p>
       </>}
       {view==="imports"&&<>
         <div className="page-heading"><div><span className="eyebrow">DATA MANAGEMENT</span><h1>Import fund information</h1><p>Prepare fund factsheets and historical prices for the verified database.</p></div><button className="btn quiet" onClick={downloadCSV}><ArrowDownToLine size={16}/> Example CSV template</button></div>
         <div className="two-col import-grid">
           <div className="panel"><div className="panel-heading"><div className="section-icon"><UploadCloud size={20}/></div><span className="soft-pill">CSV price history</span></div><h2>Historical unit prices</h2><p className="muted">Preview date and unit price records. Imported data affects only this temporary browser session.</p><label className="form-label" htmlFor="importTarget">Fund to update for preview</label><select id="importTarget" className="form-input" value={importFund} onChange={e=>setImportFund(e.target.value)}>{funds.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
           <input type="file" accept=".csv,text/csv" hidden ref={uploadRef} onChange={e=>{const file=e.target.files?.[0];if(file)previewCSV(file);}}/>
           <button className="dropzone" onClick={()=>uploadRef.current?.click()}><UploadCloud size={29}/><b>{uploadName||"Choose a CSV price file"}</b><small>Columns: date + price or unit_price · ISO dates YYYY-MM-DD</small></button>
           {importResult&&<div className="notice success"><Check size={16}/>{importResult}</div>}{importError&&<div className="notice error"><ShieldAlert size={16}/>{importError}</div>}
           {pendingCSV&&<button className="btn primary full" onClick={applyCSV}><Check size={16}/> Accept into demo session</button>}</div>
           <div className="panel"><div className="panel-heading"><div className="section-icon"><Files size={20}/></div><span className="soft-pill">PDF factsheets</span></div><h2>Official fund factsheets</h2><p className="muted">The production workflow will extract figures into a review queue and retain original, versioned PDFs in private storage.</p>
           <input type="file" accept=".pdf,application/pdf" hidden ref={factsheetRef} onChange={e=>{const f=e.target.files?.[0];if(f)setPendingFactsheet({name:f.name,size:f.size});}}/>
           <button className="dropzone" onClick={()=>factsheetRef.current?.click()}><FileText size={29}/><b>{pendingFactsheet?.name||"Choose a PDF factsheet"}</b><small>{pendingFactsheet?"Selected locally — not uploaded":"PDF documents · select for demonstration"}</small></button>
           <div className="notice neutral"><ShieldCheck size={18}/>Actual server-side storage, OCR/extraction, human review and import audit trails will be enabled only after secure services and authentication are configured.</div>
           </div>
         </div>
         <div className="panel padded"><h2>Recommended source requirements</h2><div className="requirement-grid"><div><FileCheck size={19}/><b>Exact fund class</b><p>Confirm the product, unit class and fund identifier.</p></div><div><Activity size={19}/><b>Consistent price basis</b><p>Verify NAV, currency and treatment of distributions.</p></div><div><BookOpen size={19}/><b>Source traceability</b><p>Record provider, publication dates and reported charges.</p></div></div></div>
       </>}
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
         <div className="comparison-controls"><span><Settings2 size={16}/> Analysis period</span><div className="segmented">{[3,5,10].map(y=><button key={y} className={chartWindow===y?"active":""} onClick={()=>setChartWindow(y)}>{y} years</button>)}</div><span className="asof">Synthetic data to {lastAsOf}</span></div>
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
         <div className="page-heading no-print"><div><span className="eyebrow">CLIENT DOCUMENTS</span><h1>Investment bond proposal</h1><p>Prepare the client report using the same layout, figures and illustrations as the analysis workspace.</p></div><button className="btn primary" disabled={!canPrint} onClick={()=>{setIssued(true);setTimeout(()=>window.print(),100);}}><ArrowDownToLine size={16}/> Print / Save as PDF</button></div>
         <div className="panel padded proposal-config no-print"><div><label className="form-label" htmlFor="client">Client name (demonstration only)</label><input id="client" className="form-input" placeholder="Use fictional test data only" value={client} onChange={e=>setClient(e.target.value)} /></div><div><label className="form-label" htmlFor="adviser">Prepared by</label><input id="adviser" className="form-input" placeholder="Adviser" value={adviser} onChange={e=>setAdviser(e.target.value)}/></div><div className="full-column"><label className="form-label" htmlFor="objective">Client objective</label><textarea className="form-input textarea" id="objective" rows={2} value={objective} onChange={e=>setObjective(e.target.value)}/></div><p className="fineprint full-column">Demo-only: do not enter real client names, objectives, or other personal information. A secure authenticated client workflow will be built after provisioning storage and database.</p></div>
         <article className="proposal-sheet">
           <div className="proposal-header"><div><div className="proposal-wordmark"><OmegaLogo variant="light" width={260} /></div><div className="proposal-header-title">INVESTMENT BOND PROPOSAL</div></div><span className="proposal-tag">CLIENT ILLUSTRATION · DEMO</span></div>
           <div className="proposal-body">
             <div className="proposal-kicker">INVESTMENT STRATEGY & PORTFOLIO ANALYSIS</div><div className="proposal-main-title"><h2>Investment bond proposal</h2><span>Prepared {new Date().toLocaleDateString("en-IE",{day:"numeric",month:"long",year:"numeric"})}</span></div>
             <div className="proposal-summary"><div><small>PREPARED FOR</small><b>{client||"Example Client"}</b></div><div><small>PREPARED BY</small><b>{adviser||"Omega Financial Management"}</b></div><div><small>INVESTMENT AMOUNT</small><b>{money(investment)}</b></div></div>
             <section className="proposal-section"><div className="eyebrow">INVESTMENT OBJECTIVE</div><p>{objective}</p></section>
             <section className="proposal-section"><div className="proposal-main-title"><h3>Portfolio performance illustration</h3><span>{chartWindow}-year historical sample</span></div><LineChart series={validComparison?series:[]}/><div className="chart-key">{portfolios.map((p,i)=><span key={p.id}><i style={{background:BARS[i]}}/>Portfolio {p.id.toUpperCase()}</span>)}</div></section>
             <section className="proposal-section"><div className="eyebrow">COMPARATIVE OVERVIEW</div><h3>Portfolio comparison</h3><div className="table-scroll"><table className="proposal-table"><thead><tr><th>MEASURE</th>{portfolios.map(p=><th key={p.id}>{p.id.toUpperCase()}: {p.title}</th>)}</tr></thead><tbody><tr><td>Investment</td>{portfolios.map(p=><td key={p.id}>{money(investment)}</td>)}</tr><tr><td>{chartWindow}-year total return*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.returnPct,true):"—"}</td>)}</tr><tr><td>Annualised return*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.cagrPct):"—"}</td>)}</tr><tr><td>Volatility*</td>{historical.map((r,i)=><td key={i}>{validComparison&&r?fmtPercent(r.volatilityPct):"—"}</td>)}</tr><tr><td>Indicative fund fees*</td>{portfolios.map(p=><td key={p.id}>{fmtPercent(blendedFee(p,funds))}</td>)}</tr></tbody></table></div></section>
             <section className="proposal-section"><div className="eyebrow">FUND ALLOCATION</div><h3>Investment composition</h3>{portfolios.map(p=><div className="proposal-allocation" key={p.id}><strong>Portfolio {p.id.toUpperCase()} — {p.title}</strong><p>{Object.entries(p.weights).filter(([,w])=>w>0).map(([id,w])=>(funds.find(f=>f.id===id)?.name??id)+" ("+w+"%)").join(" · ")}</p></div>)}</section>
             <div className="proposal-disclaimer"><b>IMPORTANT — DEMONSTRATION DATA ONLY</b><p>All prices, providers, returns, risk ratings and fees included in this prototype are synthetic test figures. They must not be used as advice, represented as actual historical returns or distributed as a genuine client proposal. Past performance is not a reliable indicator of future results. The value of investments may fall as well as rise. Any tax, product fees and distribution adjustments require independent verification before live use.</p></div>
             <div className="proposal-cta"><span>DISCUSS YOUR PLANS WITH OUR TEAM</span><p>Schedule a free consultation at +353 1 293 8554 (Sandyford office).</p></div>
             <footer className="proposal-footer">OFM Financial Ltd T/A Omega Financial Management, regulated by the Central Bank of Ireland.</footer>
           </div>
         </article>
         {issued&&<p className="fineprint no-print">Your browser print dialog can save this illustration as PDF. This is not an issued or persistently stored proposal.</p>}
       </>}
     </main>
   </div>
   {selected&&<div className="modal-overlay" onClick={()=>setSelectedFund(null)}><div className="fund-modal" role="dialog" aria-modal="true" aria-label="Fund details" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedFund(null)}><X size={20}/></button><span className="eyebrow">FUND DETAILS · SAMPLE DATA</span><h2>{selected.name}</h2><p className="muted">{selected.provider} · {selected.code}</p><div className="modal-meta"><Stat label="Category" value={selected.category}/><Stat label="Risk indicator*" value={selected.risk!=null?selected.risk+" / 7":"—"}/><Stat label="Indicative fee*" value={fmtPercent(selected.fee)}/></div><h3>Illustrative unit-price history</h3><LineChart series={[selected.prices.map(p=>({date:p.date,value:p.price*100}))]} colors={["#6a252c"]} height={210}/><p className="fineprint">* Synthetic. Price series: {selected.prices.length} observations. These are not published market prices and cannot be used for actual recommendations.</p><button className="btn quiet" onClick={()=>setSelectedFund(null)}>Close details</button></div></div>}
 </div>;
}
