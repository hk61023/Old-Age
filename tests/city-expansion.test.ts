import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {openStore,activePolicies,regionalReferences} from '../server/store';
import {regionList} from '../server/app';
import {applyCityCoverageUpdate} from '../server/reference-updates';
import {bingtuanCities} from '../src/data/regions';
import {calculationCoverage} from '../src/core/coverage';
import {regionalParameters} from '../src/core/regions';
import {calculate} from '../src/core/engine';
import {fixtureFor} from '../server/validation';
import {Policies} from '../src/ui/Policies';

test('31省全部现行目录地区均有基础及账户结果，涵盖各省前十经济城市而非只填十个代码',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),coverage=calculationCoverage(regionList(),policies,refs,'2026-10'),f=fixtureFor(policies[0]);
    assert.equal(coverage.length,31);assert.ok(coverage.every(r=>r.meetsMinimum));
    assert.equal(coverage.reduce((n,r)=>n+r.cities.length,0),450);
    for(const row of coverage){
      const all=regionList().find(p=>p.code===row.code)!;
      const current=all.cities.filter(c=>!['500105','500112'].includes(c.code));
      assert.deepEqual(row.cities.map(c=>c.code).sort(),current.map(c=>c.code).sort(),row.name);
      for(const c of row.cities)for(const identity of ['employee','flexible'] as const){
        const input={...f.input,province:row.code,city:c.code,insuredProvince:row.code,insuredCity:c.code,identity,paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1};
        const r=calculate(input,f.scenario,policies,refs);
        assert.ok(r.basic!==null&&r.basic>0,`${row.name}/${c.name}缺基础金额`);
        assert.equal(r.account,1000,`${row.name}/${c.name}账户金额`);
        assert.ok(r.total!==null||r.partialSubtotal!=null,`${row.name}/${c.name}缺分项合计`);
        if(r.reference){assert.equal(r.transition,null);assert.equal(r.local,null);assert.equal(r.total,null);assert.equal(r.status,'partial');}
      }
    }
  }finally{db.close();}
});

test('兵团12市使用明示区域工资情景，不能继承自治区缴费上下限或正式指数',()=>{
  const db=openStore(':memory:');try{
    const policies=activePolicies(db),refs=regionalReferences(db),xj=refs.find(r=>r.province==='650000')!,f=fixtureFor(policies[0]);
    for(const city of bingtuanCities){
      assert.deepEqual(regionalParameters(xj,city).map(p=>p.kind),['baseScenario']);
      const r=calculate({...f.input,province:'650000',city,insuredProvince:'650000',insuredCity:city,paidMonths:240,deemedMonths:0,firstInsured:'2006-01',accountBalance:139000,balanceDate:f.input.asOf,averageIndex:1},f.scenario,policies,refs);
      assert.equal(r.basic,1748.8);assert.equal(r.account,1000);assert.equal(r.partialSubtotal,2748.8);assert.equal(r.total,null);
      assert.ok(r.reference?.scenarioNote?.includes('不认定为兵团正式计发基数'));
      assert.ok(r.assumptions.some(a=>a.includes('上下限尚未核验')));
      assert.ok(!r.assumptions.some(a=>a.includes('参考当前参保地2026年度上下限')));
    }
    assert.ok(regionalParameters(xj,'650100').some(p=>p.kind==='contributionMin'&&p.value===5246));
  }finally{db.close();}
});

test('旧数据库增量补城只执行一次，保留已有城市修订、管理员、政策及旧快照',()=>{
  const db=openStore(':memory:');try{
    const row=db.prepare("SELECT body FROM regional_references WHERE province='650000'").get()!;
    const old=JSON.parse(String(row.body));for(const code of bingtuanCities)delete old.cityParameters[code];delete old.isolatedCities;
    old.cityParameters['650100'][0].value=9012;
    db.prepare("UPDATE regional_references SET body=? WHERE province='650000'").run(JSON.stringify(old));
    db.prepare('DELETE FROM settings WHERE key=?').run('reference-city-coverage-2026-10-19');
    db.prepare("INSERT INTO settings(key,value) VALUES('admin','fixture-existing-admin')").run();
    const policies=JSON.stringify(db.prepare('SELECT * FROM policies ORDER BY id,version').all());
    const other=JSON.stringify(db.prepare("SELECT * FROM regional_references WHERE province<>'650000' ORDER BY province").all());
    applyCityCoverageUpdate(db);const current=regionalReferences(db).find(r=>r.province==='650000')!;
    assert.equal(current.cityParameters['650100'][0].value,9012);assert.ok(bingtuanCities.every(c=>current.cityParameters[c]?.length));
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='admin'").get()!.value,'fixture-existing-admin');
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM policies ORDER BY id,version').all()),policies);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM regional_references WHERE province<>'650000' ORDER BY province").all()),other);
    const before=JSON.stringify(db.prepare('SELECT * FROM regional_references').all());applyCityCoverageUpdate(db);assert.equal(JSON.stringify(db.prepare('SELECT * FROM regional_references').all()),before);
    assert.equal(old.cityParameters['659001'],undefined);assert.equal(old.isolatedCities,undefined);
  }finally{db.close();}
});

test('覆盖界面公布实际可算数量，不再把已支持的省份说成金额待接入',()=>{
  const db=openStore(':memory:');try{
    const html=renderToStaticMarkup(createElement(Policies,{policies:activePolicies(db),regions:regionList(),nationalSources:[],references:regionalReferences(db),asOf:'2026-10'}));
    assert.ok(html.includes('450'));assert.ok(html.includes('全国基础测算覆盖'));
    assert.ok(!html.includes('金额测算目前接入北京'));assert.ok(!html.includes('金额测算待接入'));
    assert.ok(html.includes('26个地区可测算基础分项'));assert.ok(html.includes('工资情景'));
  }finally{db.close();}
});
