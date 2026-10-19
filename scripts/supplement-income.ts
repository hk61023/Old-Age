import {readFileSync,writeFileSync} from 'node:fs';
import {incomeRecordSchema} from '../server/income';
import {incomeRegions} from '../src/data/income-regions';
import type {IncomeRecord} from '../src/core/income';
// Input is a manually verified source ledger, not automatically scraped candidates.
const input=process.argv[2];if(!input)throw new Error('请提供已人工核验的来源账本JSON路径');
interface Entry {region:string;year:number;private?:number|null;nonPrivate?:number|null;title:string;url:string;publishedAt:string;excerpt:string;scope?:string;}
const ledger=JSON.parse(readFileSync(input,'utf8')) as Entry[];
const path='src/data/income-seed.json',records=JSON.parse(readFileSync(path,'utf8')) as IncomeRecord[];
let added=0;
for(const row of ledger)for(const population of ['private','nonPrivate'] as const){
  const value=row[population];if(value===undefined)continue;
  const id=`${row.region}-${row.year}-wage-${population}`,old=records.find(r=>r.id===id);
  if(old){if(old.value!==value)throw new Error(`金额冲突，须人工修订：${id}`);continue;}
  const name=incomeRegions.find(r=>r.code===row.region)?.name;
  const record:IncomeRecord={id,region:row.region,year:row.year,metric:'wage',population,value,unit:'元/人/年',availability:value===null?'notPublished':'available',scope:row.scope||`${name}全行政区域城镇${population==='private'?'私营':'非私营'}单位就业人员全年税前平均工资；不以在岗职工、规模以上单位或社保全口径工资替代。`,source:{title:row.title,url:row.url,publishedAt:row.publishedAt,verifiedAt:'2026-10-19',excerpt:row.excerpt},version:1};
  incomeRecordSchema.parse(record);records.push(record);added++;
}
writeFileSync(path,JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify({added,total:records.length,wages:records.filter(r=>r.metric==='wage').length,regionsWithWages:new Set(records.filter(r=>r.metric==='wage'&&r.value!==null).map(r=>r.region)).size}));
