import { useState } from 'react';
import type { Policy, Source,RegionalReference } from '../core/types';
import { type Region, External,money } from './shared';
import { BookOpen,Search,ShieldCheck } from 'lucide-react';
import { RegionalReferences } from './RegionalReferences';
export function Policies({policies,regions,nationalSources,references}:{policies:Policy[];regions:Region[];nationalSources:Source[];references:RegionalReference[]}){
  const [query,setQuery]=useState('');
  const matchedRegions=regions.flatMap(r=>r.name.includes(query)?[r.code,...r.cities.filter(c=>c.code==='440300').map(c=>c.code)]:r.cities.filter(c=>c.name.includes(query)).map(c=>c.code==='440300'?c.code:r.code));
  return <><div className="page-title"><span className="eyebrow">POLICY LIBRARY</span><h1>每一个数字，都有依据。</h1><p>按适用地区、时间与人群匹配政策。参数年份和核验状态始终公开。</p></div><div className="coverage-banner"><ShieldCheck/><div><strong>全国31个省级地区与城市查询</strong><p>全国官方入口及部分地方参数已收录；金额测算目前接入北京、上海、广东、浙江的限定范围。地方差异和缺失项会明确提示。</p></div></div>
    <div className="searchbox"><Search size={18}/><input aria-label="搜索地区政策" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索省份、城市或政策名称"/></div>
    <RegionalReferences references={references} regions={regions} query={query}/>
    <h2>已接入测算的政策版本</h2>
    <div className="policy-grid">{policies.filter(p=>!query||`${p.name}${p.sources.map(s=>s.title).join('')}`.includes(query)||matchedRegions.includes(p.region)).map(p=><article className="card policy-card" key={p.id}><div className="section-heading"><h2>{p.name}{p.effectiveTo==='2025-12-31'?' · 历史参数':''}</h2><span className="tag">{p.formula==='shenzhen'||p.formula==='guangdong'?'部分待核验':'限定范围已接入'}</span></div><p className="muted">{p.scope}</p><div className="policy-numbers"><div><small>养老金计发基数 · {p.parameterYear}年</small><strong>¥ {money(p.base)}</strong></div><div><small>缴费参考上下限 · {p.contribution.year}年</small><strong>{p.contribution.min.toLocaleString()} — {p.contribution.max.toLocaleString()}</strong></div></div><p className="muted">生效：{p.effectiveFrom} 至 {p.effectiveTo||'后续政策替代'}<br/>核验：{p.verifiedAt} · 版本 {p.version}</p><ul>{p.limitations.map(x=><li key={x}>{x}</li>)}</ul><details><summary>官方来源与文号</summary>{p.sources.map(s=><div className="source" key={s.url}><External url={s.url}>{s.title}</External><small>{s.documentNo} · 发布 {s.publishedAt}</small></div>)}</details></article>)}</div>
    <section className="card"><h2><BookOpen size={20}/> 国家规则</h2><div className="national-sources">{nationalSources.map(s=><div className="source" key={s.url}><External url={s.url}>{s.title}</External><small>{s.documentNo}</small></div>)}</div></section>
    <section className="card"><h2>金额测算覆盖（省级范围）</h2><div className="region-chips">{regions.filter(r=>!query||r.name.includes(query)||r.cities.some(c=>c.name.includes(query))).map(r=><span className={policies.some(p=>p.region===r.code)?'covered':''} key={r.code}>{r.name}<small>{policies.some(p=>p.region===r.code)?'已接入，见适用范围':'金额测算待接入'}</small></span>)}</div></section>
  </>;
}
