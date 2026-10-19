import { Field } from './shared';
import { useId } from 'react';

export function RetirementChoice({offset,maxEarlyMonths,onChange}:{offset:number;maxEarlyMonths:number|null;onChange:(offset:number)=>void}){
  const allowedMonths=maxEarlyMonths===null?null:Math.min(36,maxEarlyMonths);
  const errorId=useId();
  const error=!Number.isFinite(offset)?'请填写有效的提前年数。':!Number.isInteger(offset)?'提前年数须对应整数个月，例如1.5年等于18个月。':offset < -(allowedMonths??36)?`提前${Number((-offset/12).toFixed(6))}年超出范围：按你的出生年月和退休类别，最多可提前${Math.floor((allowedMonths??36)/12)}年${(allowedMonths??36)%12}个月。` :'';
  const hint=allowedMonths===null?'请先确认出生年月和退休类别。':`相对调整后的法定退休时间，最多可提前${Math.floor(allowedMonths/12)}年${allowedMonths%12}个月；不能早于原法定退休年龄，还需满足缴费条件。`;
  return <div><Field label="提前退休年限（年）" required hint={`手动输入N年，0表示不提前；可填1.5年等对应整数月的数值。${offset>0?`当前方案延迟${offset}个月，输入此项将改为提前退休。`:''}${hint}`}>
    <input required aria-label="提前退休年限（年）" aria-invalid={!!error} aria-describedby={error?errorId:undefined} type="number" min={0} max={(allowedMonths??36)/12} step="any" placeholder="输入提前年数，如1.5" value={Number.isFinite(offset)?Number((Math.max(0,-offset)/12).toFixed(6)):''} onChange={e=>{
      if(e.target.value===''||Number(e.target.value)<0){onChange(NaN);return;}
      const months=Number(e.target.value)*12;
      onChange(-(Math.abs(months-Math.round(months))<1e-6?Math.round(months):months));
    }}/>
  </Field>{error&&<div className="retirement-error" id={errorId} role="alert"><p>{error}请修改后重新测算。</p>{allowedMonths!==null&&<button type="button" className="text-button" onClick={()=>onChange(-allowedMonths)}>按允许的最大提前时间测算</button>}</div>}</div>;
}
