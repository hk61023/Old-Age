import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore,activePolicies,regionalReferences,sources } from '../server/store';
import { buildApp,regionList } from '../server/app';
import { regionalParameters } from '../src/core/regions';
import { balancePresets } from '../src/core/balance';
import { calculate,retirement } from '../src/core/engine';
import { fixtureFor } from '../server/validation';
import { seedPolicies } from '../src/data/policies';
test('退休分解使用出生月份；同一年不同月份不能统一加龄',()=>{
  const first=retirement('1965-01','male60')!,last=retirement('1965-12','male60')!;
  assert.equal(first.original,60);assert.equal(first.delayMonths,1);assert.equal(last.delayMonths,3);
  assert.equal(retirement('1980-01','female50')?.delayMonths,31);
  assert.equal(retirement('1990-06','male60')?.delayMonths,36);
  assert.equal(retirement('1990-06','female55')?.ageMonths,58*12);
  assert.equal(retirement('1990-06','female50')?.ageMonths,55*12);
  const f=fixtureFor(seedPolicies[0]),r=calculate(f.input,f.scenario,seedPolicies);
  assert.equal(r.originalRetirementAge,60);assert.equal(r.statutoryDelayMonths,5);assert.equal(r.statutoryAgeMonths,725);
});
test('累计月份保持241个月，清空必填月数时不冒充0个月',()=>{
  const f=fixtureFor(seedPolicies[0]);const r=calculate({...f.input,paidMonths:241},f.scenario,seedPolicies);
  assert.equal(r.totalMonths,241);
  const empty=calculate({...f.input,paidMonths:NaN},f.scenario,seedPolicies);assert.equal(empty.total,null);assert.match(empty.missing.join(''),/缴费月数/);assert.equal(empty.statutoryDelayMonths,5);assert.equal(empty.statutoryMonth,'2026-10');
});
test('余额上年末及实际截止月快捷项不生成未来年末',()=>{
  assert.deepEqual(balancePresets('2026-10').map(p=>p.value),['2025-12','2026-10']);
  assert.equal(balancePresets('2026-12')[1].label,'本年末实际累计储存额');
  assert.deepEqual(balancePresets(''),[]);
});
test('全国31省及城市目录可查询；每个数值保留政府依据',()=>{
  const db=openStore(':memory:');try{
    const before=activePolicies(db);const refs=regionalReferences(db),regions=regionList();
    assert.equal(refs.length,31);assert.deepEqual(refs.map(r=>r.province).sort(),regions.map(r=>r.code).sort());
    for(const ref of refs){assert.match(ref.portal.url,/^https:\/\/[^/]+\.gov\.cn\//);for(const p of [...ref.parameters,...Object.values(ref.cityParameters).flat()]){assert.ok(p.value>0);assert.match(p.source.url,/^https:\/\/[^/]+\.gov\.cn\//);assert.ok(p.source.documentNo);}}
    assert.deepEqual(activePolicies(db),before);assert.deepEqual(regionalReferences(db),refs);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM regional_references').get()?.n,31);
    assert.ok(sources(db).some(s=>s.url.includes('rst.xinjiang.gov.cn')));
  }finally{db.close();}
});
test('吉林长春、市级例外及深圳基数不统一套用省值',()=>{
  const db=openStore(':memory:');try{
    const refs=regionalReferences(db);const jl=refs.find(r=>r.province==='220000')!;
    assert.equal(regionalParameters(jl,'220100').find(p=>p.kind==='pensionBase')?.value,95739/12);
    assert.equal(regionalParameters(jl,'220200').find(p=>p.kind==='pensionBase')?.value,87865/12);
    const ln=refs.find(r=>r.province==='210000')!;assert.equal(regionalParameters(ln,'210100').find(p=>p.kind==='pensionBase')?.value,8390);assert.equal(regionalParameters(ln,'210200').find(p=>p.kind==='pensionBase')?.value,8956);assert.equal(regionalParameters(ln,'210300').find(p=>p.kind==='pensionBase')?.value,7346);
    const gd=refs.find(r=>r.province==='440000')!;
    assert.equal(regionalParameters(gd,'440300').find(p=>p.kind==='pensionBase')?.value,11293);
    assert.equal(regionalParameters(gd,'440100').find(p=>p.kind==='pensionBase')?.value,9493);
  }finally{db.close();}
});
test('地区参考工资不是个人指数，不从缴费上限推导未核验分母',()=>{
  const db=openStore(':memory:');try{const refs=regionalReferences(db);
    assert.equal(refs.find(r=>r.province==='320000')?.parameters.some(p=>p.kind==='indexBase'),false);
    assert.equal(refs.find(r=>r.province==='370000')?.parameters.find(p=>p.kind==='indexBase')?.value,7506);
    assert.equal(refs.find(r=>r.province==='430000')?.parameters.find(p=>p.kind==='indexBase')?.value,6787);
    assert.match(refs.find(r=>r.province==='330000')?.parameters.find(p=>p.kind==='pensionBase')?.source.url||'',/2026/);
  }finally{db.close();}
});
test('全国查询接口只读；新增参考数值不擅自开通完整金额',async()=>{
  const db=openStore(':memory:');const {app}=await buildApp(db,{disableWatcher:true});try{
    const headers={host:'127.0.0.1:3210'};
    const response=await app.inject({url:'/api/regional-references',headers});assert.equal(response.statusCode,200);assert.equal(response.json().references.length,31);
    assert.equal((await app.inject({method:'POST',url:'/api/regional-references',headers:{...headers,origin:'http://127.0.0.1:3210','content-type':'application/json'},payload:{paidMonths:240}})).statusCode,404);
    const f=fixtureFor(seedPolicies[0]),r=calculate({...f.input,province:'350000',city:'350100'},f.scenario,activePolicies(db));assert.equal(r.total,null);assert.equal(r.policyId,null);assert.equal(r.originalRetirementAge,60);
  }finally{await app.close();db.close();}
});
