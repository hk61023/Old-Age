export type IncomeMetric = 'disposable' | 'median' | 'wage';
export type IncomePopulation = 'all' | 'urban' | 'rural' | 'private' | 'nonPrivate';
export interface IncomeRegion { code:string; name:string; province:string; level:'national'|'province'|'city'|'municipality'; groups:string[]; }
export interface IncomeSource { title:string; url:string; publishedAt:string; verifiedAt:string; excerpt:string; }
export interface IncomeRecord { id:string; region:string; year:number; metric:IncomeMetric; population:IncomePopulation; value:number|null; unit:'元/人/年'; availability:'available'|'notPublished'; growth?:number; scope:string; source:IncomeSource; version:number; }
export interface IncomePayload { records:IncomeRecord[]; regions:IncomeRegion[]; coverage:ReturnType<typeof incomeCoverage>; rankingYear:number; }
export const incomeLabels:Record<IncomePopulation,string>={all:'全体居民',urban:'城镇居民',rural:'农村居民',private:'城镇私营单位',nonPrivate:'城镇非私营单位'};
export function latestIncome(records:IncomeRecord[],region:string,metric:IncomeMetric,population:IncomePopulation,year?:number){
  const ordered=records.filter(r=>r.region===region&&r.metric===metric&&r.population===population&&(year===undefined||r.year===year)).sort((a,b)=>b.year-a.year||b.version-a.version);
  // Respect the newest revision of each year before considering an older year.
  const latestVersions=ordered.filter((r,i)=>ordered.findIndex(x=>x.year===r.year)===i);
  return year===undefined?(latestVersions.find(r=>r.availability==='available'&&r.value!==null)??latestVersions[0]):latestVersions[0];
}
export function annualIncome(value:number,period:'annual'|'monthly',extra=0,members=1){
  if(!Number.isFinite(value)||value<0)throw new Error('收入须为大于或等于0的有限金额');
  if(!Number.isFinite(extra)||extra<0)throw new Error('额外年度收入须为大于或等于0的有限金额');
  if(!Number.isSafeInteger(members)||members<1)throw new Error('家庭常住人数须为大于或等于1的整数，包含无收入成员');
  const total=(period==='monthly'?value*12+extra:value)/members;
  if(!Number.isFinite(total))throw new Error('金额过大，请检查输入');
  return total;
}
export function compareIncome(annual:number,benchmark:number){
  if(!Number.isFinite(annual)||annual<0||!Number.isFinite(benchmark)||benchmark<=0)throw new Error('比较需要有效收入及大于0的官方参照值');
  return {ratio:annual/benchmark,percent:(annual/benchmark-1)*100,annualGap:annual-benchmark,monthlyGap:(annual-benchmark)/12,targetGap:Math.max(0,benchmark-annual)};
}
export function projectIncome(annual:number,baseYear:number,targetYear:number,growth:number){
  if(!Number.isFinite(annual)||annual<=0||!Number.isInteger(baseYear)||!Number.isInteger(targetYear)||targetYear<baseYear||!Number.isFinite(growth)||growth<=-100)throw new Error('增长率须大于-100%，目标年份不得早于基准年份');
  const value=annual*(1+growth/100)**(targetYear-baseYear);
  if(!Number.isFinite(value)||value<=0)throw new Error('情景结果超出有效范围，请调整增长率');return value;
}
export function commonIncomeYear(records:IncomeRecord[],regions:string[],metric:IncomeMetric,population:IncomePopulation){
  if(!regions.length)return null;
  const years=records.filter(r=>r.region===regions[0]&&r.metric===metric&&r.population===population&&r.value!==null&&r.availability==='available').map(r=>r.year);
  return [...new Set(years)].sort((a,b)=>b-a).find(y=>regions.every(code=>{const r=latestIncome(records,code,metric,population,y);return r?.value!==null&&r?.availability==='available';}))??null;
}
export function incomeCoverage(records:IncomeRecord[],regions:IncomeRegion[]){
  const has=(code:string)=>records.some(r=>r.region===code&&r.metric==='disposable'&&r.availability==='available'&&r.value!==null);
  const count=(items:IncomeRegion[])=>({complete:items.filter(r=>has(r.code)).length,total:items.length});
  return {provinces:count(regions.filter(r=>r.level==='province'||r.level==='municipality')),zhejiang:count(regions.filter(r=>r.groups.includes('zhejiang'))),gdp30:count(regions.filter(r=>r.groups.includes('gdp30'))),gdp100:count(regions.filter(r=>r.groups.includes('gdp100'))),cities:count(regions.filter(r=>r.groups.includes('required')))};
}
