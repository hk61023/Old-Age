import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {regionList} from '../server/app';
import {listMonitorSources} from '../server/monitor-sources';
const db=new DatabaseSync(process.argv[2],{readOnly:true}),folder=process.argv[3];
try{
  mkdirSync(folder,{recursive:true});const sources=listMonitorSources(db);
  const coverage=regionList().map(p=>{const ss=sources.filter(s=>s.region.startsWith(p.code.slice(0,2)));return {name:p.name,registered:ss.length,automatic:ss.filter(s=>s.enabled&&s.kind!=='entry'&&s.verification==='automatic').length,manual:ss.filter(s=>s.verification==='manual').length,unverified:ss.filter(s=>s.verification==='unverified').length,missing:['110000','120000','310000','500000'].includes(p.code)?[]:p.cities.filter(c=>!ss.some(s=>s.region===c.code&&s.kind!=='entry')).map(c=>c.name)};});
  const summary={checkedAt:new Date().toISOString(),total:sources.length,automatic:sources.filter(s=>s.enabled&&s.kind!=='entry'&&s.verification==='automatic').length,manual:sources.filter(s=>s.verification==='manual').length,unverified:sources.filter(s=>s.verification==='unverified').length};
  writeFileSync(folder+'/coverage.json',JSON.stringify({summary,coverage,sources},null,2));
  writeFileSync(folder+'/coverage.md',`# 线上官方来源覆盖报告\n\n生成时间：${summary.checkedAt}。共登记${summary.total}条，可自动检查${summary.automatic}条、需人工处理${summary.manual}条、待首次核验${summary.unverified}条。登记不代表已核验养老金参数；省级来源不计为独立市级覆盖，直辖市区县共用市级来源。\n\n|省级地区|登记|可自动检查|需人工处理|待核验|尚无独立市级栏目或文件的目录地区|\n|---|---:|---:|---:|---:|---|\n`+coverage.map(p=>`|${p.name}|${p.registered}|${p.automatic}|${p.manual}|${p.unverified}|${p.missing.join('、')||'—'}|`).join('\n')+'\n\n逐来源网址、归属、状态、最近成功与失败原因见coverage.json。仅有首页的地区未算作独立市级文件来源。');
  console.log(JSON.stringify(summary));
}finally{db.close();}
