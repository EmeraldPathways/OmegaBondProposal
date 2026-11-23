/** Workbook return horizons used in the proposal's discrete comparison chart.
 * These are categorical LOOKBACK periods, not historical observation dates. */
export const CUMULATIVE_PERIODS=[
  {key:"oneYear",label:"1 year"},
  {key:"threeYear",label:"3 years"},
  {key:"fiveYear",label:"5 years"},
  {key:"tenYear",label:"10 years"}
] as const;
export type CumulativePeriod=typeof CUMULATIVE_PERIODS[number]["key"];
export type CumulativeReturnValues=Record<CumulativePeriod,number|null|undefined>;

/** A null or invalid period is not an assumed zero or an interpolated value. */
export function cumulativeReturnValues(returns:CumulativeReturnValues):(number|null)[]{
  return CUMULATIVE_PERIODS.map(period=>{
    const value=returns[period.key];
    return typeof value==="number"&&Number.isFinite(value)?value:null;
  });
}

/** Break the line wherever a workbook period is unavailable.
 * Markers still show isolated individual reported values. */
export function contiguousReturnSegments(values:readonly (number|null)[]):number[][]{
  const segments:number[][]=[];
  let run:number[]=[];
  values.forEach((v,i)=>{
    if(v!==null&&Number.isFinite(v)){run.push(i);return;}
    if(run.length>=2)segments.push(run);
    run=[];
  });
  if(run.length>=2)segments.push(run);
  return segments;
}

/** Include zero and add visual padding. No return percentages are modified. */
export function cumulativeChartDomain(rows:readonly (readonly (number|null)[])[]):{
  min:number;max:number
}{
  const values=rows.flatMap(row=>row.filter((v):v is number=>v!==null&&Number.isFinite(v)));
  if(!values.length)return {min:-5,max:5};
  const low=Math.min(0,...values),high=Math.max(0,...values);
  const span=high-low;
  const padding=Math.max(2,span*.10);
  const min=Math.floor((low-padding)/5)*5;
  const max=Math.ceil((high+padding)/5)*5;
  return max>min?{min,max}:{min:-5,max:5};
}

export function chartFundGroups<T>(funds:readonly T[],size=8):T[][]{
  if(!Number.isInteger(size)||size<1)throw Error("Chart group size must be positive");
  const groups:T[][]=[];
  for(let i=0;i<funds.length;i+=size)groups.push(funds.slice(i,i+size));
  return groups;
}
