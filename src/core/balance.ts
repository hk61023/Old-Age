import { monthNumber } from './engine';
export function balancePresets(asOf:string){
  if(!Number.isFinite(monthNumber(asOf)))return [];
  return [{value:`${Number(asOf.slice(0,4))-1}-12`,label:'上年末实际累计储存额'},
    {value:asOf,label:asOf.endsWith('-12')?'本年末实际累计储存额':'资料截止月实际累计储存额'}];
}
