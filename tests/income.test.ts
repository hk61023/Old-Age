import test from 'node:test';
import assert from 'node:assert/strict';
import { annualIncome,compareIncome,commonIncomeYear,incomeCoverage,latestIncome,projectIncome,type IncomeRecord } from '../src/core/income';
import { incomeRegions,normalizeIncomeRegion } from '../src/data/income-regions';
import { openStore } from '../server/store';
import { buildApp } from '../server/app';
import { captureIncome,extractIncomeProposal,incomeRecordSchema,publishedIncome,statisticsUrl } from '../server/income';
import { createWatcher,fetchOfficial } from '../server/watcher';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,unlinkSync,rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedPolicies } from '../src/data/policies';
const record=(patch:Partial<IncomeRecord>={}):IncomeRecord=>({id:'330100-2025-disposable-all',region:'330100',year:2025,metric:'disposable',population:'all',value:60000,unit:'元/人/年',availability:'available',scope:'全市常住居民完整年度统计',source:{title:'2025年杭州市居民收入测试公报',url:'https://www.stats.gov.cn/test-income',publishedAt:'2026-01-20',verifiedAt:'2026-10-19',excerpt:'2025年全体居民人均可支配收入60000元，仅为自动化测试资料，不是正式统计数据。'},version:1,...patch});
const headers={host:'127.0.0.1:3210',origin:'http://127.0.0.1:3210','content-type':'application/json'};

test('最新资料允许上一年度数值，但指定年度不跨年且不恢复同年旧修订',()=>{
  const older=record({year:2024,value:55000}),missing=record({value:null,availability:'notPublished',version:2});
  const rows=[older,record(),missing];
  assert.equal(latestIncome(rows,'330100','disposable','all')?.year,2024);
  assert.equal(latestIncome(rows,'330100','disposable','all',2025)?.value,null);
  assert.equal(commonIncomeYear(rows,['330100'],'disposable','all'),2024);
});
test('31省、浙江11市、GDP100及去重103市均有自己的官方居民收入记录',()=>{
  const db=openStore(':memory:');try{const records=publishedIncome(db),coverage=incomeCoverage(records,incomeRegions);assert.deepEqual(coverage,{provinces:{complete:31,total:31},zhejiang:{complete:11,total:11},gdp30:{complete:30,total:30},gdp100:{complete:100,total:100},cities:{complete:103,total:103}});
    assert.equal(incomeRegions.length,131);assert.equal(new Set(incomeRegions.map(r=>r.code)).size,131);for(const code of ['110000','310000','420100'])assert.ok(records.some(r=>r.region===code&&r.metric==='disposable'&&r.year===2025));
    for(const city of incomeRegions.filter(r=>r.groups.includes('gdp100')))assert.ok(records.some(r=>r.region===city.code&&r.metric==='disposable'&&r.availability==='available'&&r.value!==null&&r.year>=2024),city.name+'须有城市自身居民收入，不能仅列入目录');
    for(const r of records){incomeRecordSchema.parse(r);assert.ok(statisticsUrl(r.source.url));assert.ok(r.source.excerpt.length>=10);}
    assert.equal(latestIncome(records,'330100','disposable','all')?.value,80017);assert.equal(latestIncome(records,'420100','disposable','all')?.value,62530);
    assert.equal(normalizeIncomeRegion('310100'),'310000');assert.equal(latestIncome(records,'310101','disposable','all'),undefined);
  }finally{db.close();}
});
test('新增城市保留2024回退、2025全市口径和逐项独立年度',()=>{
  const db=openStore(':memory:');try{const rows=publishedIncome(db);assert.equal(latestIncome(rows,'510700','disposable','urban')?.year,2024);assert.equal(latestIncome(rows,'510700','disposable','urban')?.value,49666);assert.equal(latestIncome(rows,'510700','disposable','urban',2025),undefined);assert.equal(latestIncome(rows,'230100','disposable','all')?.value,39817);assert.match(latestIncome(rows,'230100','disposable','urban')!.scope,/市本级.*全市/);assert.equal(latestIncome(rows,'321300','wage','nonPrivate')?.value,100248);assert.equal(latestIncome(rows,'321300','wage','private')?.value,68118);}finally{db.close();}
});
test('年/月、额外奖金、家庭人数、零收入及非法输入',()=>{
  assert.equal(annualIncome(5000,'monthly',12000),72000);assert.equal(annualIncome(180000,'annual',12000,3),60000);assert.equal(annualIncome(0,'annual'),0);
  for(const n of [-1,NaN,Infinity])assert.throws(()=>annualIncome(n,'annual'));
  for(const n of [0,-1,1.5,NaN])assert.throws(()=>annualIncome(100,'annual',0,n));
  assert.throws(()=>annualIncome(100,'monthly',-10));assert.throws(()=>annualIncome(Number.MAX_VALUE,'monthly'));
  assert.deepEqual(compareIncome(72000,60000),{ratio:1.2,percent:(1.2-1)*100,annualGap:12000,monthlyGap:1000,targetGap:0});
  assert.equal(compareIncome(0,60000).targetGap,60000);assert.throws(()=>compareIncome(1,0));
});

test('既有SQLite增量升级保留管理员与政策，重启不覆盖已发布修订',()=>{
  const dir=mkdtempSync(join(tmpdir(),'yanglao-income-')),path=join(dir,'upgrade.sqlite');
  const legacy=new DatabaseSync(path);legacy.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE policies(id TEXT,version INTEGER,active INTEGER,body TEXT,PRIMARY KEY(id,version));');
  legacy.prepare('INSERT INTO settings VALUES(?,?)').run('seeded','1');legacy.prepare('INSERT INTO settings VALUES(?,?)').run('admin','legacy-test-marker');legacy.prepare('INSERT INTO policies VALUES(?,?,?,?)').run('legacy',8,1,JSON.stringify({...seedPolicies[0],id:'legacy',version:8}));legacy.close();
  let db=openStore(path);try{assert.equal(db.prepare("SELECT value FROM settings WHERE key='admin'").get()?.value,'legacy-test-marker');assert.equal(db.prepare("SELECT version FROM policies WHERE id='legacy'").get()?.version,8);const row=publishedIncome(db).find(r=>r.id==='330100-2025-disposable-all')!;db.prepare('UPDATE income_records SET active=0 WHERE id=?').run(row.id);db.prepare('INSERT INTO income_records VALUES(?,?,1,?)').run(row.id,2,JSON.stringify({...row,version:2,value:81000}));db.close();db=openStore(path);assert.equal(latestIncome(publishedIncome(db),'330100','disposable','all')?.value,81000);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM income_records WHERE id=?').get(row.id)?.n,2);}finally{db.close();for(const file of [path,path+'-wal',path+'-shm']){try{unlinkSync(file);}catch{}}rmdirSync(dir);}
});
test('比较只能取同指标同人群共同年度，无数据不混年或借省值',()=>{
  const rows=[record(),record({id:'110000-2024-disposable-all',region:'110000',year:2024}),record({id:'330100-2024-disposable-all',year:2024}),record({id:'110000-2025-wage-private',region:'110000',metric:'wage',population:'private'})];
  assert.equal(commonIncomeYear(rows,['330100','110000'],'disposable','all'),2024);assert.equal(commonIncomeYear(rows,['330100','110000'],'wage','private'),null);assert.equal(commonIncomeYear(rows,['330100','420100'],'disposable','all'),null);
  assert.equal(latestIncome(rows,'330100','median','all'),undefined);assert.equal(latestIncome(rows,'330000','disposable','all'),undefined);
});
test('退休年度增长复利、同年、负增长与不合法情景',()=>{
  assert.ok(Math.abs(projectIncome(60000,2025,2035,3)-60000*1.03**10)<1e-8);assert.equal(projectIncome(60000,2025,2025,3),60000);assert.equal(projectIncome(60000,2025,2026,-10),54000);
  assert.throws(()=>projectIncome(60000,2025,2024,3));assert.throws(()=>projectIncome(60000,2025,2035,-100));assert.throws(()=>projectIncome(60000,2025,2035,NaN));
});
test('工资口径、空值、年度、地区及来源校验',()=>{
  assert.equal(incomeRecordSchema.safeParse(record({metric:'wage'})).success,false);assert.equal(incomeRecordSchema.safeParse(record({value:null})).success,false);assert.equal(incomeRecordSchema.safeParse(record({year:2026})).success,false);
  assert.equal(incomeRecordSchema.safeParse(record({region:'330101'})).success,false);assert.equal(statisticsUrl('https://www.stats.gov.cn.evil.example/test'),false);assert.equal(statisticsUrl('http://127.0.0.1'),false);assert.equal(statisticsUrl('https://finance.sina.com.cn/random'),false);
  assert.ok(incomeRecordSchema.safeParse(record({availability:'notPublished',value:null})).success);
  assert.ok(statisticsUrl('https://www.thepaper.cn/newsDetail_forward_32481648'));assert.equal(statisticsUrl('https://www.thepaper.cn/newsDetail_forward_1'),false);
  assert.ok(statisticsUrl('http://dystjj.dongying.gov.cn/art/2026/3/30/art_36584_10288288.html'));assert.equal(statisticsUrl('http://dystjj.dongying.gov.cn/unreviewed'),false);
});
test('自动提取仅预填唯一全年数值；季度、多值歧义不自动决定',()=>{
  const text='2025年全年全体居民人均可支配收入60000元，城镇居民人均可支配收入70000元，农村居民人均可支配收入30000元。';
  const result=extractIncomeProposal(text,'2025年杭州市居民收入','330100','https://www.stats.gov.cn/test-income',[record()]);assert.equal(result.length,3);assert.equal(result[0].version,2);
  assert.equal(extractIncomeProposal(text,'2025年上半年居民收入','330100','https://www.stats.gov.cn/test').length,0);
  assert.equal(extractIncomeProposal(text+'全体居民人均可支配收入61000元。','2025年收入','330100','https://www.stats.gov.cn/test').filter(r=>r.population==='all').length,0);
});
test('收入来源快照去重、抓取失败保护、原养老金候选隔离',async()=>{
  const db=openStore(':memory:');try{const before=publishedIncome(db),old=Number(db.prepare('SELECT COUNT(*) AS n FROM candidates').get()?.n);captureIncome(db,'https://www.stats.gov.cn/test','2025年收入','全年全体居民人均可支配收入60000元');captureIncome(db,'https://www.stats.gov.cn/test','2025年收入','全年全体居民人均可支配收入60000元');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM income_candidates').get()?.n,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get()?.n,old);
    await createWatcher(db,async()=>{throw new Error('测试网络失败');}).run();assert.deepEqual(publishedIncome(db),before);assert.ok(db.prepare('SELECT last_error FROM income_sources WHERE last_error IS NOT NULL').get());
    const redirect=(async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/test'}})) as typeof fetch;await assert.rejects(fetchOfficial('https://epaper.scdaily.cn/test',redirect,statisticsUrl));
  }finally{db.close();}
});
test('收入接口只读过滤，审核前不生效；发布、旧版本拒绝、回滚与身份保护',async()=>{
  const db=openStore(':memory:'),{app}=await buildApp(db,{disableWatcher:true});try{
    assert.equal((await app.inject({url:'/api/admin/income/dashboard',headers})).statusCode,401);
    const filtered=await app.inject({url:'/api/income-statistics?region=330100&year=2025',headers});assert.equal(filtered.statusCode,200);assert.ok(filtered.json().records.every((r:IncomeRecord)=>r.region==='330100'&&r.year===2025));
    assert.equal((await app.inject({url:'/api/income-statistics?income=123456',headers})).statusCode,400);
    const group=(await app.inject({url:'/api/income-statistics?group=gdp30',headers})).json();assert.equal(group.regions.length,30);assert.ok(!group.regions.some((r:{code:string})=>r.code==='330600'));
    const hundred=(await app.inject({url:'/api/income-statistics?group=gdp100',headers})).json();assert.equal(hundred.regions.length,100);assert.equal(hundred.coverage.gdp100.complete,100);assert.ok(hundred.records.some((r:IncomeRecord)=>r.region==='510700'&&r.year===2024));assert.ok(!hundred.regions.some((r:{code:string})=>r.code==='330800'));assert.ok(hundred.records.every((r:IncomeRecord)=>hundred.regions.some((x:{code:string})=>x.code===r.region)));
    const authResponse=await app.inject({method:'POST',url:'/api/admin/setup',headers,payload:{password:'income-test-only-password'}}),auth={...headers,cookie:String(authResponse.headers['set-cookie']).split(';')[0],'x-csrf-token':authResponse.json().csrf};
    const existing=publishedIncome(db).find(r=>r.region==='330100'&&r.year===2025&&r.metric==='disposable'&&r.population==='all')!;
    const next={...existing,value:81000,version:2,source:{...existing.source,excerpt:'测试修订2025年杭州市居民人均可支配收入81000元，自动测试并非真实数据。'}};
    const body={records:[next],note:'仅在内存数据库验证资料审核和回滚流程'};
    assert.equal((await app.inject({method:'POST',url:'/api/admin/income/candidates',headers:{...auth,'x-csrf-token':'bad'},payload:body})).statusCode,403);
    const draft=await app.inject({method:'POST',url:'/api/admin/income/candidates',headers:auth,payload:body}),id=draft.json().id;assert.equal(draft.statusCode,200,draft.body);assert.equal(latestIncome(publishedIncome(db),'330100','disposable','all')?.value,80017);
    assert.equal((await app.inject({method:'POST',url:`/api/admin/income/candidates/${id}/approve`,headers:auth,payload:{}})).statusCode,200);assert.equal(latestIncome(publishedIncome(db),'330100','disposable','all')?.value,81000);
    const stale=(await app.inject({method:'POST',url:'/api/admin/income/candidates',headers:auth,payload:body})).json().id;assert.equal((await app.inject({method:'POST',url:`/api/admin/income/candidates/${stale}/approve`,headers:auth,payload:{}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/income/rollback',headers:auth,payload:{id:existing.id,version:1}})).statusCode,200);assert.equal(latestIncome(publishedIncome(db),'330100','disposable','all')?.value,80017);
    assert.equal((await app.inject({url:`/api/admin/income/versions/${existing.id}`,headers:auth})).json().length,2);
    assert.equal((await app.inject({url:'/api/admin/income/dashboard',headers:auth})).json().nextVersions[existing.id],3);
    const rejected=(await app.inject({method:'POST',url:'/api/admin/income/candidates',headers:auth,payload:{...body,records:[{...next,version:3}]}})).json().id;assert.equal((await app.inject({method:'POST',url:`/api/admin/income/candidates/${rejected}/reject`,headers:auth,payload:{note:'测试驳回'}})).statusCode,200);
  }finally{await app.close();db.close();}
});
