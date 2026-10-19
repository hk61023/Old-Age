import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,activePolicies,regionalReferences} from '../server/store';
import {regionList} from '../server/app';
import {calculationRegions,referenceBase} from '../src/core/regions';
import {calculate} from '../src/core/engine';
import {fixtureFor} from '../server/validation';

test('测算下拉仅保留有公式或官方计发参数的范围，市级例外不借用省值',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db);
    const available=calculationRegions(regionList(),policies,refs,'2026-10');
    assert.equal(available.length,31);
    assert.equal(available.find(p=>p.code==='610000')?.cities.length,10);
    const sd=available.find(p=>p.code==='370000')!;
    assert.ok(sd.cities.length);assert.equal(sd.cities.some(c=>c.code==='371700'),true);
    assert.equal(referenceBase(refs.find(r=>r.province==='370000'),'371700','2026-10')?.kind,'baseScenario');
    assert.equal(referenceBase(refs.find(r=>r.province==='370000'),'371700','2026-10')?.value,7506);
    assert.ok(available.find(p=>p.code==='210000')?.cities.some(c=>c.code==='210100'));
    assert.equal(available.find(p=>p.code==='150000')?.cities.length,12);
    assert.equal(available.find(p=>p.code==='420000')?.cities.length,17);
    assert.equal(available.find(p=>p.code==='650000')?.cities.length,26);
    for(const p of available)assert.ok(p.cities.length>=Math.min(10,regionList().find(r=>r.code===p.code)!.cities.length),p.name);
    const cq=available.find(p=>p.code==='500000')!;
    assert.ok(cq.cities.some(c=>c.code==='500157'));
    assert.ok(!cq.cities.some(c=>['500105','500112'].includes(c.code)));
    assert.ok(regionList().find(p=>p.code==='500000')!.cities.some(c=>c.code==='500112'),'历史缴费导入保留旧代码');
    const f=fixtureFor(policies[0]);
    for(const p of available)for(const c of p.cities){
      const r=calculate({...f.input,birth:'1990-06',firstInsured:'2016-01',paidMonths:120,province:p.code,city:c.code,insuredProvince:p.code,insuredCity:c.code},f.scenario,policies,refs);
      assert.notEqual(r.basic,null,`${p.code}/${c.code}`);
      assert.ok(!r.missing.some(x=>x.includes('必要政策尚未核验')));
    }
    assert.equal(regionList().length,31);
  }finally{db.close();}
});

test('武汉个案历史参数不外推湖北；新疆缴费上下限不冒充计发基数',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),f=fixtureFor(policies[0]);
    const input={...f.input,province:'420000',city:'420100',insuredProvince:'420000',insuredCity:'420100',paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1};
    const result=calculate(input,f.scenario,policies,refs);
    assert.equal(result.basic,1776);assert.equal(result.account,1000);assert.equal(result.partialSubtotal,2776);
    assert.equal(result.total,null);assert.equal(result.transition,null);assert.equal(result.reference?.year,2024);
    assert.ok(result.reference?.sources.some(s=>s.title.includes('案例')));
    const yc=calculate({...input,city:'420500'},f.scenario,policies,refs);
    assert.equal(yc.basic,1517.4);assert.equal(yc.reference?.basis,'wage-scenario');
    const xj=refs.find(r=>r.province==='650000')!;
    assert.deepEqual(xj.parameters.map(p=>[p.kind,p.value]),[['contributionMin',5246],['contributionMax',26231]]);
    const scenario=calculate({...input,province:'650000',city:'650100'},f.scenario,policies,refs);
    assert.equal(scenario.basic,1748.8);assert.equal(scenario.reference?.basis,'wage-scenario');
    assert.equal(xj.cityParameters['650100'].some(p=>p.kind==='pensionBase'||p.kind==='indexBase'),false);
  }finally{db.close();}
});

test('七省各四个主要城市可算基础与账户，工资情景不标为正式政策',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),f=fixtureFor(policies[0]);
    const scopes=[
      ['140000',['140100','140200','140400','140800'],7073],
      ['410000',['410100','410300','411300','410700'],6385],
      ['460000',['460100','460200','460400','469002'],8254],
      ['500000',['500103','500101','500102','500116'],7588.25],
      ['510000',['510100','510700','510600','511500'],7831],
      ['610000',['610100','610300','610400','610800'],7895],
      ['650000',['650100','650200','650400','650500'],8744]
    ] as const;
    const available=calculationRegions(regionList(),policies,refs,'2026-10');
    for(const [province,cities,base] of scopes){
      const ref=refs.find(r=>r.province===province)!;
      assert.ok(available.find(r=>r.code===province)!.cities.length>=10);
      for(const city of cities){
        const r=calculate({...f.input,province,city,insuredProvince:province,insuredCity:city,paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1},f.scenario,policies,refs);
        assert.equal(r.basic,Math.round(base*.2*100)/100);assert.equal(r.account,1000);
        assert.equal(r.partialSubtotal,Math.round((base*.2+1000)*100)/100);
        assert.equal(r.total,null);assert.equal(r.transition,null);assert.equal(r.local,null);assert.equal(r.status,'partial');
        assert.equal(r.reference?.basis,'wage-scenario');assert.equal(r.reference.baseValue,base);
        assert.ok(r.assumptions.some(a=>a.includes('正式计发基数未核实')));
        assert.equal(ref.cityParameters[city].some(p=>p.kind==='pensionBase'||p.kind==='indexBase'),false);
      }
    }
    const earlier=calculate({...f.input,province:'610000',city:'610100',asOf:'2026-07'},f.scenario,policies,refs);assert.equal(earlier.basic,null);
    const added=calculate({...f.input,province:'650000',city:'659001'},f.scenario,policies,refs);assert.notEqual(added.basic,null);assert.equal(added.reference?.basis,'wage-scenario');
    const snapshot=structuredClone(refs);const r1=calculate({...f.input,province:'460000',city:'460100'},f.scenario,policies,snapshot);
    refs.find(r=>r.province==='460000')!.cityParameters['460100'][0].value=9999;
    assert.deepEqual(calculate({...f.input,province:'460000',city:'460100'},f.scenario,policies,snapshot),r1);
    const tj=structuredClone(refs.find(r=>r.province==='120000')!);
    tj.cityParameters['120101']=[{...tj.parameters[0],kind:'baseScenario',year:2026,value:9999,from:'2026-01-01'}];
    assert.equal(referenceBase(tj,'120101','2026-10')?.kind,'pensionBase');
    assert.equal(referenceBase(tj,'120101','2026-10')?.value,9417);
  }finally{db.close();}
});
test('贵州与西藏使用2026官方依据，包头历史样例不外推全区',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),f=fixtureFor(policies[0]);
    for(const [province,city,base,year] of [['520000','520100',7376.75,2026],['540000','540100',11954,2026],['150000','150200',8179,2025]] as const){
      const r=calculate({...f.input,province,city,insuredProvince:province,insuredCity:city,paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1},f.scenario,policies,refs);
      assert.equal(r.projectedBase,base);assert.equal(r.basic,Math.round(base*.2*100)/100);assert.equal(r.account,1000);
      assert.equal(r.total,null);assert.equal(r.transition,null);assert.equal(r.reference?.year,year);
    }
    const unknown=calculate({...f.input,province:'150000',city:'150100',insuredProvince:'150000',insuredCity:'150100'},f.scenario,policies,refs);
    assert.notEqual(unknown.basic,null);assert.equal(unknown.reference?.basis,'wage-scenario');assert.equal(unknown.reference?.baseValue,8179);
  }finally{db.close();}
});
test('通用参考独立手算一致，但地方未知项目不能充当零或完整待遇',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),f=fixtureFor(policies[0]);
    const input={...f.input,province:'120000',city:'120101',insuredProvince:'120000',insuredCity:'120101',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1,paidMonths:240,deemedMonths:0,firstInsured:'2006-01'};
    const r=calculate(input,f.scenario,policies,refs);
    assert.equal(r.basic,1883.4);assert.equal(r.account,1000);assert.equal(r.partialSubtotal,2883.4);
    assert.equal(r.projectedBalance,139000);assert.equal(r.total,null);assert.equal(r.transition,null);assert.equal(r.local,null);assert.equal(r.status,'partial');
    const invalid=calculate({...input,balanceDate:'2025-12'},f.scenario,policies,refs);
    assert.equal(invalid.account,null);assert.equal(invalid.partialSubtotal,undefined);
    const missingIndex=calculate({...input,averageIndex:undefined},f.scenario,policies,refs);
    assert.ok(missingIndex.assumptions.some(x=>x.includes('暂设为1')));
    assert.ok(missingIndex.assumptions.some(x=>x.includes('未用作缴费指数分母')));
    const deemed=calculate({...input,deemedMonths:12},f.scenario,policies,refs);assert.equal(deemed.basic,null);
    const snapshot=JSON.parse(JSON.stringify({input,result:r,references:refs}));
    assert.deepEqual(calculate(snapshot.input,f.scenario,policies,snapshot.references),r);
  }finally{db.close();}
});
test('新增四省主要城市匹配官方基数，历史参数不冒充新年度且未知待遇不清零',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),f=fixtureFor(policies[0]);
    for(const [province,cities,base,year] of [
      ['130000',['130100','130200','130600'],7410,2025],
      ['450000',['450100','450200','450300'],6983,2025],
      ['630000',['630100','630200'],9056,2025],
      ['620000',['620100','620200','620500'],7594,2024]
    ] as const){
      for(const city of cities){
        const r=calculate({...f.input,province,city,insuredProvince:province,insuredCity:city,paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1},f.scenario,policies,refs);
        assert.equal(r.projectedBase,base);assert.equal(r.basic,Math.round(base*.2*100)/100);
        assert.equal(r.partialSubtotal,Math.round((base*.2+1000)*100)/100);
        assert.equal(r.total,null);assert.equal(r.transition,null);assert.equal(r.reference?.year,year);
        assert.ok(r.assumptions.some(s=>s.includes(`${year}年度`)));
      }
    }
    const gs=refs.find(r=>r.province==='620000')!;assert.ok(gs.notes.some(s=>s.includes('沿用历史参数')));
    const hebei=refs.find(r=>r.province==='130000')!;assert.ok(!hebei.parameters.some(p=>p.kind==='indexBase'));
  }finally{db.close();}
});
