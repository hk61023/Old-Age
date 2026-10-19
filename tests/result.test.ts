import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Result} from '../src/ui/Result';
import {RetirementChoice} from '../src/ui/RetirementChoice';
import {calculate} from '../src/core/engine';
import {seedPolicies} from '../src/data/policies';
import {seedRegionalReferences} from '../src/data/regions';
import {fixtureFor} from '../server/validation';

test('提前10年明确阻断并显示原因；按3年或1.5年可正常测算',()=>{
  const f=fixtureFor(seedPolicies[0]);
  const input={...f.input,birth:'1990-06',firstInsured:'2016-01',paidMonths:120};
  const blocked=calculate(input,{...f.scenario,retirementOffset:-120},seedPolicies);
  assert.equal(blocked.total,null);assert.equal(blocked.status,'blocked');
  assert.match(blocked.missing.join(''),/提前10年.*最多提前3年/);
  const html=renderToStaticMarkup(createElement(Result,{result:blocked,onSave:()=>{},onDetail:()=>{},sample:false}));
  assert.match(html,/暂不能计算的原因/);assert.match(html,/提前10年/);
  const field=renderToStaticMarkup(createElement(RetirementChoice,{offset:-120,maxEarlyMonths:36,onChange:()=>{}}));
  assert.match(field,/aria-invalid="true"/);assert.match(field,/按允许的最大提前时间测算/);
  for(const offset of [-36,-18]){
    const r=calculate(input,{...f.scenario,retirementOffset:offset},seedPolicies);
    assert.notEqual(r.total,null);assert.ok(r.eligible);assert.equal(r.retirementAgeMonths,756+offset);
  }
  const older=renderToStaticMarkup(createElement(RetirementChoice,{offset:-12,maxEarlyMonths:5,onChange:()=>{}}));
  assert.match(older,/最多可提前0年5个月/);
});

test('工资情景显著标注；未核验的过渡性和地方金额行隐藏，缺失说明保留',()=>{
  const f=fixtureFor(seedPolicies[0]);
  const result=calculate({...f.input,province:'460000',city:'460100',insuredProvince:'460000',insuredCity:'460100'},f.scenario,seedPolicies,seedRegionalReferences);
  const html=renderToStaticMarkup(createElement(Result,{result,onSave:()=>{},onDetail:()=>{},sample:false}));
  assert.match(html,/基数参考情景/);assert.match(html,/24762÷3/);assert.match(html,/不是完整养老金/);
  assert.doesNotMatch(html,/过渡性养老金<\/span>/);assert.doesNotMatch(html,/地方项目（核定值）/);
  assert.match(html,/基础养老金/);assert.match(html,/个人账户养老金/);
});

test('核验后已知的过渡项仍显示，地方未知不阻断基础分项合计',()=>{
  const policy=seedPolicies.find(p=>p.id==='guangdong-2026-v1')!,f=fixtureFor(policy);
  const result=calculate({...f.input,firstInsured:'1990-01',transitionMonths:60,transitionIndex:1.2,localAmount:undefined},f.scenario,seedPolicies);
  const html=renderToStaticMarkup(createElement(Result,{result,policy,onSave:()=>{},onDetail:()=>{},sample:false}));
  assert.equal(result.total,null);assert.equal(result.partialSubtotal,3582.1);
  assert.match(html,/过渡性养老金<\/span>/);assert.doesNotMatch(html,/地方项目（核定值）/);
});
