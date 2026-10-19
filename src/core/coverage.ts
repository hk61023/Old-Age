import type {Policy,RegionalReference} from './types';
import {calculationRegions,referenceBase} from './regions';
export interface CoverageRegion {code:string;name:string;cities:{code:string;name:string}[]}
export function calculationCoverage(regions:CoverageRegion[],policies:Policy[],references:RegionalReference[],asOf:string){
  const available=calculationRegions(regions,policies,references,asOf);
  return regions.map(p=>{
    const cities=(available.find(r=>r.code===p.code)?.cities||[]).map(c=>{
      const region=c.code==='440300'?c.code:p.code;
      const policy=policies.find(x=>x.region===region&&x.status==='published'&&x.effectiveFrom.slice(0,7)<=asOf&&(!x.effectiveTo||x.effectiveTo.slice(0,7)>=asOf));
      const base=referenceBase(references.find(r=>r.province===p.code),c.code,asOf);
      return {...c,basis:policy?'local-formula':base?.kind==='baseScenario'?'wage-scenario':'reference',year:policy?.parameterYear??base?.year};
    });
    const required=Math.min(10,p.cities.length);
    return {code:p.code,name:p.name,cities,required,meetsMinimum:cities.length>=required,local:cities.filter(c=>c.basis==='local-formula').length,reference:cities.filter(c=>c.basis==='reference').length,scenario:cities.filter(c=>c.basis==='wage-scenario').length};
  });
}
