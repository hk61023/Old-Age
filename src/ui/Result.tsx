import type { Calculation, Policy } from '../core/types';
import { money,External } from './shared';
import { ArrowUpRight,Check,Info,Save,ShieldCheck } from 'lucide-react';
export function Result({result:r,policy,onSave,onDetail,sample,onIncome}:{result:Calculation;policy?:Policy;onSave:()=>void;onDetail:()=>void;sample:boolean;onIncome?:()=>void}){
  const totalKnown=(r.basic||0)+(r.account||0)+(r.transition||0)+(r.local||0);
  const shownAmount=r.total??r.partialSubtotal;
  const provincialSubtotal=r.total===null&&r.partialSubtotal!=null;
  const policyUnavailable=r.missing.some(x=>x.includes('必要政策尚未核验'));
  return <aside className="results">
    <div className="result-card"><div className="result-heading"><span>{provincialSubtotal?(r.reference?'基础与账户参考合计':'已测算分项参考合计'):'退休后的每月养老金'}</span><span className="light-tag">{policyUnavailable?'政策未覆盖':r.status==='complete'?'情景测算':r.status==='partial'?'部分结果':'待补全'}</span></div>
      <div className="amount">{shownAmount!=null?<><span className="currency">¥</span>{money(shownAmount).split('.')[0]}<span className="decimal">.{money(shownAmount).split('.')[1]}</span></>:<span className="pending-amount">{policyUnavailable?'该地区计算政策待接入':r.status==='partial'?'尚不能合计':'等待有效信息'}</span>}</div>
      {policyUnavailable&&<p className="result-caption">不是必填资料缺失。该地区可能已收录参考参数，但养老金计算规则尚未核验，暂不输出金额。<button className="text-button" onClick={onDetail}>查看政策覆盖与来源</button></p>}
      {r.status==='blocked'&&!policyUnavailable&&r.missing.length>0&&<div className="result-blocker" role="alert"><strong>暂不能计算的原因</strong><ul>{[...new Set(r.missing)].map(x=><li key={x}>{x}</li>)}</ul></div>}
      {provincialSubtotal&&<p className="result-caption">仅合计下方已测算分项，未核验待遇暂不纳入；最终核定及取整以经办为准。此金额不是完整养老金。</p>}
      {r.reference?.basis==='wage-scenario'&&<p className="result-caption">基数参考情景：¥ {money(r.reference.baseValue!)} · {r.reference.year}参数年度。{r.reference.scenarioNote} 正式计发基数尚未核实。</p>}
      <p className="result-caption">{sample?'当前为示例资料，可在左侧修改。':'按你的资料与所选假设测算。'}<br/>退休首月名义金额，实际待遇以经办核定为准。</p>
      <div className="stack-bar" aria-label="养老金构成比例">{[['basic',r.basic],['account',r.account],['transition',r.transition]].map(([key,v])=><span key={key as string} className={key as string} style={{width:totalKnown?`${(Number(v)||0)/totalKnown*100}%`:'0%'}}/>)}</div>
      <div className="parts">{[['基础养老金',r.basic,'basic'],['个人账户养老金',r.account,'account'],...(r.transition!==null?[['过渡性养老金',r.transition,'transition']]:[]),...(r.local!==null&&(policy?.formula==='guangdong'||policy?.formula==='shenzhen')?[['地方项目（核定值）',r.local,'transition']]:[])].map(([label,value,k])=><div key={label as string}><span><i className={k as string}/>{label}</span><strong>{value==null?'待核定':`¥ ${money(Number(value))}`}</strong></div>)}</div>
      {r.rounding>0&&<div className="parts"><div><span>见分进角补足</span><strong>¥ {money(r.rounding)}</strong></div></div>}
      <button className="save-btn" onClick={onSave} disabled={!r.policyId&&!r.reference}><Save size={16}/>保存此方案到本机</button>
    </div>
    {onIncome&&<button className="secondary income-result-link" onClick={onIncome}>查看本地收入参照 <ArrowUpRight size={16}/></button>}
    <div className="card retirement-card"><div className="section-heading"><h3>你的退休时间线</h3><span className="mini-icon">↗</span></div><div className="timeline"><div><i/><span>法定退休年月</span><strong>{r.statutoryMonth||'待确认'}</strong></div><div><i/><span>本方案退休年月</span><strong>{r.retirementMonth||'待确认'}</strong></div><div><i/><span>预计首月领取</span><strong>{r.firstPaymentMonth||'待确认'}</strong></div></div><div className="retire-age">{r.retirementAgeMonths?`${Math.floor(r.retirementAgeMonths/12)}岁${r.retirementAgeMonths%12}个月`:'—'}<span>本方案退休年龄</span></div>
    {r.originalRetirementAge!==undefined&&<div className="retirement-breakdown"><span>原法定基础年龄 <strong>{r.originalRetirementAge}岁</strong></span><span>按出生年月延迟 <strong>{Math.floor((r.statutoryDelayMonths||0)/12)}年{(r.statutoryDelayMonths||0)%12}个月</strong></span><span>调整后法定年龄 <strong>{Math.floor((r.statutoryAgeMonths||0)/12)}岁{(r.statutoryAgeMonths||0)%12}个月</strong></span><small>全国渐进式规则按出生月份计算；弹性退休调整另计。未采用统一加龄。</small></div>}
    <div className="eligibility"><span className={r.eligible?'green':'amber'}>{r.eligible?<Check size={15}/>:<Info size={15}/>} {r.eligible?'预计达到最低缴费年限':'领取条件待满足'}</span><p>{r.minMonths?`预计累计 ${r.totalMonths} 个月 · 最低要求 ${r.minMonths} 个月`:'请补全有效资料后核对累计月数和最低要求'}</p></div></div>
    <div className="policy-summary"><ShieldCheck size={20}/><div><strong>{policy?`${policy.name} · 政策有据可查`:r.reference?`${r.reference.name} · 通用公式参考`:'该地区政策待核验'}</strong><p>{policy?`计发参数 ${policy.parameterYear} 年度 · 核验于 ${policy.verifiedAt}`:r.reference?`${r.reference.basis==='wage-scenario'?'工资基数参考情景':r.reference.sources.some(s=>/样例|案例/.test(s.title))?'历史案例基数情景':'参考计发参数'} ${r.reference.year} 年度 · 地方待遇未完整核验`:'不会用其他地区的参数代算'}</p><button className="text-button" onClick={onDetail}>查看适用范围与来源 <ArrowUpRight size={13}/></button></div></div>
    {r.missing.length>0&&<div className="notice warning"><strong>还需要确认</strong><ul>{[...new Set(r.missing)].map(x=><li key={x}>{x}</li>)}</ul></div>}
    <details className="card result-details"><summary>展开计算依据与假设 <span>{r.assumptions.length} 项假设</span></summary><dl><dt>退休时计发基数（预测）</dt><dd>{money(r.projectedBase)}</dd><dt>退休时平均缴费指数（估算）</dt><dd>{r.averageIndex??'—'}</dd><dt>退休时个人账户（预测）</dt><dd>{money(r.projectedBalance)}</dd><dt>个人账户计发月数</dt><dd>{r.divisor??'—'}</dd><dt>未来个人养老缴费合计</dt><dd>¥ {money(r.futurePersonalCost)}</dd></dl><p>{r.regionResolution}</p>{r.replaced.length>0&&<><h4>已采用的本人资料</h4><ul>{r.replaced.map(x=><li key={x}>{x}</li>)}</ul></>}<h4>当前假设</h4><ul>{r.assumptions.map(x=><li key={x}>{x}</li>)}</ul><h4>适用提醒</h4><ul>{r.warnings.map(x=><li key={x}>{x}</li>)}</ul>{r.reference?.sources.map(s=><p key={s.url}><External url={s.url}>{s.title}</External></p>)}{policy?.sources.filter(s=>s.kind!=='directory').map(s=><p key={s.url}><External url={s.url}>{s.title}</External></p>)}</details>
  </aside>;
}
