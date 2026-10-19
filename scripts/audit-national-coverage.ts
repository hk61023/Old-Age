import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {calculate,todayMonth,ENGINE_VERSION} from '../src/core/engine';
import {calculationRegions,regionalParameters} from '../src/core/regions';
import type {PersonalInput,Policy,RegionalReference,Scenario} from '../src/core/types';
import type {Region} from '../src/ui/shared';

const root=process.env.AUDIT_BASE_URL||'http://127.0.0.1:3210';
async function get<T>(path:string):Promise<T>{if(process.env.AUDIT_SNAPSHOT_DIR)return JSON.parse(readFileSync(join(process.env.AUDIT_SNAPSHOT_DIR,path.slice(5)+'.json'),'utf8').replace(/^\uFEFF/,'')) as T;const response=await fetch(root+path);if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);return response.json() as Promise<T>;}
const [policyResponse,regions,referenceResponse]=await Promise.all([
  get<{policies:Policy[]}>('/api/policies'),get<Region[]>('/api/regions'),get<{references:RegionalReference[]}>('/api/regional-references')
]);
const policies=policyResponse.policies,references=referenceResponse.references,asOf=todayMonth();
const selectable=calculationRegions(regions,policies,references,asOf);
const selectableCodes=new Set(selectable.flatMap(p=>p.cities.map(c=>c.code)));
const scenario:Scenario={name:'覆盖检查',retirementOffset:0,contributionMultiplier:1,baseGrowth:0,accountInterest:0};
const base:PersonalInput={birth:'1990-06',category:'male60',identity:'employee',asOf,province:'',city:'',insuredProvince:'',insuredCity:'',paidMonths:120,contributionBase:9000,firstInsured:'2016-01',deemedMonths:0,balanceDate:asOf,records:[],recordChoice:'summary',crossProvince:false,household:'',relationship:'',experiences:[],experiencesComplete:false,locationConfirmed:false,specialCase:false};
const errors:string[]=[];
const classify=(r:ReturnType<typeof calculate>)=>r.total!==null?'完整情景金额':r.partialSubtotal!=null?(r.reference?.basis==='wage-scenario'?'工资基数情景部分合计':r.reference?'通用公式部分合计':'省级公式部分合计'):r.basic!==null||r.account!==null?'仅部分分项':r.missing.some(x=>x.includes('必要政策尚未核验'))?'计算政策未接入':'其他阻断';
const rows=regions.flatMap(province=>province.cities.map(city=>{
  const ref=references.find(r=>r.province===province.code);
  if(!ref)errors.push(`${province.name}缺少查询卡`);
  const parameters=ref?regionalParameters(ref,city.code):[];
  for(const p of parameters)if(!Number.isFinite(p.value)||p.value<=0||!p.source.url.startsWith('https://'))errors.push(`${province.name}/${city.name}参数无效`);
  const cases=(['employee','flexible'] as const).flatMap(identity=>(['基础资料','补全账户和指数'] as const).flatMap(profile=>[0,-18].map(offset=>{
    const input={...base,identity,province:province.code,insuredProvince:province.code,city:city.code,insuredCity:city.code,...(profile==='补全账户和指数'?{accountBalance:100000,averageIndex:1}:{})};
    const r=calculate(input,{...scenario,retirementOffset:offset},policies,references);
    for(const [key,value] of Object.entries(r))if(typeof value==='number'&&!Number.isFinite(value))errors.push(`${province.name}/${city.name}/${key}金额或月份非有限值`);
    if(r.total!==null&&(r.missing.length||r.status!=='complete'))errors.push(`${city.name}不完整却输出全额`);
    if(r.partialSubtotal!=null&&(r.total!==null||r.status!=='partial'))errors.push(`${city.name}部分合计状态错误`);
    if(!r.statutoryMonth||!r.retirementMonth)errors.push(`${city.name}有效资料没有退休日期`);
    if(selectableCodes.has(city.code)&&(r.basic===null||r.account===null||(r.total===null&&r.partialSubtotal==null)))errors.push(`${city.name}/${identity}/${profile}/${offset}可选城市未得到基础与账户合计`);
    if(classify(r)==='其他阻断')errors.push(`${city.name}合成有效资料出现非政策阻断：${r.missing.join('；')}`);
    return {identity,profile,earlyYears:-offset/12,classification:classify(r),policyId:r.policyId,policyVersion:r.policyVersion,retirementMonth:r.retirementMonth,basic:r.basic,account:r.account,transition:r.transition,local:r.local,total:r.total,partialSubtotal:r.partialSubtotal??null,missing:r.missing};
  })));
  return {provinceCode:province.code,province:province.name,cityCode:city.code,city:city.name,referenceParameters:parameters.map(p=>({kind:p.kind,year:p.year,value:p.value,current:p.from.slice(0,7)<=asOf&&(!p.to||p.to.slice(0,7)>=asOf),source:p.source.url})),cases};
}));
const count=(values:string[])=>Object.fromEntries([...new Set(values)].map(k=>[k,values.filter(v=>v===k).length]));
const provinceRows=regions.map(region=>{
  const cities=rows.filter(r=>r.provinceCode===region.code);
  const selectableCities=selectable.find(p=>p.code===region.code)?.cities.length||0,required=Math.min(10,region.cities.length);
  if(selectableCities<required)errors.push(`${region.name}仅${selectableCities}个可算地区，未达到${required}项目标`);
  return {province:region.name,cityCount:cities.length,selectableCities,required,meetsMinimum:selectableCities>=required,referenceCities:cities.filter(c=>c.referenceParameters.length).length,currentReferenceCities:cities.filter(c=>c.referenceParameters.some(p=>p.current)).length,ordinaryCases:count(cities.map(c=>c.cases[0].classification)),examples:cities.filter(c=>/市$/.test(c.city)).slice(0,3).map(c=>c.city).join('、')};
});
const report={checkedAt:new Date().toISOString(),asOf,engineVersion:ENGINE_VERSION,scope:'运行中公共API实际已发布地方政策及已核验参考参数（参考参数仅用于通用分项）；目录全部城市/区县条目；企业和灵活就业；基础与补全资料；法定退休和提前1.5年。检查程序不上传个人资料，只读取公共API。合成样例不是实际待遇或政策有效性审定。',selectableProvinces:calculationRegions(regions,policies,references,asOf).length,selectableCities:calculationRegions(regions,policies,references,asOf).reduce((n,r)=>n+r.cities.length,0),provinceCount:regions.length,cityCount:rows.length,caseCount:rows.reduce((n,r)=>n+r.cases.length,0),ordinaryCityCounts:count(rows.map(c=>c.cases[0].classification)),caseCounts:count(rows.flatMap(c=>c.cases.map(r=>r.classification))),errors,provinceRows,rows};
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/national-coverage-audit.json',JSON.stringify(report,null,2));
const markdown=[`# 全国省市计算显示检查`, '',`检查月份：${asOf}；引擎：${ENGINE_VERSION}。覆盖${report.provinceCount}个省级地区、${report.cityCount}个城市/区县条目，共${report.caseCount}组测算。`, '',`测算下拉可选${report.selectableProvinces}个省级地区、${report.selectableCities}个城市/区县；其余未覆盖条目隐藏，政策查询与历史记录保留全国目录。`,'',report.scope,'',`程序异常：${errors.length}。基础资料城市结果：${JSON.stringify(report.ordinaryCityCounts)}。`, '', '|省份|目录条目|有参考参数条目|有当前适用参考参数条目|基础资料金额显示|','|---|---:|---:|---:|---|',...provinceRows.map(r=>`|${r.province}|${r.cityCount}|${r.referenceCities}|${r.currentReferenceCities}|${Object.entries(r.ordinaryCases).map(([k,v])=>`${k} ${v}`).join('；')}|`),'','“有参考参数”不代表公式已接入；历史参数不代表当前年度已公布。完整金额仅表示该合成普通案例在已发布模型下可合计，并不覆盖当地所有历史和特殊待遇。广东普通资料缺少地方项目核定值，深圳地方补充未核验，杭州外浙江仅给省级公式部分合计。','', '所有城市的逐项参数、来源、分项金额和缺失原因见 national-coverage-audit.json。', '',...errors];
writeFileSync('artifacts/全国省市计算显示检查.md',markdown.join('\n'));
console.log(JSON.stringify({provinceCount:report.provinceCount,cityCount:report.cityCount,caseCount:report.caseCount,ordinaryCityCounts:report.ordinaryCityCounts,caseCounts:report.caseCounts,errors,provinceRows},null,2));
if(errors.length)process.exitCode=1;
