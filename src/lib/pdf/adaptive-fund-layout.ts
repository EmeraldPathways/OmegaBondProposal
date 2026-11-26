/**
 * Layout strategy for larger Omega portfolios.
 * All portfolios with <=5 selected funds retain the approved legacy design.
 */
export function isExpandedPortfolio(fundCount:number):boolean{
  return fundCount>=6&&fundCount<=10;
}
export function splitPerformanceFundGroups<T>(funds:readonly T[]):T[][]{
  if(!isExpandedPortfolio(funds.length))return funds.length?[Array.from(funds)]:[];
  const groupCount=Math.ceil(funds.length/5);
  const base=Math.floor(funds.length/groupCount);
  const extra=funds.length%groupCount;
  const result:T[][]=[];
  let position=0;
  for(let i=0;i<groupCount;i++){
    const size=base+(i<extra?1:0);
    result.push(funds.slice(position,position+size));
    position+=size;
  }
  return result;
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
