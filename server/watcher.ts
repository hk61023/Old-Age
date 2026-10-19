import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { setSetting, setting, type Store } from './store';
import { incomeSources,captureIncome,statisticsUrl } from './income';
import {safeFetch} from './safe-fetch';
import {listMonitorSources,getMonitorSource,addMonitorSource,normalizeSourceUrl} from './monitor-sources';
export function officialUrl(url:string){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn'))&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}}
export async function fetchOfficial(url:string,fetcher:typeof fetch=safeFetch,allowed=officialUrl,topics:string[]=[]):Promise<{content:string;links:{url:string;title:string}[];manual:boolean;pages?:{url:string;title:string}[]}>{
  let target=url;const signal=AbortSignal.timeout(15000);
  for(let attempt=0;attempt<4;attempt++){
    if(!allowed(target))throw new Error('仅允许已认可的HTTPS官方来源');
    const response=await fetcher(target,{redirect:'manual',signal,headers:{'User-Agent':'ZhiyanLocalPolicyMonitor/1.0'}});
    if(response.status>=300&&response.status<400){target=new URL(response.headers.get('location')||'',target).href;continue;}
    if(!response.ok)throw new Error(`来源返回HTTP ${response.status}`);
    if(!response.body)throw new Error('正文为空');
    const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error('正文大于2MB，需人工核验');}chunks.push(value);}
    const buffer=Buffer.concat(chunks);const type=response.headers.get('content-type')||'';
    if(!type.includes('html')&&!type.includes('text/plain'))return {content:`附件需人工提取核验；内容SHA256：${createHash('sha256').update(buffer).digest('hex')}；来源：${target}`,links:[],manual:true};
    const charset=(type+' '+buffer.subarray(0,2000).toString()).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';
    const raw=new TextDecoder(/gb/i.test(charset)?'gb18030':charset).decode(buffer);const $=load(raw);
    const pages:{url:string;title:string}[]=[];
    $('a[href]').each((_,el)=>{const title=$(el).text().trim();if(!/^(下一页|下页|下一頁|next|[123])$/i.test(title))return;try{const u=new URL($(el).attr('href')!,target),base=new URL(target);if(allowed(u.href)&&u.origin===base.origin&&u.href!==base.href)pages.push({url:normalizeSourceUrl(u.href),title});}catch{}});
    $('script,style,nav,header,footer,noscript').remove();
    const preferred=$('article,.TRS_Editor,.article-content,#zoom,#Zoom,.view.TRS_UEDITOR,.content').filter((_,el)=>$(el).text().trim().length>150).first();
    const text=(preferred.length?preferred:$('body')).text().replace(/\s+/g,' ').trim();
    if(text.length<100||/验证码|访问过于频繁|安全验证|访问验证/.test(text.slice(0,500)))throw new Error('未取得可核验正文，可能需要人工访问');
    const links:{url:string;title:string}[]=[];
    $('a[href]').each((_,el)=>{const title=$(el).text().trim();if(!/养老|退休|社会保险.*基数|缴费.*基数|居民.*收[入支]|可支配收入|平均工资|统计公报/.test(title)&&!topics.some(t=>title.includes(t)))return;try{const url=normalizeSourceUrl(new URL($(el).attr('href')!,target).href);if(allowed(url)&&url!==target&&!links.some(l=>l.url===url))links.push({url,title});}catch{/* ignore malformed links */}});
    return {content:text,links:links.slice(0,20),manual:false,pages:pages.slice(0,2)};
  }throw new Error('重定向次数过多');
}
export function capture(db:Store,url:string,title:string,content:string,reason:string){
  const hash=createHash('sha256').update(content).digest('hex');const old=db.prepare('SELECT * FROM snapshots WHERE url=?').get(url);const now=new Date().toISOString();
  if(old?.hash===hash){db.prepare('UPDATE snapshots SET checked=? WHERE url=?').run(now,url);return false;}
  db.prepare('INSERT OR IGNORE INTO candidates(url,title,hash,previous,content,reason,created) VALUES(?,?,?,?,?,?,?)').run(url,title,hash,String(old?.content||''),content,reason,now);
  db.prepare('INSERT INTO snapshots VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,content=excluded.content,checked=excluded.checked').run(url,hash,content,now);return true;
}
export function beijingDay(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function dueDay(date=new Date()){
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(date));
  return beijingDay(hour<9?new Date(date.getTime()-86400000):date);
}
export function createWatcher(db:Store,fetcher=fetchOfficial,options:{hostIntervalMs?:number;batchSize?:number}={}){
  let running:Promise<void>|null=null,job=0,stopped=false;
  const hosts=new Set<string>(),nextHost=new Map<string,number>();
  const interval=options.hostIntervalMs??1000,batchSize=options.batchSize??400;
  const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
  type Task={id:number;source_id:number;url:string;root_url:string;kind:string;page:number;channel:string};
  function enqueue(sourceId:number,url?:string,kind?:string,page=1,rootUrl?:string){
    const s=getMonitorSource(db,sourceId);if(!s?.enabled)return;
    db.prepare('INSERT OR IGNORE INTO monitor_tasks(job_id,source_id,url,root_url,channel,kind,page) VALUES(?,?,?,?,?,?,?)').run(job,sourceId,url||s.url,rootUrl||s.url,s.channel,kind||s.kind,page);
  }
  function progress(){
    const rows=db.prepare('SELECT status,COUNT(*) n FROM monitor_tasks WHERE job_id=? GROUP BY status').all(job),counts=Object.fromEntries(rows.map(r=>[String(r.status),Number(r.n)]));
    const changes=Number(db.prepare('SELECT COUNT(*) n FROM monitor_tasks WHERE job_id=? AND changed=1').get(job)!.n);
    const total=Object.values(counts).reduce((a,b)=>a+b,0),remaining=(counts.pending||0)+(counts.running||0);
    const errors=db.prepare("SELECT url,error FROM monitor_tasks WHERE job_id=? AND status='failed' ORDER BY id LIMIT 100").all(job);
    db.prepare('UPDATE jobs SET detail=? WHERE id=?').run(JSON.stringify({total,completed:total-remaining,remaining,visited:total-remaining,changes,failed:counts.failed||0,manual:counts.manual||0,skipped:counts.skipped||0,errors,batchSize}),job);
    return remaining;
  }
  async function process(task:Task){
    const s=getMonitorSource(db,task.source_id),now=()=>new Date().toISOString();
    if(!s?.enabled||s.url!==task.root_url){db.prepare("UPDATE monitor_tasks SET status='skipped',finished=?,error=? WHERE id=?").run(now(),'来源已停用或网址已修改',task.id);return;}
    try{
      if(s.channel==='income'&&task.url===s.url)db.prepare('INSERT OR IGNORE INTO income_sources(url,title,kind,region) VALUES(?,?,?,?)').run(s.url,s.title,s.kind,s.region);
      const result=fetcher===fetchOfficial?await fetchOfficial(task.url,safeFetch,s.channel==='income'?statisticsUrl:officialUrl,s.topics):await fetcher(task.url);
      const manual=result.manual||s.kind==='entry';
      const changed=s.channel==='income'?captureIncome(db,task.url,s.title,result.content):capture(db,task.url,s.title,result.content,result.manual?'附件需人工提取':s.kind==='entry'?'部门首页入口，需核验具体栏目':task.kind==='directory'?'官方目录正文变化或首次采集':'原文变化或首次采集，需人工核验');
      db.prepare('UPDATE monitor_tasks SET status=?,finished=?,changed=? WHERE id=?').run(manual?'manual':'success',now(),changed?1:0,task.id);
      db.prepare('UPDATE monitor_sources SET last_checked=?,last_success=?,last_error=?,failures=0,verification=? WHERE id=?').run(now(),now(),manual?'仅入口或附件，需人工核验':'',manual?'manual':'automatic',s.id);
      if(task.kind==='directory'){
        for(const link of result.links.slice(0,20)){
          const allowed=s.channel==='income'?statisticsUrl:officialUrl;if(!allowed(link.url))continue;
          const child=addMonitorSource(db,{...s,url:link.url,title:link.title,kind:'article'},'discovered');
          if(s.channel==='income')db.prepare('INSERT OR IGNORE INTO income_sources(url,title,region) VALUES(?,?,?)').run(normalizeSourceUrl(link.url),link.title,s.region);
          enqueue(child);
        }
        const pages=Number(db.prepare("SELECT COUNT(*) n FROM monitor_tasks WHERE job_id=? AND source_id=? AND kind='directory'").get(job,s.id)!.n);
        let used=pages;for(const p of result.pages||[]){if(used>=3)break;const u=new URL(p.url);if(u.origin!==new URL(s.url).origin||!officialUrl(u.href))continue;const before=Number(db.prepare('SELECT COUNT(*) n FROM monitor_tasks WHERE job_id=? AND source_id=?').get(job,s.id)!.n);enqueue(s.id,normalizeSourceUrl(p.url),'directory',task.page+1,task.root_url);const after=Number(db.prepare('SELECT COUNT(*) n FROM monitor_tasks WHERE job_id=? AND source_id=?').get(job,s.id)!.n);if(after>before)used++;}
      }
    }catch(e){const error=e instanceof Error?e.message:String(e);db.prepare("UPDATE monitor_tasks SET status='failed',finished=?,error=? WHERE id=?").run(now(),error,task.id);db.prepare("UPDATE monitor_sources SET last_checked=?,last_error=?,failures=failures+1,verification='manual' WHERE id=?").run(now(),error,s.id);if(s.channel==='income')db.prepare('UPDATE income_sources SET last_checked=?,last_error=? WHERE url=?').run(now(),error,s.url);}
  }
  async function batch(){
    let claimed=0;
    async function worker(){while(!stopped&&claimed<batchSize){
      const pending=db.prepare("SELECT id,source_id,url,root_url,kind,page,channel FROM monitor_tasks WHERE job_id=? AND status='pending' ORDER BY id LIMIT 400").all(job) as unknown as Task[];
      if(!pending.length)return;
      const task=pending.find(t=>{const host=new URL(t.url).hostname;return !hosts.has(host)&&(nextHost.get(host)||0)<=Date.now();});
      if(!task){await pause(50);continue;}
      const host=new URL(task.url).hostname;hosts.add(host);claimed++;
      db.prepare("UPDATE monitor_tasks SET status='running',started=? WHERE id=?").run(new Date().toISOString(),task.id);
      try{await process(task);}finally{hosts.delete(host);nextHost.set(host,Date.now()+interval);progress();}
    }}
    await Promise.all([worker(),worker()]);
  }
  async function perform(sourceId?:number){
    // Preserve the existing income channel and its independently approved host list.
    for(const s of incomeSources(db))addMonitorSource(db,{...s,channel:'income',department:'统计',topics:['居民收入','平均工资','统计公报']},'income-legacy');
    const resume=db.prepare("SELECT j.id FROM jobs j WHERE j.status IN ('interrupted','running') AND EXISTS(SELECT 1 FROM monitor_tasks t WHERE t.job_id=j.id AND t.status IN ('pending','running')) ORDER BY j.id LIMIT 1").get();
    job=resume?Number(resume.id):Number(db.prepare("INSERT INTO jobs(started,status) VALUES(?,'running')").run(new Date().toISOString()).lastInsertRowid);
    db.prepare("UPDATE jobs SET status='running',finished=NULL WHERE id=?").run(job);
    if(!resume){if(sourceId!==undefined)enqueue(sourceId);else{for(const s of listMonitorSources(db))if(s.enabled)enqueue(s.id);setSetting(db,'lastCheckDay',dueDay());}}
    else if(sourceId!==undefined)enqueue(sourceId);
    try{
      while(!stopped&&progress()>0){await batch();await pause(0);}
      progress();const failed=Number(db.prepare("SELECT COUNT(*) n FROM monitor_tasks WHERE job_id=? AND status='failed'").get(job)!.n);
      db.prepare('UPDATE jobs SET status=?,finished=? WHERE id=?').run(stopped?'interrupted':failed?'partial':'success',new Date().toISOString(),job);
    }catch(e){db.prepare("UPDATE monitor_tasks SET status='pending' WHERE job_id=? AND status='running'").run(job);db.prepare("UPDATE jobs SET status='interrupted',finished=?,detail=? WHERE id=?").run(new Date().toISOString(),JSON.stringify({error:String(e),resumable:true}),job);}
  }
  function run(sourceId?:number){if(stopped)return Promise.resolve();if(running){if(sourceId!==undefined&&job)enqueue(sourceId);return running;}running=perform(sourceId).finally(()=>{running=null;});return running;}
  function tick(){if(stopped)return;const pending=db.prepare("SELECT 1 FROM monitor_tasks t JOIN jobs j ON j.id=t.job_id WHERE j.status='interrupted' AND t.status='pending' LIMIT 1").get();if(pending||setting(db,'lastCheckDay')!==dueDay())void run();}
  async function stop(){stopped=true;await running;}
  return {run,tick,stop,isRunning:()=>!!running};
}
