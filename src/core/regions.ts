import type { RegionalReference,RegionalParameter,RegionalParameterKind,Policy } from './types';
export const parameterLabels:Record<RegionalParameterKind,string>={pensionBase:'养老金计发基数',baseScenario:'工资基数情景（非正式计发标准）',contributionMin:'职工养老缴费下限',contributionMax:'职工养老缴费上限',indexBase:'缴费指数参考工资（分母）'};
export function regionalParameters(ref:RegionalReference,city:string):RegionalParameter[]{
  const overrides=ref.cityParameters[city]||[];
  return [...ref.parameters.filter(p=>!p.excludeCities?.includes(city)&&!overrides.some(o=>o.kind===p.kind&&o.year===p.year)),...overrides].sort((a,b)=>b.year-a.year||a.kind.localeCompare(b.kind));
}
export function referenceBase(ref:RegionalReference|undefined,city:string,asOf:string){
  const applicable=ref?regionalParameters(ref,city).filter(p=>p.from.slice(0,7)<=asOf&&Number.isFinite(p.value)&&p.value>0):[];
  return applicable.find(p=>p.kind==='pensionBase')||applicable.find(p=>p.kind==='baseScenario');
}
// The national directory remains intact for history imports and policy lookup.
export function calculationRegions<T extends {code:string;cities:{code:string}[]}>(regions:T[],policies:Policy[],references:RegionalReference[],asOf:string):T[]{
  return regions.map(region=>({...region,cities:region.cities.filter(city=>{
    if(asOf>='2025-12'&&['500105','500112'].includes(city.code))return false;
    if(asOf<'2025-12'&&city.code==='500157')return false;
    const code=city.code==='440300'?city.code:region.code;
    return policies.some(p=>p.status==='published'&&p.region===code&&p.effectiveFrom.slice(0,7)<=asOf&&(!p.effectiveTo||p.effectiveTo.slice(0,7)>=asOf))||!!referenceBase(references.find(r=>r.province===region.code),city.code,asOf);
  })})).filter(region=>region.cities.length) as T[];
}
