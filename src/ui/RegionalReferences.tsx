import { useState } from 'react';
import type { RegionalReference } from '../core/types';
import { regionalParameters,parameterLabels } from '../core/regions';
import { External,money,type Region } from './shared';
export function RegionalMatch({reference,city,asOf,regions}:{reference?:RegionalReference;city:string;asOf:string;regions:Region[]}){
  if(!reference)return null;
  const parameters=regionalParameters(reference,city);
  const indices=parameters.filter(p=>p.kind==='indexBase');
  const current=indices.find(p=>p.from.slice(0,7)<=asOf&&(!p.to||p.to.slice(0,7)>=asOf));
  const historical=current||indices[0];
  const cityName=regions.find(r=>r.code===reference.province)?.cities.find(c=>c.code===city)?.name||'';
  return <div className="regional-match"><strong>已按当前参保地匹配：{reference.name} · {cityName}</strong>
    <p>{historical?`${current?'地区指数参考工资':'已收录历史指数参考工资'}：${money(historical.value)}元/月 · ${historical.year}缴费年度`:'该地该年度缴费指数分母尚未核验，请提供本人官方指数。'}</p>
    {historical&&<small>{current?'该工资是计算个人缴费指数的分母，系统不会将它填入本人官方平均指数。':'不在资料截止月适用区间，不能直接用于当前或其他年度指数。'}<External url={historical.source.url}>查看参数原文</External></small>}
    <p className="muted">平均缴费指数需结合本人各年度缴费基数、当地年度分母和断缴等规则计算。仅选择地区不能得到本人官方指数。</p>
  </div>;
}
export function RegionalReferences({references,regions,query}:{references:RegionalReference[];regions:Region[];query:string}){
  const [province,setProvince]=useState('');const [city,setCity]=useState('');
  const filtered=references.filter(ref=>(!province||ref.province===province)&&(!query||`${ref.name}${ref.parameters.map(p=>p.source.title).join('')}`.includes(query)||regions.find(r=>r.code===ref.province)?.cities.some(c=>c.name.includes(query))));
  return <section className="nationwide-section"><div className="section-heading"><div><h2>全国省市政策查询</h2><p className="muted">31个省级地区与各地城市、直辖市区县目录。官方入口均已收录；数值逐项标明年度，缺失参数不代填。</p></div><span className="tag">{filtered.length} 个地区</span></div>
    <div className="reference-filters"><label>筛选省份<select aria-label="查询省份" value={province} onChange={e=>{setProvince(e.target.value);setCity('');}}><option value="">全国所有省份</option>{regions.map(r=><option key={r.code} value={r.code}>{r.name}</option>)}</select></label><label>筛选城市<select aria-label="查询城市" disabled={!province} value={city} onChange={e=>setCity(e.target.value)}><option value="">全部城市 / 省级范围</option>{regions.find(r=>r.code===province)?.cities.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label></div>
    <div className="policy-grid">{filtered.map(ref=>{
      const region=regions.find(r=>r.code===ref.province);
      const searchCity=region?.cities.find(c=>query&&c.name.includes(query))?.code;
      const selectedCity=city||searchCity||'';
      const values=regionalParameters(ref,selectedCity);
      const cityName=region?.cities.find(c=>c.code===selectedCity)?.name;
      return <article className="card reference-card" key={ref.province}><div className="section-heading"><h3>{ref.name}{cityName?` · ${cityName}`:''}</h3><span className="tag">{values.length?'部分参数已核验':'官方入口已收录'}</span></div>
        <div className="city-links" aria-label={`${ref.name}城市查询`}>{(cityName?region?.cities.filter(c=>c.code===selectedCity):region?.cities)?.map(c=><button className="city-chip" key={c.code} onClick={()=>{setProvince(ref.province);setCity(c.code);}}>{c.name}</button>)}</div>
        {values.length?<div className="reference-values">{values.map(p=><div key={`${p.kind}-${p.year}`}><span>{parameterLabels[p.kind]} <small>{p.year}年度</small></span><strong>¥ {money(p.value)}</strong><small>适用区间 {p.from} 至 {p.to||'以原文及后续政策为准'}{p.to&&p.to<new Date().toISOString().slice(0,10)?' · 历史参数':''}</small><External url={p.source.url}>{p.source.title}</External></div>)}</div>:<p className="muted">该范围的必要数值尚未完整核验。可查询全国退休规则和当地官方入口，暂不输出完整养老金金额。</p>}
        {!selectedCity&&ref.parameters.some(p=>p.excludeCities?.length)&&<p className="amber">存在城市例外，请选择具体城市确认适用值。</p>}
        <details><summary>适用提醒与来源信息</summary><ul>{ref.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>{values.map(p=><p className="muted" key={`${p.kind}-${p.year}`}>{parameterLabels[p.kind]}：{p.source.documentNo} · 发布 {p.source.publishedAt}</p>)}<p className="muted">资料核验 {ref.reviewedAt}；核验年度参数不表示当年最新文件已全部检索完毕。</p></details>
        <External url={ref.portal.url}>{ref.portal.title}</External>
      </article>;
    })}</div>{!filtered.length&&<div className="notice">未找到匹配地区，请调整省市筛选或搜索关键词。</div>}
  </section>;
}
