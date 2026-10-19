import {mkdirSync,writeFileSync} from 'node:fs';
import {load} from 'cheerio';
import {openStore,regionalReferences} from '../server/store';
import {regionList} from '../server/app';
import {governmentUrl,normalizeSourceUrl,addMonitorSource,listMonitorSources} from '../server/monitor-sources';
import {safeFetch} from '../server/safe-fetch';
import {fetchOfficial} from '../server/watcher';
import {incomeSources} from '../server/income';

const db=openStore(process.argv[2]||'data/policies.sqlite');
const provinces=regionList(),refs=regionalReferences(db),municipal=new Set(['110000','120000','310000','500000']);
const folder=process.argv[3]||'artifacts/monitor-discovery';mkdirSync(folder,{recursive:true});
type Root={url:string;region:string;title:string;depth:number};
const roots:Root[]=refs.map(r=>({url:r.portal.url,region:r.province,title:r.name+'人社',depth:0}));
const seenRoots=new Set<string>(),seenProbes=new Set<string>();let visited=0,checked=0;
const observations:{url:string;region:string;status:string;reason:string;from:string}[]=[];
const directoryPattern=/政策文件|政策法规|规范性文件|通知公告|公告公示|统计公报|统计数据|社会保险|养老保险|平均工资|政府公报|数据发布|政策发布|最新文件|人力资源|社会保障|税务局|统计局/;
function httpsLink(value:string,base:string){try{const u=new URL(value,base);if(u.protocol==='http:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn')))u.protocol='https:';return governmentUrl(u.href)?normalizeSourceUrl(u.href):null;}catch{return null;}}
async function rawPage(url:string){let target=url;for(let n=0;n<4;n++){const r=await safeFetch(target,{signal:AbortSignal.timeout(15000)});if(r.status>=300&&r.status<400){const next=httpsLink(r.headers.get('location')||'',target);if(!next)throw new Error('重定向不属于政府HTTPS');target=next;continue;}if(!r.ok)throw new Error('HTTP '+r.status);const bytes=await r.arrayBuffer(),type=r.headers.get('content-type')||'';if(!type.includes('html'))throw new Error('不是HTML入口');const head=Buffer.from(bytes).subarray(0,2000).toString();const charset=(type+head).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';return {html:new TextDecoder(/gb/i.test(charset)?'gb18030':charset).decode(bytes),url:target};}throw new Error('重定向过多');}
const probes:{url:string;title:string;region:string;department:string;from:string;channel:'policy'|'income'}[]=[];
async function rootWorker(){while(roots.length){const root=roots.shift()!;if(seenRoots.has(root.url))continue;seenRoots.add(root.url);visited++;
  try{
    const {html,url}=await rawPage(root.url),$=load(html);const province=provinces.find(p=>p.code.slice(0,2)===root.region.slice(0,2));
    const candidates:{url:string;title:string}[]=[];
    $('a[href]').each((_,el)=>{const title=($(el).attr('title')||$(el).text()).replace(/\s+/g,'').trim(),link=httpsLink($(el).attr('href')!,url);if(!link||link===url)return;
      const city=province&&!municipal.has(province.code)?province.cities.find(c=>title===c.name||title===c.name.replace(/市$/,'')||title===c.name+'人民政府'||title===c.name+'政府门户网站'):undefined;
      if(city&&root.depth<2&&!seenRoots.has(link))roots.push({url:link,region:city.code,title:city.name+'政府',depth:2});
      if(root.depth===0&&province&&(/省人民政府|自治区人民政府|省政府门户|省政府网站|市人民政府/.test(title))&&new URL(link).hostname!==new URL(url).hostname)roots.push({url:link,region:root.region,title:province.name+'政府',depth:1});
      if(directoryPattern.test(title)&&title.length<70&&!candidates.some(c=>c.url===link))candidates.push({url:link,title});
    });
    if(root.depth===2)addMonitorSource(db,{...root,department:'政府',kind:'entry'},'official-link');
    candidates.sort((a,b)=>Number(/养老|社会保险|统计公报|政策文件|通知公告/.test(b.title))-Number(/养老|社会保险|统计公报|政策文件|通知公告/.test(a.title)));
    for(const c of candidates.slice(0,8))probes.push({...c,title:root.title+' · '+c.title,region:root.region,department:/统计|数据|工资/.test(c.title)?'统计':/税务/.test(c.title)?'税务':'人社/政府',from:url,channel:/统计公报|统计数据|数据发布/.test(c.title)?'income':'policy'});
    observations.push({url,region:root.region,status:'entry',reason:`已提取${candidates.length}个栏目链接，首页不计自动监测`,from:root.url});
  }catch(e){observations.push({url:root.url,region:root.region,status:'manual',reason:String(e),from:root.url});}
  if(visited%10===0)console.log(JSON.stringify({phase:'official-entry-discovery',visited,remaining:roots.length,columns:probes.length}));
}}
// Existing city-authored documents provide verified hosts and breadcrumb links, not guessed domains.
for(const s of incomeSources(db))if(governmentUrl(s.url)&&s.region!=='000000')roots.push({url:s.url,region:s.region,title:s.title.slice(0,30),depth:1});
for(const s of listMonitorSources(db))if(s.kind!=='entry'&&s.origin==='legacy')roots.push({url:s.url,region:s.region,title:s.title.slice(0,30),depth:1});
try{
  await Promise.all([rootWorker(),rootWorker()]);
  const seed=listMonitorSources(db).filter(s=>s.origin==='preset'&&s.kind==='directory').map(s=>({...s,from:'已核对国家部门栏目'}));probes.push(...seed);
  let cursor=0;const hostTime=new Map<string,number>(),active=new Set<string>();
  async function probeWorker(){while(cursor<probes.length){const p=probes[cursor++];if(seenProbes.has(p.channel+':'+p.url))continue;seenProbes.add(p.channel+':'+p.url);const host=new URL(p.url).hostname;
    while(active.has(host)||Date.now()<(hostTime.get(host)||0))await new Promise(r=>setTimeout(r,50));active.add(host);
    const id=addMonitorSource(db,{...p,kind:'directory',topics:p.channel==='income'?['居民收入','平均工资','统计公报']:['养老保险','退休','缴费基数']},'official-link');
    try{const result=await fetchOfficial(p.url);const manual=result.manual||new URL(p.url).pathname==='/';const status=manual?'manual':'automatic',now=new Date().toISOString();db.prepare('UPDATE monitor_sources SET verification=?,last_checked=?,last_success=?,last_error=? WHERE id=? AND origin<>?').run(status,now,manual?null:now,manual?'首页或附件需人工核验':'',id,'admin');observations.push({url:p.url,region:p.region,status,reason:manual?'非可直接解析栏目':`正文${result.content.length}字，相关链接${result.links.length}条`,from:p.from});}
    catch(e){db.prepare("UPDATE monitor_sources SET verification='manual',last_checked=?,last_error=?,failures=failures+1 WHERE id=? AND origin<>'admin'").run(new Date().toISOString(),String(e),id);observations.push({url:p.url,region:p.region,status:'manual',reason:String(e),from:p.from});}
    finally{active.delete(host);hostTime.set(host,Date.now()+1000);}
    checked++;if(checked%10===0)console.log(JSON.stringify({phase:'column-verification',checked,total:probes.length}));
  }}
  await Promise.all([probeWorker(),probeWorker()]);
  const all=listMonitorSources(db),added=all.filter(s=>s.origin==='official-link');
  writeFileSync(folder+'/seed.json',JSON.stringify(added.map(({url,title,region,department,kind,channel,topics,enabled})=>({url,title,region,department,kind,channel,topics,enabled})),null,2));
  const coverage=provinces.map(p=>{const ss=all.filter(s=>s.region.startsWith(p.code.slice(0,2))),missing=municipal.has(p.code)?[]:p.cities.filter(c=>!ss.some(s=>s.region===c.code&&s.kind!=='entry')).map(c=>({code:c.code,name:c.name,status:'未找到独立市级栏目'}));return {code:p.code,name:p.name,registered:ss.length,automatic:ss.filter(s=>s.enabled&&s.verification==='automatic'&&s.kind!=='entry').length,manual:ss.filter(s=>s.verification==='manual').length,missing};});
  const summary={checkedAt:new Date().toISOString(),entriesVisited:visited,columnsChecked:checked,added:added.length,total:all.length,automatic:all.filter(s=>s.enabled&&s.verification==='automatic'&&s.kind!=='entry').length,manual:all.filter(s=>s.verification==='manual').length,coverage,observations};
  writeFileSync(folder+'/report.json',JSON.stringify(summary,null,2));
  writeFileSync(folder+'/覆盖核验报告.md',`# 官方抓取来源覆盖核验\n\n核验时间：${summary.checkedAt}。新增登记${added.length}条，实际核验栏目${checked}条。可自动检查${summary.automatic}条，需人工处理${summary.manual}条；来源登记不代表政策已审核。\n\n|地区|已登记|可自动检查|需人工处理|尚无独立市级栏目|\n|---|---:|---:|---:|---|\n`+coverage.map(p=>`|${p.name}|${p.registered}|${p.automatic}|${p.manual}|${p.missing.map(c=>c.name).join('、')||'—'}|`).join('\n')+'\n\n逐项网址、实际结果与发现页面见report.json。未找到的地区不虚构网址，省级来源不充当独立市级来源。');
  console.log(JSON.stringify({...summary,coverage:undefined,observations:undefined}));
}finally{db.close();}
