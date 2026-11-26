/**
 * Layout strategy for larger Omega portfolios.
 * All portfolios with <=5 selected funds retain the approved legacy design.
 */
export function isExpandedPortfolio(fundCount:number):boolean{
  return fundCount>=6&&fundCount<=10;
}
/** Every selected fund shares one full-size chart for expanded 6–10 fund portfolios.
 * The chart's own legend identifies the individual fund lines.
 */
export function splitPerformanceFundGroups<T>(funds:readonly T[]):T[][]{
  return funds.length?[Array.from(funds)]:[];
}
export function paginateExpandedFundDetails<T>(funds:readonly T[]):T[][]{
  if(!funds.length)return [];
  const pageCount=Math.ceil(funds.length/3);
  const base=Math.floor(funds.length/pageCount);
  const extra=funds.length%pageCount;
  const result:T[][]=[];
  let position=0;
  for(let i=0;i<pageCount;i++){
    const size=base+(i<extra?1:0);
    result.push(funds.slice(position,position+size));
    position+=size;
  }
  return result;
}
export function fundDetailPageOffsets<T>(groups:readonly T[][]):number[]{
  let count=0;
  return groups.map(group=>{const offset=count;count+=group.length;return offset});
}
