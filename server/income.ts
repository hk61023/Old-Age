import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store';
import { incomeCoverage, type IncomeRecord } from '../src/core/income';
import { incomeRegions, INCOME_RANKING_YEAR } from '../src/data/income-regions';
import seed from '../src/data/income-seed.json';

const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const parsed=new Date(s);return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===s&&s<=day();},'日期无效或在未来');
// Government-issued statistical communiques also appear in these official newspaper editions.
const officialPublicationHosts=new Set(['epaper.scdaily.cn','szb.eyesnews.cn','online-beta.foshanplus.com','epaper.tibet3.com','epaper.huanbohainews.com.cn','www.dl-library.net.cn','www.cdrb.com.cn','www.qhnews.com']);
// Only this identified, bureau-authored full communique is accepted from its syndicated host.
const identifiedCommuniques=new Set(['https://finance.sina.com.cn/jjxw/2026-04-15/doc-inhupeis3814625.shtml']);
export function statisticsUrl(url:string){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='gov.cn'||u.hostname.endsWith('.gov.cn')||officialPublicationHosts.has(u.hostname)||identifiedCommuniques.has(u.href))&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}}
const official=z.string().url().refine(statisticsUrl,'必须为HTTPS政府网站或已列入清单的官方公报刊载页');
export const incomeRecordSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9-]+$/).max(100),region:z.string().refine(s=>incomeRegions.some(r=>r.code===s),'地区不在收入目录中'),year:z.number().int().min(2000).refine(y=>y<Number(day().slice(0,4)),'只能录入完整历史年度'),metric:z.enum(['disposable','median','wage']),population:z.enum(['all','urban','rural','private','nonPrivate']),value:z.number().finite().positive().max(100000000).nullable(),unit:z.literal('元/人/年'),availability:z.enum(['available','notPublished']),growth:z.number().finite().optional(),scope:z.string().min(4).max(2000),source:z.object({title:z.string().min(4).max(300),url:official,publishedAt:z.string().max(50),verifiedAt:date,excerpt:z.string().min(10).max(20000)}).strict(),version:z.number().int().positive()}).strict().superRefine((r,c)=>{
  if((r.metric==='wage')!==['private','nonPrivate'].includes(r.population))c.addIssue({code:'custom',message:'工资必须区分私营/非私营；居民收入须区分全体/城镇/农村'});
  if((r.availability==='available')!==(r.value!==null))c.addIssue({code:'custom',message:'已公布须有金额；未单独公布须为空并提供查证原文'});
  if(r.source.publishedAt!==''&&!date.safeParse(r.source.publishedAt).success&&!(/^\d{4}-(0[1-9]|1[0-2])$/.test(r.source.publishedAt)&&r.source.publishedAt<=day().slice(0,7)))c.addIssue({code:'custom',message:'发布日期须为有效的YYYY-MM-DD或YYYY-MM，未标注可留空'});
  const key=`${r.region}-${r.year}-${r.metric}-${r.population}`;if(r.id!==key)c.addIssue({code:'custom',message:`记录ID须为${key}`});
});
export function initIncome(db:Store){
  db.exec(`CREATE TABLE IF NOT EXISTS income_records(id TEXT NOT NULL,version INTEGER NOT NULL,active INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,version));
    CREATE TABLE IF NOT EXISTS income_candidates(id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT NOT NULL,hash TEXT NOT NULL,content TEXT NOT NULL,proposal TEXT,note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL,UNIQUE(url,hash));
    CREATE TABLE IF NOT EXISTS income_sources(url TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'article',region TEXT NOT NULL DEFAULT '000000',last_checked TEXT,last_error TEXT);
    CREATE TABLE IF NOT EXISTS income_snapshots(url TEXT PRIMARY KEY,hash TEXT NOT NULL,content TEXT NOT NULL,checked TEXT NOT NULL);`);
  for(const raw of seed){const r=incomeRecordSchema.parse(raw);if(!db.prepare('SELECT 1 FROM income_records WHERE id=?').get(r.id))db.prepare('INSERT INTO income_records VALUES(?,?,1,?)').run(r.id,r.version,JSON.stringify(r));
    db.prepare('INSERT OR IGNORE INTO income_sources(url,title,region) VALUES(?,?,?)').run(r.source.url,r.source.title,r.region);
  }
  const directories=[['https://zjzd.stats.gov.cn/gjtjjjxdcd/dcsj/zsjsj/','长三角城市民生调查指标目录','330400'],['https://www.stats.gov.cn/sj/zxfb/','国家统计局最新统计发布目录','000000'],['https://tjj.gz.gov.cn/stats_newtjyw/tjsj/tjgb/index.html','广州统计公报目录','440100'],['https://www.ln.gov.cn/zwgkx/tjgb2/shizfgzbg/dls/','大连统计公报官方目录','210200']];
  for(const[url,title,region]of directories)db.prepare("INSERT OR IGNORE INTO income_sources(url,title,kind,region) VALUES(?,?,'directory',?)").run(url,title,region);
}
export function publishedIncome(db:Store):IncomeRecord[]{return db.prepare('SELECT body FROM income_records WHERE active=1 ORDER BY id').all().map(r=>JSON.parse(String(r.body)));}
export function incomeSources(db:Store){return db.prepare('SELECT * FROM income_sources ORDER BY url').all() as {url:string;title:string;kind:string;region:string;last_checked:string|null;last_error:string|null}[];}
export function captureIncome(db:Store,url:string,title:string,content:string){
  const hash=createHash('sha256').update(content).digest('hex'),now=new Date().toISOString();
  const old=db.prepare('SELECT hash FROM income_snapshots WHERE url=?').get(url);
  db.prepare('INSERT INTO income_snapshots VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,content=excluded.content,checked=excluded.checked').run(url,hash,content,now);
  db.prepare('UPDATE income_sources SET last_checked=?,last_error=NULL WHERE url=?').run(now,url);
  if(old?.hash===hash)return false;
  const source=incomeSources(db).find(s=>s.url===url),known=db.prepare('SELECT body FROM income_records WHERE (id,version) IN (SELECT id,MAX(version) FROM income_records GROUP BY id)').all().map(r=>JSON.parse(String(r.body)) as IncomeRecord).filter(r=>r.source.url===url);
  const proposal=source?.kind==='directory'||new Set(known.map(r=>r.region)).size>1?[]:extractIncomeProposal(content,title,source?.region||'',url,known);
  db.prepare('INSERT OR IGNORE INTO income_candidates(url,title,hash,content,proposal,created) VALUES(?,?,?,?,?,?)').run(url,title,hash,content,proposal.length?JSON.stringify(proposal):null,now);return true;
}
export function extractIncomeProposal(content:string,title:string,region:string,url:string,known:IncomeRecord[]=[]):IncomeRecord[]{
  if(!incomeRegions.some(r=>r.code===region)||/季度|上半年|前三|1[—-](?:[1-9]|10|11)月/.test(title))return [];
  const year=Number(title.match(/(20\d{2})年/)?.[1]);if(!year||year>=Number(day().slice(0,4)))return [];
  const text=content.replace(/\s+/g,'');const proposal:IncomeRecord[]=[];
  const rules:[IncomeRecord['metric'],IncomeRecord['population'],RegExp][]=[
    ['disposable','all',/(?:全体|全市|全省|全区)居民人均可支配收入(?:为|达)?([\d,.]+)(万元|元)/g],
    ['disposable','urban',/城镇(?:常住)?居民人均可支配收入(?:为|达)?([\d,.]+)(万元|元)/g],
    ['disposable','rural',/农村(?:常住)?居民人均可支配收入(?:为|达)?([\d,.]+)(万元|元)/g],
    ['wage','private',/城镇私营单位就业人员年平均工资(?:为|达)?([\d,.]+)(万元|元)/g],
    ['wage','nonPrivate',/城镇非私营单位就业人员年平均工资(?:为|达)?([\d,.]+)(万元|元)/g]];
  for(const[metric,population,regex]of rules){const matches=[...text.matchAll(regex)],values=[...new Set(matches.map(m=>Number(m[1].replaceAll(',',''))*(m[2]==='万元'?10000:1)))];if(values.length!==1||!Number.isFinite(values[0])||values[0]<=0)continue;
    const id=`${region}-${year}-${metric}-${population}`,old=known.find(r=>r.id===id);
    proposal.push({id,region,year,metric,population,value:values[0],unit:'元/人/年',availability:'available',scope:'自动提取的全年候选，须人工核对全地区范围及人群口径后发布。',source:{title,url,publishedAt:'',verifiedAt:day(),excerpt:matches[0][0]},version:(old?.version||0)+1});
  }return proposal;
}
export function registerIncomeRoutes(app:FastifyInstance,db:Store,runCheck:()=>Promise<void>){
  const log=(action:string,detail:string)=>db.prepare('INSERT INTO audit(action,detail,created) VALUES(?,?,?)').run(action,detail,new Date().toISOString());
  app.get('/api/income-statistics',async req=>{
    const q=z.object({region:z.string().regex(/^\d{6}$/).optional(),year:z.coerce.number().int().min(2000).max(2100).optional(),group:z.enum(['zhejiang','gdp30','required']).optional()}).strict().parse(req.query);
    const all=publishedIncome(db),regions=incomeRegions.filter(r=>!q.group||r.groups.includes(q.group));
    return {records:all.filter(r=>(!q.region||r.region===q.region)&&(!q.year||r.year===q.year)&&(!q.group||regions.some(x=>x.code===r.region))),regions,coverage:incomeCoverage(all,incomeRegions),rankingYear:INCOME_RANKING_YEAR};
  });
  app.get('/api/admin/income/dashboard',async()=>({records:publishedIncome(db),nextVersions:Object.fromEntries(db.prepare('SELECT id,MAX(version)+1 AS next FROM income_records GROUP BY id').all().map(r=>[String(r.id),Number(r.next)])),regions:incomeRegions,coverage:incomeCoverage(publishedIncome(db),incomeRegions),sources:incomeSources(db),candidates:db.prepare('SELECT * FROM income_candidates ORDER BY id DESC LIMIT 200').all(),rankingYear:INCOME_RANKING_YEAR}));
  app.post('/api/admin/income/check',async()=>{void runCheck();return {ok:true};});
  app.post('/api/admin/income/sources',async req=>{const s=z.object({url:official,title:z.string().min(4).max(300),kind:z.enum(['article','directory']),region:z.string().refine(code=>incomeRegions.some(r=>r.code===code))}).strict().parse(req.body);db.prepare('INSERT INTO income_sources(url,title,kind,region) VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,kind=excluded.kind,region=excluded.region').run(s.url,s.title,s.kind,s.region);log('income-source',s.title);return {ok:true};});
  const draft=z.object({records:z.array(incomeRecordSchema).min(1).max(500),note:z.string().min(10).max(2000)}).strict();
  app.post('/api/admin/income/candidates',async req=>{
    const body=draft.parse(req.body);if(new Set(body.records.map(r=>r.id)).size!==body.records.length)throw new Error('同一候选中记录ID不能重复');
    const first=body.records[0],id=db.prepare('INSERT INTO income_candidates(url,title,hash,content,proposal,note,created) VALUES(?,?,?,?,?,?,?)').run(first.source.url,first.source.title,createHash('sha256').update(JSON.stringify(body)).digest('hex')+Date.now(),first.source.excerpt,JSON.stringify(body.records),body.note,new Date().toISOString()).lastInsertRowid;log('income-import',`候选${id}，${body.records.length}项`);return {id:Number(id)};
  });
  app.put('/api/admin/income/candidates/:id',async req=>{const id=Number((req.params as {id:string}).id),body=draft.parse(req.body);const n=db.prepare("UPDATE income_candidates SET proposal=?,note=? WHERE id=? AND status='pending'").run(JSON.stringify(body.records),body.note,id);if(!n.changes)throw new Error('候选不存在或已处理');log('income-edit',`候选${id}`);return {ok:true};});
  app.post('/api/admin/income/candidates/:id/approve',async req=>{
    const id=Number((req.params as {id:string}).id),row=db.prepare('SELECT * FROM income_candidates WHERE id=?').get(id);if(!row||row.status!=='pending'||!row.proposal)throw new Error('需先核对原文并保存结构化收入候选');
    const body=draft.parse({records:JSON.parse(String(row.proposal)),note:row.note});if(new Set(body.records.map(r=>r.id)).size!==body.records.length)throw new Error('记录ID重复');
    db.exec('BEGIN');try{for(const r of body.records){const max=Number(db.prepare('SELECT MAX(version) AS v FROM income_records WHERE id=?').get(r.id)?.v||0);if(r.version!==max+1)throw new Error(`版本已过时：${r.id}，请使用${max+1}`);
      db.prepare('UPDATE income_records SET active=0 WHERE id=?').run(r.id);db.prepare('INSERT INTO income_records VALUES(?,?,1,?)').run(r.id,r.version,JSON.stringify(r));db.prepare('INSERT OR IGNORE INTO income_sources(url,title,region) VALUES(?,?,?)').run(r.source.url,r.source.title,r.region);}
      db.prepare("UPDATE income_candidates SET status='approved' WHERE id=?").run(id);log('income-publish',`候选${id}，${body.records.length}项；${body.note}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};
  });
  app.post('/api/admin/income/candidates/:id/reject',async req=>{const {note}=z.object({note:z.string().min(1).max(2000)}).parse(req.body),id=Number((req.params as {id:string}).id);if(!db.prepare("UPDATE income_candidates SET status='rejected',note=? WHERE id=? AND status='pending'").run(note,id).changes)throw new Error('候选不存在或已处理');log('income-reject',`候选${id}；${note}`);return {ok:true};});
  app.get('/api/admin/income/versions/:id',async req=>db.prepare('SELECT version,active,body FROM income_records WHERE id=? ORDER BY version DESC').all((req.params as {id:string}).id).map(r=>({...JSON.parse(String(r.body)),active:r.active===1})));
  app.post('/api/admin/income/rollback',async req=>{const {id,version}=z.object({id:z.string(),version:z.number().int().positive()}).parse(req.body);if(!db.prepare('SELECT 1 FROM income_records WHERE id=? AND version=?').get(id,version))throw new Error('历史版本不存在');db.exec('BEGIN');try{db.prepare('UPDATE income_records SET active=0 WHERE id=?').run(id);db.prepare('UPDATE income_records SET active=1 WHERE id=? AND version=?').run(id,version);log('income-rollback',`${id} → v${version}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};});
}
