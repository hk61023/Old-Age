import type {Store} from './store';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {monitorPresets} from '../src/data/monitor-presets';
import type {RegionalReference} from '../src/core/types';
import monitorSeed from '../src/data/monitor-seed.json';
export interface MonitorSource {id:number;url:string;title:string;region:string;department:string;kind:'article'|'directory'|'entry';channel:'policy'|'income';topics:string[];enabled:boolean;verification:string;last_checked:string|null;last_success:string|null;last_error:string;failures:number;origin:string;created:string;updated:string}
export function governmentUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn'))&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}}
export function normalizeSourceUrl(value:string){const u=new URL(value.trim());u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_'))u.searchParams.delete(k);u.searchParams.sort();return u.href;}
const decode=(r:Record<string,unknown>):MonitorSource=>({...r,topics:JSON.parse(String(r.topics)),enabled:r.enabled===1}) as MonitorSource;
export function listMonitorSources(db:Store){return db.prepare('SELECT * FROM monitor_sources ORDER BY region,department,id').all().map(decode);}
export function getMonitorSource(db:Store,id:number){const r=db.prepare('SELECT * FROM monitor_sources WHERE id=?').get(id);return r?decode(r):undefined;}
export function addMonitorSource(db:Store,s:{url:string;title:string;region?:string;department?:string;kind?:string;channel?:string;topics?:string[];enabled?:boolean},origin='preset'){
  const url=normalizeSourceUrl(s.url),now=new Date().toISOString();
  const entry=new URL(url).pathname==='/'&&s.kind!=='article',kind=s.kind==='article'?'article':entry?'entry':s.kind||'directory';
  db.prepare(`INSERT OR IGNORE INTO monitor_sources(url,title,region,department,kind,channel,topics,enabled,verification,last_error,origin,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(url,s.title,s.region||'000000',s.department||'官方来源',kind,s.channel||'policy',JSON.stringify(s.topics||['养老保险','缴费基数','退休','平均工资']),s.enabled===false?0:1,entry?'manual':'unverified',entry?'部门首页仅作入口，不代表已接入具体栏目':'',origin,now,now);
  return Number(db.prepare('SELECT id FROM monitor_sources WHERE channel=? AND url=?').get(s.channel||'policy',url)!.id);
}
export function initMonitorSources(db:Store,legacy:{url:string;title:string;kind:string}[],refs:RegionalReference[],income:{url:string;title:string;kind:string;region:string}[]=[]){
  db.exec(`CREATE TABLE IF NOT EXISTS monitor_sources(id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT NOT NULL,region TEXT NOT NULL,department TEXT NOT NULL,kind TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'policy',topics TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,verification TEXT NOT NULL DEFAULT 'unverified',last_checked TEXT,last_success TEXT,last_error TEXT NOT NULL DEFAULT '',failures INTEGER NOT NULL DEFAULT 0,origin TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(channel,url));
    CREATE TABLE IF NOT EXISTS monitor_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL,source_id INTEGER NOT NULL,url TEXT NOT NULL,root_url TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,page INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'pending',started TEXT,finished TEXT,changed INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',UNIQUE(job_id,channel,url));
    CREATE INDEX IF NOT EXISTS monitor_tasks_job ON monitor_tasks(job_id,status,id);
    CREATE INDEX IF NOT EXISTS monitor_sources_region ON monitor_sources(region,enabled);`);
  db.prepare("UPDATE monitor_tasks SET status='pending',started=NULL WHERE status='running'").run();
  const scope=new Map<string,string>();for(const r of refs){scope.set(r.portal.url,r.province);for(const p of r.parameters)scope.set(p.source.url,r.province);for(const [city,ps]of Object.entries(r.cityParameters))for(const p of ps)if(!scope.has(p.source.url))scope.set(p.source.url,city);}
  for(const s of legacy){if(!governmentUrl(s.url))continue;const host=new URL(s.url).hostname;
    const region=scope.get(s.url)||refs.find(r=>new URL(r.portal.url).hostname===host)?.province||'000000';
    addMonitorSource(db,{...s,region,kind:s.kind==='directory'?'directory':'article'},'legacy');
  }
  for(const s of monitorPresets)addMonitorSource(db,{...s,kind:'directory'},'preset');
  for(const s of monitorSeed as Parameters<typeof addMonitorSource>[1][])addMonitorSource(db,s,'verified-preset');
  for(const s of income)addMonitorSource(db,{...s,channel:'income',department:'统计',topics:['居民收入','平均工资','统计公报']},'income-legacy');
}
const sourceSchema=z.object({url:z.string().url().refine(governmentUrl,'只接受政府HTTPS网址'),title:z.string().trim().min(2).max(300),region:z.string().regex(/^\d{6}$/),department:z.string().trim().min(1).max(80),kind:z.enum(['article','directory','entry']),channel:z.enum(['policy','income']),topics:z.array(z.string().trim().min(1).max(60)).min(1).max(15),enabled:z.boolean()}).strict();
export function registerMonitorRoutes(app:FastifyInstance,db:Store,watcher:{run:(sourceId?:number)=>Promise<void>;isRunning:()=>boolean},regions:()=>{code:string;name:string;cities:{code:string;name:string}[]}[]){
  function log(action:string,detail:string){db.prepare('INSERT INTO audit(action,detail,created) VALUES(?,?,?)').run(action,detail,new Date().toISOString());}
  const validRegions=()=>new Set(['000000',...regions().flatMap(p=>[p.code,...p.cities.map(c=>c.code)])]);
  app.get('/api/admin/sources',async()=>({sources:listMonitorSources(db),regions:regions(),running:watcher.isRunning()}));
  app.post('/api/admin/sources',async(req,reply)=>{
    const s=sourceSchema.parse(req.body);if(!validRegions().has(s.region))throw new Error('未知地区');
    const url=normalizeSourceUrl(s.url);if(db.prepare('SELECT id FROM monitor_sources WHERE url=? AND channel=?').get(url,s.channel))return reply.code(409).send({error:'该分类已登记此网址，请编辑原来源'});
    const id=addMonitorSource(db,s,'admin');log('monitor-add',`来源${id}：${s.title}`);return {id};
  });
  app.put('/api/admin/sources/:id',async(req)=>{
    const id=Number((req.params as {id:string}).id),old=getMonitorSource(db,id);if(!old)throw new Error('来源不存在');
    const s=sourceSchema.parse(req.body);if(!validRegions().has(s.region))throw new Error('未知地区');if(s.channel!==old.channel)throw new Error('已有来源不能跨分类修改，请另建来源');
    const url=normalizeSourceUrl(s.url);if(db.prepare('SELECT id FROM monitor_sources WHERE url=? AND channel=? AND id<>?').get(url,s.channel,id))throw new Error('该网址已登记');
    db.prepare(`UPDATE monitor_sources SET url=?,title=?,region=?,department=?,kind=?,topics=?,enabled=?,origin='admin',updated=?,verification=CASE WHEN url<>? THEN 'unverified' ELSE verification END WHERE id=?`).run(url,s.title,s.region,s.department,s.kind,JSON.stringify(s.topics),s.enabled?1:0,new Date().toISOString(),url,id);
    log('monitor-edit',`来源${id}：${s.enabled?'启用/修改':'停用'} ${s.title}`);return {ok:true};
  });
  app.post('/api/admin/sources/:id/check',async(req)=>{const id=Number((req.params as {id:string}).id),s=getMonitorSource(db,id);if(!s||!s.enabled)throw new Error('来源不存在或已停用');void watcher.run(id);return {ok:true};});
  app.get('/api/admin/sources/:id/history',async(req)=>({history:db.prepare('SELECT id,job_id,url,status,started,finished,changed,error FROM monitor_tasks WHERE source_id=? ORDER BY id DESC LIMIT 50').all(Number((req.params as {id:string}).id))}));
}
