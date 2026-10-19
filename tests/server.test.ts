import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore,activePolicies } from '../server/store';
import { buildApp } from '../server/app';
import { capture,createWatcher,dueDay,fetchOfficial } from '../server/watcher';
const headers={host:'127.0.0.1:3210',origin:'http://127.0.0.1:3210','content-type':'application/json'};
test('管理员设置、认证、审核、回滚和CSRF完整流程',async()=>{
  const db=openStore(':memory:');const {app}=await buildApp(db,{disableWatcher:true});
  try{
    const noAuth=await app.inject({method:'POST',url:'/api/admin/check',headers,payload:{}});assert.equal(noAuth.statusCode,401);
    const foreign=await app.inject({method:'POST',url:'/api/admin/setup',headers:{...headers,origin:'https://evil.example'},payload:{password:'test-only-long-password'}});assert.equal(foreign.statusCode,403);
    const hostile=await app.inject({url:'/api/policies',headers:{host:'evil.example'}});assert.equal(hostile.statusCode,403);
    const setup=await app.inject({method:'POST',url:'/api/admin/setup',headers,payload:{password:'test-only-long-password'}});assert.equal(setup.statusCode,200);
    const cookie=String(setup.headers['set-cookie']).split(';')[0];assert.match(String(setup.headers['set-cookie']),/HttpOnly/);const auth={...headers,cookie,'x-csrf-token':setup.json().csrf};
    assert.equal((await app.inject({method:'POST',url:'/api/admin/setup',headers,payload:{password:'test-only-long-password'}})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/check',headers:{...headers,cookie},payload:{}})).statusCode,403);
    const before=activePolicies(db);const create=await app.inject({method:'POST',url:'/api/admin/candidates',headers:auth,payload:{policyId:'beijing-2025-v1'}});const id=create.json().id;assert.ok(id);
    assert.deepEqual(activePolicies(db),before);
    const template=(await app.inject({url:'/api/admin/template/beijing-2025-v1',headers:auth})).json();template.proposal.base=13000;
    const save=await app.inject({method:'PUT',url:`/api/admin/candidates/${id}`,headers:auth,payload:{...template,note:'测试使用独立手算核验新的计发参数'}});assert.equal(save.statusCode,200);
    assert.equal((await app.inject({method:'POST',url:`/api/admin/candidates/${id}/approve`,headers:auth,payload:{}})).statusCode,400);
    template.fixtures[0].expectedBasic=2600;
    await app.inject({method:'PUT',url:`/api/admin/candidates/${id}`,headers:auth,payload:{...template,note:'20年指数1，13000乘以20%应为2600元'}});
    const publish=await app.inject({method:'POST',url:`/api/admin/candidates/${id}/approve`,headers:auth,payload:{}});assert.equal(publish.statusCode,200,publish.body);
    assert.equal(activePolicies(db).find(p=>p.id==='beijing-2025-v1')?.base,13000);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/rollback',headers:auth,payload:{id:'beijing-2025-v1',version:1}})).statusCode,200);
    assert.equal(activePolicies(db).find(p=>p.id==='beijing-2025-v1')?.base,12049);
    const newTemplate=(await app.inject({url:'/api/admin/template/beijing-2025-v1',headers:auth})).json();assert.equal(newTemplate.proposal.version,3);
    const another=await app.inject({method:'POST',url:'/api/admin/candidates',headers:auth,payload:{policyId:'beijing-2025-v1'}});
    assert.equal((await app.inject({method:'POST',url:`/api/admin/candidates/${another.json().id}/reject`,headers:auth,payload:{note:'未发现实际参数变化'}})).statusCode,200);
    const regions=(await app.inject({url:'/api/regions',headers})).json();assert.equal(regions.length,31);assert.ok(regions.find((r:{code:string})=>r.code==='440000').cities.find((c:{code:string})=>c.code==='440300'));
    await app.inject({method:'POST',url:'/api/admin/logout',headers:auth,payload:{}});assert.equal((await app.inject({url:'/api/admin/dashboard',headers:auth})).statusCode,401);
  }finally{await app.close();db.close();}
});
test('来源快照去重与失败保护；自动发现只生成待审核候选',async()=>{
  const db=openStore(':memory:');try{const before=activePolicies(db);capture(db,'https://www.gov.cn/test','测试来源','一段正文','首次');capture(db,'https://www.gov.cn/test','测试来源','一段正文','重复');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get()?.n,1);
    capture(db,'https://www.gov.cn/test','测试来源','变化正文','变化');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get()?.n,2);
    const watcher=createWatcher(db,async()=>{throw new Error('网络不可达');});await watcher.run();assert.deepEqual(activePolicies(db),before);assert.equal(db.prepare('SELECT status FROM jobs').get()?.status,'partial');
  }finally{db.close();}
});
test('北京时间每日09:00及跨日补查',()=>{assert.equal(dueDay(new Date('2026-10-13T00:59:00Z')),'2026-10-12');assert.equal(dueDay(new Date('2026-10-13T01:00:00Z')),'2026-10-13');});
test('官方抓取禁止非政府地址、危险重定向，附件进入人工提取',async()=>{
  await assert.rejects(fetchOfficial('http://127.0.0.1/private'));
  const redirect=(async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})) as typeof fetch;
  await assert.rejects(fetchOfficial('https://www.gov.cn/test',redirect));
  const pdf=(async()=>new Response('pdf-file',{headers:{'content-type':'application/pdf'}})) as typeof fetch;
  assert.equal((await fetchOfficial('https://www.gov.cn/p.pdf',pdf)).manual,true);
});
