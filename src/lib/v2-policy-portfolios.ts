import {
  type InvestmentRecord, type PerformanceResult,
  calculatePerformance, checkPolicyValuations
} from "@/lib/v2-investment-performance";

export type InvestmentCase = InvestmentRecord & {
  portfolioGroup?:string;
  statementContributions?:number|null;
  statementWithdrawals?:number|null;
  statementAsOf?:string;
};
export type PolicyResult = {record:InvestmentCase;performance:PerformanceResult};
export type CombinedPortfolioResult = PerformanceResult & {policyResults:PolicyResult[]};
const rounded=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const common=(s:string)=>s.trim().replace(/\s+/g," ").toLocaleLowerCase("en-IE");
const empty=(reason:string,per:PolicyResult[]=[]):CombinedPortfolioResult=>({
  available:false,reason,openingValue:null,closingValue:null,
  contributions:0,withdrawals:0,netCashFlow:0,gain:null,
  weightedCapital:null,cumulativeReturnPct:null,cashFlowCount:0,policyResults:per
});
/**
 * Return for multiple policies sharing the same reporting dates.
 * Do not average percentage returns; add opening/closing capital and all
 * time-weighted signed cash flows, then compute the one portfolio return.
 *
 * A policy that did not exist at the opening date must not be silently treated
 * as a zero-valued holding: use a shorter common period, or obtain cashflows
 * and acquisition opening valuations that support a validated zero opening.
 */
export function calculateCombinedPortfolio(
  policies:InvestmentCase[],start:string,end:string
):CombinedPortfolioResult {
  if(!policies.length)return empty("Select at least one policy.");
  if(policies.length>40)return empty("Select up to 40 policies.");
  const client=common(policies[0].clientName);
  if(!client||policies.some(p=>common(p.clientName)!==client))
    return empty("All selected policies must belong to the same named client.");
  const group=common(policies[0].portfolioGroup??"");
  if(policies.some(p=>common(p.portfolioGroup??"")!==group))
    return empty("All selected policies must belong to the same portfolio group.");
  const ids=policies.map(p=>p.id??(p.provider+"|"+p.policyNumber+"|"+p.policyName));
  if(new Set(ids).size!==ids.length)return empty("A policy has been selected more than once.");
  const policyResults=policies.map(record=>({record,performance:calculatePerformance(record,start,end)}));
  const failed=policyResults.filter(p=>!p.performance.available);
  if(failed.length)return {
    ...empty("The portfolio return is unavailable until every selected policy has an opening and closing valuation and complete dated cash flows. Affected: "+
      failed.map(({record})=>record.policyName||"Unnamed policy").join(", ")+".",policyResults),
    cashFlowCount:policyResults.reduce((sum,p)=>sum+p.performance.cashFlowCount,0)
  };
  const sum=(field:"openingValue"|"closingValue"|"contributions"|"withdrawals"|"weightedCapital")=>
    policyResults.reduce((total,row)=>total+(row.performance[field]??0),0);
  const opening=sum("openingValue");
  const closing=sum("closingValue");
  const contributions=sum("contributions"),withdrawals=sum("withdrawals");
  const capital=sum("weightedCapital");
  const gain=closing-opening-contributions+withdrawals;
  if(!(capital>0))return empty("Portfolio time-weighted capital is not positive.",policyResults);
  return {
    available:true,reason:"",openingValue:rounded(opening),closingValue:rounded(closing),
    contributions:rounded(contributions),withdrawals:rounded(withdrawals),
    netCashFlow:rounded(contributions-withdrawals),
    weightedCapital:capital,gain:rounded(gain),
    cumulativeReturnPct:gain/capital*100,
    cashFlowCount:policyResults.reduce((sum,p)=>sum+p.performance.cashFlowCount,0),
    policyResults
  };
}
export type ReconciliationCheck={label:string;expected:number;entered:number;difference:number;matches:boolean};
const sumFlows=(record:InvestmentCase,kind:"contribution"|"withdrawal",asOf:string)=>
  record.flows.filter(f=>f.kind===kind&&f.date<=asOf).reduce((sum,f)=>sum+f.amount,0);

/** Workbook summary totals are only a *check*, not invented dated cash flows.
 * Original investment is included once in total contributions. */
export function reconcileStatementTotals(record:InvestmentCase):ReconciliationCheck[]{
  if(!record.statementAsOf)return [];
  const checks:ReconciliationCheck[]=[];
  if(record.statementContributions!==null&&record.statementContributions!==undefined){
    const entered=record.originalInvestment+sumFlows(record,"contribution",record.statementAsOf);
    checks.push({label:"Total contributions (including inception)",expected:record.statementContributions,
      entered:rounded(entered),difference:rounded(entered-record.statementContributions),
      matches:Math.abs(entered-record.statementContributions)<.03});
  }
  if(record.statementWithdrawals!==null&&record.statementWithdrawals!==undefined){
    const entered=sumFlows(record,"withdrawal",record.statementAsOf);
    checks.push({label:"Withdrawals",expected:record.statementWithdrawals,
      entered:rounded(entered),difference:rounded(entered-record.statementWithdrawals),
      matches:Math.abs(entered-record.statementWithdrawals)<.03});
  }
  return checks;
}
export function portfolioWarnings(policies:InvestmentCase[],start:string,end:string):string[]{
  const errors:string[]=[];
  for(const record of policies){
    const affected=[start,end].filter(Boolean).map(d=>checkPolicyValuations(record,d)).filter(Boolean);
    errors.push(...affected.map(s=>(record.policyName||"Unnamed policy")+": "+s));
    const checks=reconcileStatementTotals(record).filter(x=>!x.matches&&record.statementAsOf===end);
    errors.push(...checks.map(x=>(record.policyName||"Unnamed policy")+": stated "+
      x.label.toLowerCase()+" differs from dated records by €"+Math.abs(x.difference).toFixed(2)+"."));
    if(record.funds.length&&record.funds.every(f=>f.initialAmount!==null)){
      const sum=record.funds.reduce((n,f)=>n+(f.initialAmount??0),0);
      if(Math.abs(sum-record.originalInvestment)>.02)errors.push(
        (record.policyName||"Unnamed policy")+": original fund allocations do not match opening investment.");
    }
  }
  return errors;
}
