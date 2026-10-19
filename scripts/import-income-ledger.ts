import {readFileSync,writeFileSync} from 'node:fs';
import {incomeRecordSchema} from '../server/income';
import {incomeRegions} from '../src/data/income-regions';
import {incomeLabels,type IncomeRecord,type IncomePopulation} from '../src/core/income';
interface Entry {name:string;year:number;metric?:IncomeRecord['metric'];values:Partial<Record<IncomePopulation,number|null>>;title:string;url:string;date:string;scope?:string;excerpt?:string;}
// Explicitly curated ledger only. Crawled candidates must be reviewed before using this importer.
const entries=JSON.parse(readFileSync(process.argv[2],'utf8')) as Entry[];
const path='src/data/income-seed.json',records=JSON.parse(readFileSync(path,'utf8')) as IncomeRecord[];
let added=0;
for(const row of entries){
  const region=incomeRegions.find(r=>r.name===row.name);if(!region)throw Error('未知地区：'+row.name);
  const metric=row.metric??'disposable';
  for(const [p,value]of Object.entries(row.values)){
    const population=p as IncomePopulation,id=`${region.code}-${row.year}-${metric}-${population}`;
    const old=records.find(r=>r.id===id);if(old){if(old.value!==value)throw Error('已存在不同金额，须单独修订：'+id);continue;}
    const r:IncomeRecord={id,region:region.code,year:row.year,metric,population,value:value!,unit:'元/人/年',availability:value===null?'notPublished':'available',version:1,scope:row.scope??(metric==='wage'?`${row.name}全行政区域对应城镇单位就业人员全年税前平均工资，区别于在岗职工与规模以上单位口径。`:`${row.name}全市行政区域常住居民全年人均可支配收入，按全体、城镇、农村分别统计；不使用市辖区或省级数值替代。`),source:{title:row.title,url:row.url,publishedAt:row.date,verifiedAt:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),excerpt:row.excerpt??`人工核验转录：${row.year}年${row.name}，${Object.entries(row.values).map(([key,v])=>`${incomeLabels[key as IncomePopulation]} ${v??'原文未单列'}元/人/年`).join('；')}。指标为${metric==='wage'?'就业人员税前年平均工资':'居民人均可支配收入'}，具体范围见统计口径。`}};
    incomeRecordSchema.parse(r);records.push(r);added++;
  }
}
writeFileSync(path,JSON.stringify(records,null,2)+'\n');console.log(JSON.stringify({added,records:records.length}));
