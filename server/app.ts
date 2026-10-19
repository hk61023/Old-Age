import Fastify, {type FastifyReply} from 'fastify';
import cookie from '@fastify/cookie';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { activePolicies,audit,setting,setSetting,type Store,sources,regionalReferences } from './store';
import { createWatcher, beijingDay } from './watcher';
import { policySchema, fixtureFor,runFixtures,type Fixture } from './validation';
import type { Policy } from '../src/core/types';
import { nationalSources } from '../src/data/policies';
import { ENGINE_VERSION } from '../src/core/engine';
import { registerIncomeRoutes } from './income';
import { registerMonitorRoutes } from './monitor-sources';
const require=createRequire(import.meta.url);
interface RawProvince {code:string;name:string;children:{code:string;name:string}[]}
export function regionList(){const raw=require('china-division/dist/pc-code.json') as RawProvince[];return raw.map(p=>({code:p.code.padEnd(6,'0'),name:p.name,cities:[...p.children.map(c=>({code:c.code.padEnd(6,'0'),name:c.name})),...(p.code==='50'?[{code:'500157',name:'两江新区'}]:[])]}));}
export async function buildApp(db:Store, options:{disableWatcher?:boolean}={}){
  const app=Fastify({logger:false,bodyLimit:1_000_000});await app.register(cookie);
  const sessions=new Map<string,{expires:number;csrf:string}>();const attempts=new Map<string,{count:number;since:number}>();
  const watcher=createWatcher(db);
  registerMonitorRoutes(app,db,watcher,regionList);
  app.setErrorHandler((error,_req,reply)=>{const e=error as Error & {statusCode?:number};reply.code(error instanceof z.ZodError?400:e.statusCode||400).send({error:error instanceof z.ZodError?error.issues.map(i=>i.message).join('；'):e.message});});
  app.addHook('onRequest',async(req,reply)=>{
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return reply.code(403).send({error:'仅允许本机访问'});
    if(req.method!=='GET'&&req.method!=='HEAD'){
      if(req.headers.origin!==`http://${host}`)return reply.code(403).send({error:'请求来源校验失败'});
      if(!req.headers['content-type']?.startsWith('application/json'))return reply.code(415).send({error:'只接受JSON请求'});
    }
    if(req.url.startsWith('/api/admin/')&&!['/api/admin/state','/api/admin/login','/api/admin/setup'].includes(req.url)){
      const session=sessions.get(req.cookies.session||'');
      if(!session||session.expires<Date.now())return reply.code(401).send({error:'请先登录管理员'});
      if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)return reply.code(403).send({error:'会话校验失败，请重新登录'});
    }
  });
  app.addHook('onSend',async(_req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('X-Frame-Options','DENY');if(_req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');return payload;});
  app.get('/api/health',async()=>({ok:true,mode:'local',engine:ENGINE_VERSION}));
  app.get('/api/regions',async()=>regionList());
  app.get('/api/regional-references',async()=>({references:regionalReferences(db)}));
  app.get('/api/policies',async()=>({policies:activePolicies(db),nationalSources}));
  app.get('/api/policies/:id/versions',async(req)=>db.prepare('SELECT version,active,body FROM policies WHERE id=? ORDER BY version DESC').all((req.params as {id:string}).id).map(row=>({...JSON.parse(String(row.body)),active:row.active===1})));
  app.get('/api/admin/state',async(req)=>{const session=sessions.get(req.cookies.session||'');return {initialized:!!setting(db,'admin'),authenticated:!!session&&session.expires>Date.now(),csrf:session&&session.expires>Date.now()?session.csrf:null};});
  const credentials=z.object({password:z.string().min(12,'密码至少12位').max(128)}).strict();
  function issueSession(reply:FastifyReply) {const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{expires:Date.now()+8*3600000,csrf});reply.setCookie('session',token,{httpOnly:true,sameSite:'strict',path:'/',maxAge:8*3600});return {ok:true,csrf};}
  app.post('/api/admin/setup',async(req,reply)=>{
    if(setting(db,'admin'))return reply.code(409).send({error:'管理员已初始化'});
    const {password}=credentials.parse(req.body);const salt=randomBytes(16).toString('hex');setSetting(db,'admin',JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex')}));audit(db,'setup','本机管理员初始化');return issueSession(reply);
  });
  app.post('/api/admin/login',async(req,reply)=>{
    const a=attempts.get(req.ip);if(a&&Date.now()-a.since<60000&&a.count>=5)return reply.code(429).send({error:'登录尝试过多，请一分钟后重试'});
    const {password}=credentials.parse(req.body);const value=setting(db,'admin');if(!value)return reply.code(409).send({error:'请先设置管理员密码'});
    const {salt,hash}=JSON.parse(value);const actual=scryptSync(password,salt,64);
    if(!timingSafeEqual(Buffer.from(hash,'hex'),actual)){attempts.set(req.ip,{count:a&&Date.now()-a.since<60000?a.count+1:1,since:a&&Date.now()-a.since<60000?a.since:Date.now()});return reply.code(401).send({error:'密码错误'});}
    attempts.delete(req.ip);return issueSession(reply);
  });
  app.post('/api/admin/logout',async(req,reply)=>{sessions.delete(req.cookies.session||'');reply.clearCookie('session',{path:'/'});return {ok:true};});
  app.get('/api/admin/dashboard',async()=>({candidates:db.prepare('SELECT * FROM candidates ORDER BY id DESC LIMIT 100').all(),jobs:db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 20').all(),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all(),sources:sources(db),running:watcher.isRunning()}));
  app.get('/api/admin/template/:id',async(req)=>{const p=activePolicies(db).find(x=>x.id===(req.params as {id:string}).id);if(!p)throw new Error('政策不存在');const max=db.prepare('SELECT MAX(version) AS v FROM policies WHERE id=?').get(p.id);return {proposal:{...p,version:Number(max?.v||0)+1,status:'draft',verifiedAt:beijingDay()},fixtures:[fixtureFor(p)]};});
  app.post('/api/admin/check',async()=>{void watcher.run();return {ok:true,running:true};});
  app.post('/api/admin/candidates',async(req)=>{
    const {policyId}=z.object({policyId:z.string()}).parse(req.body);const p=activePolicies(db).find(x=>x.id===policyId);if(!p)throw new Error('政策不存在');
    const max=db.prepare('SELECT MAX(version) AS v FROM policies WHERE id=?').get(p.id);
    const proposal={...p,version:Number(max?.v||0)+1,status:'draft',verifiedAt:beijingDay()};
    const id=db.prepare('INSERT INTO candidates(url,title,hash,content,reason,proposal,fixtures,created) VALUES(?,?,?,?,?,?,?,?)').run(p.sources[0].url,`${p.name}：人工修订候选`,randomBytes(16).toString('hex'),'请逐项核对官方原文并填写变更说明','人工新建',JSON.stringify(proposal),JSON.stringify([fixtureFor(p)]),new Date().toISOString()).lastInsertRowid;
    audit(db,'candidate',`新建候选${id}`);return {id:Number(id)};
  });
  app.put('/api/admin/candidates/:id',async(req)=>{
    const id=Number((req.params as {id:string}).id);const row=db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(!row||row.status!=='pending')throw new Error('候选不存在或已审核');
    const body=z.object({proposal:policySchema,fixtures:z.array(z.any()).min(1).max(20),note:z.string().min(10,'请填写至少10字的核验说明').max(2000)}).parse(req.body);
    db.prepare('UPDATE candidates SET proposal=?,fixtures=?,reason=? WHERE id=?').run(JSON.stringify(body.proposal),JSON.stringify(body.fixtures),body.note,id);audit(db,'edit',`保存候选${id}：${body.note}`);return {ok:true};
  });
  app.post('/api/admin/candidates/:id/test',async(req)=>{
    const row=db.prepare('SELECT * FROM candidates WHERE id=?').get(Number((req.params as {id:string}).id));if(!row?.proposal||!row.fixtures)throw new Error('请先保存政策参数和独立手算样例');return {tests:runFixtures(policySchema.parse(JSON.parse(String(row.proposal))),JSON.parse(String(row.fixtures)))};
  });
  app.post('/api/admin/candidates/:id/approve',async(req)=>{
    const id=Number((req.params as {id:string}).id);const row=db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(!row||row.status!=='pending'||!row.proposal||!row.fixtures)throw new Error('候选不可发布，需先填写参数与样例');
    const p=policySchema.parse(JSON.parse(String(row.proposal)));const max=db.prepare('SELECT MAX(version) AS v FROM policies WHERE id=?').get(p.id);if(p.version!==Number(max?.v||0)+1)throw new Error('候选版本已过时，请基于当前版本重新编辑');
    const tests=runFixtures(p,JSON.parse(String(row.fixtures)) as Fixture[]);if(tests.some(t=>!t.pass))throw new Error('独立手算回归未通过，不能发布');
    if(p.verifiedAt>beijingDay())throw new Error('核验时间不能在未来');
    db.exec('BEGIN');try{db.prepare('UPDATE policies SET active=0 WHERE id=?').run(p.id);db.prepare('INSERT INTO policies VALUES(?,?,1,?)').run(p.id,p.version,JSON.stringify({...p,status:'published'}));db.prepare("UPDATE candidates SET status='approved' WHERE id=?").run(id);audit(db,'publish',`${p.name} v${p.version}；候选${id}；${row.reason}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true,tests};
  });
  app.post('/api/admin/candidates/:id/reject',async(req)=>{const id=Number((req.params as {id:string}).id);const {note}=z.object({note:z.string().min(1).max(1000)}).parse(req.body);const result=db.prepare("UPDATE candidates SET status='rejected' WHERE id=? AND status='pending'").run(id);if(!result.changes)throw new Error('候选不存在或已处理');audit(db,'reject',`候选${id}：${note}`);return {ok:true};});
  app.post('/api/admin/rollback',async(req)=>{
    const {id,version}=z.object({id:z.string(),version:z.number().int().positive()}).parse(req.body);const row=db.prepare('SELECT body FROM policies WHERE id=? AND version=?').get(id,version);if(!row)throw new Error('历史版本不存在');
    db.exec('BEGIN');try{db.prepare('UPDATE policies SET active=0 WHERE id=?').run(id);db.prepare('UPDATE policies SET active=1 WHERE id=? AND version=?').run(id,version);audit(db,'rollback',`${id}回滚到v${version}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};
  });
  registerIncomeRoutes(app,db,()=>watcher.run());
  let timer:NodeJS.Timeout|undefined;
  if(!options.disableWatcher){timer=setInterval(()=>watcher.tick(),60000);timer.unref();setTimeout(()=>watcher.tick(),1500).unref();}
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await watcher.stop();});
  return {app,watcher};
}
