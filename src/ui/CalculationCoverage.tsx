import {useMemo,useState} from 'react';
import type {Policy,RegionalReference} from '../core/types';
import {calculationCoverage} from '../core/coverage';
import type {Region} from './shared';
export function CalculationCoverage({regions,policies,references,asOf,query='',onSelect}:{regions:Region[];policies:Policy[];references:RegionalReference[];asOf:string;query?:string;onSelect?:(province:string,city:string)=>void}){
  const [selected,setSelected]=useState('');
  const rows=useMemo(()=>calculationCoverage(regions,policies,references,asOf),[regions,policies,references,asOf]);
  const matching=rows.filter(r=>!query||r.name.includes(query)||r.cities.some(c=>c.name.includes(query)));
  const filtered=selected&&!query?matching.filter(r=>r.code===selected):matching;
  const chosen=filtered.find(r=>r.code===selected)||(filtered.length===1?filtered[0]:undefined);
  return <section className="card"><div className="section-heading"><div><h2>全国基础测算覆盖</h2><p className="muted">{rows.filter(r=>r.cities.length).length}个省级地区 · {rows.reduce((n,r)=>n+r.cities.length,0)}个可选城市 / 区县 · {rows.filter(r=>r.meetsMinimum).length}/{rows.length}个地区达到覆盖目标</p></div><span className="tag">基础＋个人账户</span></div>
    <p>覆盖各省全部地级地区，包含省会和主要经济城市；地级地区不足10个的省区全部覆盖，直辖市按区县选择。缴费资料有效且满足领取条件时，先显示可计算分项；过渡性、地方待遇未核验不阻断基础分项，也不按零计入。</p>
    <p className="muted">“地方公式”与“通用参考”均不代表所有特殊待遇已核验；“工资情景”是明示假设，不能当作当地正式计发标准。以下为{asOf}资料月份可选范围，不是GDP排名。</p>
    <label>查看可测算省份<select aria-label="查看可测算省份" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">全部省份</option>{rows.map(r=><option key={r.code} value={r.code}>{r.name} · {r.cities.length}项</option>)}</select></label>
    <div className="table-scroll"><table><thead><tr><th>省级地区</th><th>可选 / 目标</th><th>地方公式</th><th>通用参考</th><th>工资情景</th><th>城市列表</th></tr></thead><tbody>{filtered.map(r=><tr key={r.code}><td>{r.name}</td><td>{r.cities.length} / {r.required}{r.meetsMinimum?' ✓':' 待补齐'}</td><td>{r.local}</td><td>{r.reference}</td><td>{r.scenario}</td><td><button className="text-button" onClick={()=>setSelected(r.code)}>查看{r.name}可测算城市</button></td></tr>)}</tbody></table></div>
    {chosen&&<div><h3>{chosen.name} · {chosen.cities.length}个可测算地区</h3><div className="city-links">{chosen.cities.map(c=><button className="city-chip" key={c.code} onClick={()=>onSelect?.(chosen.code,c.code)} disabled={!onSelect} title={`${c.basis==='local-formula'?'地方公式':c.basis==='wage-scenario'?'工资参考情景':'通用公式参考'} · ${c.year}年度参数`}>{c.name}{onSelect?' · 去测算':''}</button>)}</div></div>}
  </section>;
}
