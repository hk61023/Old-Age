import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,activePolicies,regionalReferences} from '../server/store';
import {buildApp} from '../server/app';
import {addMonitorSource,getMonitorSource,normalizeSourceUrl,initMonitorSources,listMonitorSources} from '../server/monitor-sources';
import {createWatcher,fetchOfficial} from '../server/watcher';
import {publicAddress,resolvePublic,createHostGate} from '../server/safe-fetch';
const response=(content='一段可核验官方正文',links:{url:string;title:string}[]=[])=>({content,links,manual:false});
test('不同入口重定向到同一主机时，实际连接仍串行且保留间隔',async()=>{
  const gate=createHostGate(20);let active=0,last=0;
  await Promise.all([1,2,3].map(()=>gate('redirect-target.gov.cn',async()=>{assert.equal(active,0);assert.ok(Date.now()-last>=20);active++;await new Promise(r=>setTimeout(r,8));active--;last=Date.now();})));
});
function isolated(){const db=openStore(':memory:');db.prepare('UPDATE monitor_sources SET enabled=0').run();return db;}

test('400页以上队列全部执行，重复点击复用任务，发布数据保持不变',async()=>{
  const db=isolated();try{
    const before=activePolicies(db),refs=regionalReferences(db);let calls=0;
    for(let i=0;i<405;i++)addMonitorSource(db,{url:`https://site${i}.gov.cn/file`,title:`来源${i}`,kind:'article'});
    const w=createWatcher(db,async()=>{calls++;return response();},{hostIntervalMs:0});const first=w.run();assert.equal(w.run(),first);await first;
    assert.equal(calls,405);const job=db.prepare('SELECT * FROM jobs').get()!;assert.equal(job.status,'success');const detail=JSON.parse(String(job.detail));assert.equal(detail.total,405);assert.equal(detail.completed,405);assert.equal(detail.remaining,0);
    assert.deepEqual(activePolicies(db),before);assert.deepEqual(regionalReferences(db),refs);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM monitor_tasks WHERE status='success'").get()!.n,405);
  }finally{db.close();}
});

test('中断后持久任务续跑，不重复检查已完成网址',async()=>{
  const db=isolated();try{
    for(let i=0;i<405;i++)addMonitorSource(db,{url:`https://resume${i}.gov.cn/file`,title:`来源${i}`,kind:'article'});
    let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);const urls:string[]=[];
    const w=createWatcher(db,async url=>{urls.push(url);enter();await gate;return response();},{hostIntervalMs:0});
    const task=w.run();await entered;const stop=w.stop();release();await stop;await task;
    assert.equal(db.prepare('SELECT status FROM jobs').get()!.status,'interrupted');assert.ok(Number(db.prepare("SELECT COUNT(*) n FROM monitor_tasks WHERE status='pending'").get()!.n)>0);
    const resumed=createWatcher(db,async url=>{urls.push(url);return response();},{hostIntervalMs:0});await resumed.run();
    assert.equal(urls.length,405);assert.equal(new Set(urls).size,405);assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get()!.n,1);assert.equal(db.prepare('SELECT status FROM jobs').get()!.status,'success');
  }finally{db.close();}
});

test('同站点请求串行并有间隔，跨站点最多两个并发',async()=>{
  const db=isolated();try{
    for(let i=0;i<6;i++)addMonitorSource(db,{url:`https://${i<3?'a':'b'}.gov.cn/file${i}`,title:'限速来源',kind:'article'});
    const active=new Set<string>(),last=new Map<string,number>();let current=0,max=0;
    await createWatcher(db,async url=>{const host=new URL(url).hostname;assert.ok(!active.has(host));assert.ok(Date.now()-(last.get(host)||0)>=20);active.add(host);current++;max=Math.max(max,current);await new Promise(r=>setTimeout(r,8));current--;active.delete(host);last.set(host,Date.now());return response();},{hostIntervalMs:20}).run();
    assert.equal(max,2);
  }finally{db.close();}
});

test('每个目录最多3页、每页20链接，文章独立持久化且不无限扩散',async()=>{
  const db=isolated();try{
    const root=addMonitorSource(db,{url:'https://paging.gov.cn/list',title:'养老政策目录',kind:'directory',region:'330000'});let directoryCalls=0;
    await createWatcher(db,async url=>{if(url.includes('/list')){directoryCalls++;return {...response('目录正文',Array.from({length:30},(_,i)=>({url:`https://articles.gov.cn/${directoryCalls}-${i}`,title:'养老政策'}))),pages:[{url:`https://paging.gov.cn/list?page=${directoryCalls+1}`,title:'下一页'}]};}return response('文章正文',[{url:'https://articles.gov.cn/should-not-follow',title:'不得再扩散'}]);},{hostIntervalMs:0}).run();
    assert.equal(directoryCalls,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM monitor_tasks').get()!.n,63);assert.equal(listMonitorSources(db).filter(s=>s.origin==='discovered').length,60);assert.ok(getMonitorSource(db,root)?.last_success);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM monitor_tasks WHERE url LIKE '%should-not-follow%'").get()!.n,0);
  }finally{db.close();}
});

test('失败、附件、首次采集和重复采集分别记录，收入与政策候选隔离',async()=>{
  const db=isolated();try{
    const fail=addMonitorSource(db,{url:'https://status.gov.cn/fail',title:'失败文件',kind:'article'}),pdf=addMonitorSource(db,{url:'https://status.gov.cn/pdf',title:'附件文件',kind:'article'});
    addMonitorSource(db,{url:'https://status.gov.cn/income',title:'收入统计',kind:'article',channel:'income',region:'330100'});
    const watcher=createWatcher(db,async url=>{if(url.endsWith('/fail'))throw new Error('测试超时');return {...response('全年居民收入公开正文'),manual:url.endsWith('/pdf')};},{hostIntervalMs:0});
    await watcher.run();assert.equal(getMonitorSource(db,fail)?.failures,1);assert.equal(getMonitorSource(db,pdf)?.verification,'manual');assert.equal(db.prepare("SELECT COUNT(*) n FROM candidates WHERE url LIKE '%income'").get()!.n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM income_candidates WHERE url LIKE '%income'").get()!.n,1);
    await watcher.run();assert.equal(getMonitorSource(db,fail)?.failures,2);assert.equal(db.prepare("SELECT COUNT(*) n FROM candidates WHERE url LIKE '%pdf'").get()!.n,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM income_candidates WHERE url LIKE '%income'").get()!.n,1);
  }finally{db.close();}
});

test('管理员来源接口权限、去重、启停和预置迁移保留修改',async()=>{
  const db=openStore(':memory:'),{app}=await buildApp(db,{disableWatcher:true});try{
    const base={host:'127.0.0.1:3210',origin:'http://127.0.0.1:3210','content-type':'application/json'};
    assert.equal((await app.inject({url:'/api/admin/sources',headers:base})).statusCode,401);
    const login=await app.inject({method:'POST',url:'/api/admin/setup',headers:base,payload:{password:'test-only-admin-password'}});
    const headers={...base,cookie:login.headers['set-cookie']!.toString().split(';')[0],'x-csrf-token':login.json().csrf};
    const source={url:'https://manage.gov.cn/list?b=2&a=1#top',title:'新增来源',region:'330000',department:'人社',kind:'directory',channel:'policy',topics:['养老金'],enabled:true};
    assert.equal((await app.inject({method:'POST',url:'/api/admin/sources',headers:{...headers,'x-csrf-token':'wrong'},payload:source})).statusCode,403);
    const created=await app.inject({method:'POST',url:'/api/admin/sources',headers,payload:source});assert.equal(created.statusCode,200);const id=created.json().id;
    assert.equal((await app.inject({method:'POST',url:'/api/admin/sources',headers,payload:{...source,url:'https://manage.gov.cn/list?a=1&b=2'}})).statusCode,409);
    assert.equal((await app.inject({method:'PUT',url:`/api/admin/sources/${id}`,headers,payload:{...source,title:'管理员修订',enabled:false}})).statusCode,200);
    initMonitorSources(db,[],regionalReferences(db));addMonitorSource(db,source);assert.equal(getMonitorSource(db,id)?.enabled,false);assert.equal(getMonitorSource(db,id)?.title,'管理员修订');
    assert.equal((await app.inject({method:'POST',url:`/api/admin/sources/${id}/check`,headers,payload:{}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/sources',headers,payload:{...source,url:'https://127.0.0.1/file'}})).statusCode,400);
  }finally{await app.close();db.close();}
});

test('拒绝内网、回环、链路本地、映射IPv6和云元数据，并验证解析结果',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.100.100.200','192.168.0.1','::1','::ffff:127.0.0.1','fd00::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
  await assert.rejects(resolvePublic('rebinding.gov.cn',async()=>[{address:'127.0.0.1',family:4}]));
  assert.equal(normalizeSourceUrl('https://test.gov.cn/a?b=2&utm_source=x&a=1#hash'),'https://test.gov.cn/a?a=1&b=2');
  const redirect=(async()=>new Response(null,{status:302,headers:{location:'https://metadata.google.internal/'}})) as typeof fetch;await assert.rejects(fetchOfficial('https://test.gov.cn/file',redirect));
});

test('预置核验证据只初始化一次，重启保留管理员停用与后续失败记录',()=>{
  const db=openStore(':memory:');try{
    const source=listMonitorSources(db).find(s=>s.url==='https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/')!;
    assert.equal(source.verification,'automatic');assert.ok(source.last_checked);
    db.prepare("UPDATE monitor_sources SET enabled=0,origin='admin',title='管理员保留标题',verification='manual',last_error='后续核验失败',failures=3 WHERE id=?").run(source.id);
    initMonitorSources(db,[],regionalReferences(db));
    const saved=getMonitorSource(db,source.id)!;assert.equal(saved.enabled,false);assert.equal(saved.title,'管理员保留标题');assert.equal(saved.last_error,'后续核验失败');assert.equal(saved.failures,3);
  }finally{db.close();}
});
