import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate} from '../src/core/engine';
import {seedPolicies} from '../src/data/policies';
import {fixtureFor} from '../server/validation';
const gd=seedPolicies.find(p=>p.id==='guangdong-2026-v1')!;
const base=fixtureFor(gd);
test('未接入山东金额公式时仍计算退休年月、缴费月数和年限条件',()=>{
  const f=fixtureFor(seedPolicies.find(p=>p.formula==='zhejiang')!);
  const r=calculate({...f.input,birth:'1990-06',firstInsured:'2016-01',paidMonths:120,province:'370000',city:'370600',insuredProvince:'370000',insuredCity:'370100'},f.scenario,seedPolicies);
  assert.equal(r.retirementMonth,'2053-06');assert.equal(r.totalMonths,440);assert.equal(r.eligible,true);
  assert.equal(r.basic,null);assert.equal(r.total,null);assert.match(r.missing.join(''),/必要政策尚未核验/);
  const invalid=calculate({...f.input,province:'370000',city:'370600',firstInsured:'2026-10',paidMonths:120},f.scenario,seedPolicies);
  assert.equal(invalid.eligible,false);assert.match(invalid.missing.join(''),/实际缴费月数超过首次/);
});
test('广东地方项目未知只给已测算分项合计，不能冒充完整养老金',()=>{
  const missing=calculate({...base.input,localAmount:undefined},base.scenario,seedPolicies);
  assert.equal(missing.total,null);assert.equal(missing.local,null);
  assert.equal(missing.partialSubtotal,2898.6);
  const confirmed=calculate({...base.input,localAmount:180},base.scenario,seedPolicies);
  assert.equal(confirmed.local,180);assert.equal(confirmed.total,3078.6);
});
test('广东低于0.6平均指数时采用a系数，不能统一套用1',()=>{
  const r=calculate({...base.input,averageIndex:.3},base.scenario,seedPolicies);
  assert.equal(r.basic,759.44);
});
test('广东2026年过渡性按1.2%计算且不把地方项目混入',()=>{
  const r=calculate({...base.input,firstInsured:'1990-01',transitionMonths:60,transitionIndex:1.2,localAmount:180},base.scenario,seedPolicies);
  assert.equal(r.transition,683.5);assert.equal(r.total,3762.1);
});
test('上海1993—1997参保也需确认虚账实记',()=>{
  const f=fixtureFor(seedPolicies.find(p=>p.formula==='shanghai')!);
  const r=calculate({...f.input,firstInsured:'1995-01'},f.scenario,seedPolicies);
  assert.equal(r.transition,null);assert.equal(r.total,null);
});
test('无效余额不产生可展示的个人账户金额',()=>{
  const r=calculate({...base.input,balanceDate:'2027-01'},base.scenario,seedPolicies);
  assert.equal(r.account,null);
});
test('延迟退休法定时不足不输出负数短缺月数',()=>{
  const r=calculate({...base.input,paidMonths:170},{...base.scenario,retirementOffset:36},seedPolicies);
  assert.equal(r.eligible,false);assert.equal(r.total,null);assert.doesNotMatch(r.missing.join(''),/还差-/);
});
test('北京基础养老金沿用Z实指数乘以全部年限，不把视同指数统一按1混算',()=>{
  const f=fixtureFor(seedPolicies.find(p=>p.formula==='beijing')!);
  const r=calculate({...f.input,firstInsured:'1990-01',paidMonths:300,deemedMonths:24,averageIndex:1.2,bjPre98Months:60},f.scenario,seedPolicies);
  assert.equal(r.basic,3578.55);assert.equal(r.transition,963.92);
});
test('杭州按两位折年并对总额进角，其他市不借用杭州地方口径',()=>{
  const f=fixtureFor(seedPolicies.find(p=>p.id==='zhejiang-2026-v1')!);
  const r=calculate({...f.input,paidMonths:241},f.scenario,seedPolicies);
  assert.equal(r.basic,1714.23);assert.equal(r.total,2714.3);assert.equal(r.rounding,.07);
  assert.equal(calculate({...f.input,city:'330200'},f.scenario,seedPolicies).total,null);
});

test('宁波两处同时选择可展示省级公式分项合计，完整待遇仍待地方核验',()=>{
  const f=fixtureFor(seedPolicies.find(p=>p.id==='zhejiang-2026-v1')!);
  const input={...f.input,birth:'1991-04',firstInsured:'2014-06',paidMonths:147,contributionBase:9430,city:'330200',insuredCity:'330200',accountBalance:undefined,averageIndex:undefined};
  const r=calculate(input,f.scenario,seedPolicies);
  assert.equal(r.retirementMonth,'2054-04');assert.equal(r.totalMonths,477);
  assert.equal(r.basic,3570.94);assert.equal(r.account,3075.63);
  assert.equal(r.partialSubtotal,6646.57);assert.equal(r.total,null);assert.equal(r.status,'partial');
  assert.match(r.assumptions.join(''),/不是完整待遇金额/);
  const missingBalance=calculate({...input,accountBalance:10000,balanceDate:'2025-12'},f.scenario,seedPolicies);
  assert.equal(missingBalance.account,null);assert.equal(missingBalance.partialSubtotal,undefined);
  const missingTransition=calculate({...input,firstInsured:'1990-01'},f.scenario,seedPolicies);
  assert.equal(missingTransition.transition,null);assert.equal(missingTransition.partialSubtotal,undefined);
  const insufficient=calculate({...f.input,city:'330200',insuredCity:'330200',paidMonths:12},f.scenario,seedPolicies);
  assert.equal(insufficient.partialSubtotal,undefined);
});
