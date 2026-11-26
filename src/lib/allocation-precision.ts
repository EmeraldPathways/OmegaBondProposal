import type {Portfolio} from "./types";

/** Financial inputs use whole cents and hundredths of one percent. */
export function moneyCents(value:number):number|null{
  if(!Number.isFinite(value)||value<0||value>1_000_000_000)return null;
  const cents=Math.round(value*100);
  return Math.abs(value*100-cents)<0.000001?cents:null;
}
export function validInvestmentAmount(value:number):boolean{
  return value>0&&moneyCents(value)!==null;
}
export function weightBasisPoints(value:number):number|null{
  if(!Number.isFinite(value)||value<0||value>100)return null;
  const bps=Math.round(value*100);
  return Math.abs(value*100-bps)<0.000001?bps:null;
}
export function allocationBasisPoints(weights:Record<string,number>):number|null{
  let total=0;
  for(const weight of Object.values(weights)){
    const bps=weightBasisPoints(weight);
    if(bps===null)return null;
    total+=bps;
  }
  return total;
}
export function isAllocationComplete(weights:Record<string,number>):boolean{
  return Object.values(weights).some(weight=>weight>0)&&
    allocationBasisPoints(weights)===10000;
}
export function displayAllocationTotal(weights:Record<string,number>):string{
  const sum=allocationBasisPoints(weights);
  return sum===null?"Invalid":(sum/100).toFixed(2)+"%";
}
export function remainingAllocationPct(weights:Record<string,number>):number|null{
  const sum=allocationBasisPoints(weights);
  return sum===null?null:(10000-sum)/100;
}

/** Largest-remainder allocation ensures rounded fund amounts sum to the exact
 * euro-cent investment, including non-divisible fractional weights.
 */
export function allocateInvestment(
  investment:number,weights:Record<string,number>
):Record<string,number>{
  const totalCents=moneyCents(investment);
  if(totalCents===null||totalCents===0||!isAllocationComplete(weights))
    throw new Error("Investment must be positive and allocations exactly 100.00%.");
  const parts=Object.entries(weights).map(([id,weight],index)=>{
    const bps=weightBasisPoints(weight)!;
    const numerator=totalCents*bps;
    const cents=Math.floor(numerator/10000);
    return {id,index,cents,remainder:numerator-cents*10000};
  });
  const unassigned=totalCents-parts.reduce((sum,item)=>sum+item.cents,0);
  const ordered=[...parts].sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let i=0;i<unassigned;i++)ordered[i].cents++;
  return Object.fromEntries(parts.map(item=>[item.id,item.cents/100]));
}
