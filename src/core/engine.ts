import type { Category, PersonalInput, Policy, Scenario, Calculation, Experience, RegionalReference } from './types';
import {referenceBase,regionalParameters} from './regions';
export const ENGINE_VERSION = '1.3.0';
export const monthNumber = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? Number(s.slice(0,4))*12 + Number(s.slice(5))-1 : NaN;
export const monthText = (n: number) => `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
export const todayMonth = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
export const rounded = (n: number, digits=2) => Number(n.toFixed(digits));
export const divisors: Record<number,number> = {40:233,41:230,42:226,43:223,44:220,45:216,46:212,47:208,48:204,49:199,50:195,51:190,52:185,53:180,54:175,55:170,56:164,57:158,58:152,59:145,60:139,61:132,62:125,63:117,64:109,65:101,66:93,67:84,68:75,69:65,70:56};
export function retirement(birth:string, category:Category) {
  if(category==='unknown'||!Number.isFinite(monthNumber(birth))) return null;
  const original = category==='male60'?60:category==='female55'?55:50;
  const start = monthNumber(category==='male60'?'1965-01':category==='female55'?'1970-01':'1975-01');
  const elapsed = monthNumber(birth)-start;
  const delay = elapsed<0?0:Math.min(category==='female50'?60:36,Math.floor(elapsed/(category==='female50'?2:4))+1);
  return { original, delayMonths:delay, ageMonths:original*12+delay, month:monthNumber(birth)+original*12+delay };
}
export const minimumMonths = (year:number) => 180+Math.max(0,Math.min(10,year-2029))*6;
export function resolveLocation(household:string, relationship:string, experiences:Experience[], complete:boolean) {
  if(!household||!relationship||!complete) return {region:null,reason:'参保经历或账户性质未确认，待遇领取地需核实'};
  if(household===relationship) return {region:household,reason:'养老保险关系在户籍省份'};
  const valid=experiences.filter(e=>!e.temporary);
  const sums = new Map<string,number>(); valid.forEach(e=>sums.set(e.province,(sums.get(e.province)||0)+e.months));
  if((sums.get(relationship)||0)>=120) return {region:relationship,reason:'养老保险关系所在地累计缴费满10年'};
  const last=[...valid].reverse().find(e=>(sums.get(e.province)||0)>=120);
  return last?{region:last.province,reason:'回溯最后一个累计缴费满10年的非临时账户省份'}:{region:household,reason:'各参保省份均未满10年，归集户籍省份'};
}
export function selectPolicy(policies:Policy[], province:string, city:string, retirementMonth:string, asOf:string) {
  const region=city==='440300'?'440300':province;
  const eligible=policies.filter(p=>p.status==='published'&&p.region===region);
  const chosen=eligible.filter(p=>p.effectiveFrom.slice(0,7)<=retirementMonth&&(!p.effectiveTo||p.effectiveTo.slice(0,7)>=retirementMonth));
  // A later retirement projects the policy currently in force, never a future unpublished rule.
  const current=eligible.filter(p=>p.effectiveFrom.slice(0,7)<=asOf&&(!p.effectiveTo||p.effectiveTo.slice(0,7)>=asOf));
  return (chosen.length?chosen:retirementMonth>asOf?current:[]).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.parameterYear-a.parameterYear||b.version-a.version)[0];
}
export function recordIssues(records:PersonalInput['records'], asOf:string, birth?:string):string[] {
  const errors:string[]=[]; const seen=new Set<number>();
  records.forEach((r,i)=>{
    const a=monthNumber(r.start),b=monthNumber(r.end);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||b>monthNumber(asOf)||(birth&&a<monthNumber(birth)+16*12)||b-a>720) {errors.push(`第${i+1}行日期无效、超过资料截止月或早于16周岁`);return;}
    if(!Number.isFinite(r.base)||r.base<=0||r.base>1000000) errors.push(`第${i+1}行缴费基数须在0到100万元之间`);
    for(let m=a;m<=b;m++){if(seen.has(m)){errors.push(`第${i+1}行存在重复缴费月份：${monthText(m)}`);break;}seen.add(m);}
  }); return errors;
}
export function calculate(input:PersonalInput, s:Scenario, policies:Policy[], references:RegionalReference[]=[]):Calculation {
  const r:Calculation={engineVersion:ENGINE_VERSION,status:'blocked',total:null,basic:null,account:null,transition:null,local:null,rounding:0,statutoryMonth:'',retirementMonth:'',firstPaymentMonth:'',retirementAgeMonths:0,minMonths:0,totalMonths:0,eligible:false,futurePersonalCost:0,futureMonths:0,projectedBalance:null,projectedBase:null,averageIndex:null,divisor:null,missing:[],assumptions:[],replaced:[],warnings:[],policyId:null,policyVersion:null,regionResolution:''};
  const birth=monthNumber(input.birth), asOf=monthNumber(input.asOf);
  if(!Number.isFinite(birth)||!Number.isFinite(asOf)||birth>asOf-16*12||birth<monthNumber('1940-01')||input.asOf>todayMonth()) r.missing.push('请填写有效出生年月和不晚于当前月份的资料截止月');
  if(!Number.isInteger(input.paidMonths)||input.paidMonths<0||input.paidMonths>720||!Number.isInteger(input.deemedMonths)||input.deemedMonths<0||input.deemedMonths>480) r.missing.push('缴费月数须为非负整数，且不超过合理范围');
  if(!Number.isFinite(input.contributionBase)||input.contributionBase<=0||input.contributionBase>1000000) r.missing.push('请填写有效的当前月缴费基数');
  if(input.averageIndex!==undefined&&(!Number.isFinite(input.averageIndex)||input.averageIndex<=0||input.averageIndex>10)) r.missing.push('平均缴费指数须大于0且不超过10');
  for(const v of [input.transitionMonths,input.bjPre98Months])if(v!==undefined&&(!Number.isInteger(v)||v<0||v>input.paidMonths+input.deemedMonths))r.missing.push('过渡性计发月数须为非负整数且不超过历史缴费月数');
  for(const v of [input.transitionIndex,input.shVirtualBalance])if(v!==undefined&&(!Number.isFinite(v)||v<0||v>100000000))r.missing.push('过渡性参数须为有效非负数');
  if(input.bjPre98Months!==undefined&&input.bjPre98Months>69)r.missing.push('1992年10月至1998年6月最多69个月');
  if(input.experiences.some(e=>!Number.isInteger(e.months)||e.months<0||e.months>720))r.missing.push('跨省参保经历的月数必须是有效非负整数');
  if(!Number.isInteger(s.retirementOffset))r.missing.push('退休调整须为整数个月；提前年数须对应整数个月');
  else if(s.retirementOffset < -36)r.missing.push(`提前${rounded(-s.retirementOffset/12,6)}年超出普通弹性退休范围：最多提前3年，且不能早于原法定退休年龄。请修改提前年数`);
  else if(s.retirementOffset > 36)r.missing.push('弹性延迟退休最多3年（36个月），请修改退休时间微调');
  if(!Number.isFinite(s.contributionMultiplier)||s.contributionMultiplier<0.1||s.contributionMultiplier>5||![s.baseGrowth,s.accountInterest].every(v=>Number.isFinite(v)&&v>=0&&v<=0.15))r.missing.push('缴费基数倍数须为0.1至5，增长假设为0%至15%');
  if(input.firstInsured&&(!Number.isFinite(monthNumber(input.firstInsured))||monthNumber(input.firstInsured)<birth+192||monthNumber(input.firstInsured)>asOf)) r.missing.push('首次参保年月需介于16周岁和资料截止月之间');
  r.missing.push(...recordIssues(input.records,input.asOf,input.birth));
  const ret=retirement(input.birth,input.category);
  if(!ret) r.missing.push('请确认适用的原法定退休年龄类别；女性50岁与55岁类别不能仅凭性别判断');
  if(ret&&Number.isFinite(birth)&&Number.isFinite(asOf)&&birth<=asOf-16*12&&birth>=monthNumber('1940-01')){
    r.originalRetirementAge=ret.original;r.statutoryDelayMonths=ret.delayMonths;r.statutoryAgeMonths=ret.ageMonths;r.statutoryMonth=monthText(ret.month);
  }
  if(r.missing.length||!ret) return r;
  const target=ret.month+s.retirementOffset;
  r.statutoryMonth=monthText(ret.month);r.retirementMonth=monthText(target);r.firstPaymentMonth=monthText(target+1);r.retirementAgeMonths=target-birth;
  if(target<birth+ret.original*12) {r.missing.push('弹性提前退休不能低于原法定退休年龄');return r;}
  if(target<asOf) {r.missing.push('所选退休时间早于资料截止月，请调整截止月；本工具不重算已退休人员的历年待遇调整');return r;}
  r.futureMonths=target-asOf;
  r.minMonths=minimumMonths(Math.floor((s.retirementOffset>0?ret.month:target)/12));
  if(s.retirementOffset>0&&input.identity==='employee') r.warnings.push('弹性延迟退休须与单位协商一致；这里仅作符合该条件的情景测算');
  if(s.retirementOffset<0) r.warnings.push('弹性提前退休还需按规定提前告知单位并办理手续');
  if(input.specialCase) {r.missing.push('特殊工种、病残、机关事业单位转制等特殊经历需单独核定，当前普通职工模型不适用');return r;}
  if(input.crossProvince||input.insuredProvince!==input.province){const loc=resolveLocation(input.household,input.relationship,input.experiences,input.experiencesComplete);r.regionResolution=loc.reason;
    if(!loc.region||loc.region!==input.province||!input.locationConfirmed) r.warnings.push(`待遇领取地待确认：${loc.reason}。按所选地区进行情景测算，不代表领取地已核定`);
  } else r.regionResolution='按用户所选待遇领取地测算';
  const monthsFromRecords=input.records.reduce((sum,x)=>sum+monthNumber(x.end)-monthNumber(x.start)+1,0);
  if(input.records.length&&monthsFromRecords!==input.paidMonths&&input.recordChoice==='unconfirmed'){r.missing.push(`记录合计${monthsFromRecords}个月与汇总${input.paidMonths}个月不一致，请确认采用汇总或完整记录`);return r;}
  const paid=input.recordChoice==='records'&&input.records.length?monthsFromRecords:input.paidMonths;
  if(paid+input.deemedMonths>asOf-birth-192+1){r.missing.push('实际与视同缴费合计超过16周岁以来的可缴费月份');return r;}
  if(input.firstInsured&&paid>asOf-monthNumber(input.firstInsured)+1){r.missing.push('实际缴费月数超过首次参保至截止月的月份数');return r;}
  r.totalMonths=paid+input.deemedMonths+r.futureMonths;r.eligible=r.totalMonths>=r.minMonths;
  if(s.retirementOffset>0&&paid+input.deemedMonths+ret.month-asOf<r.minMonths){r.eligible=false;r.missing.push('法定退休时尚未达到最低缴费年限，应核实延长缴费手续，不能直接按弹性延迟退休处理');}
  if(r.totalMonths<r.minMonths)r.missing.push(`所选退休时间缴费不足，还差${r.minMonths-r.totalMonths}个月；不假设可以一次性补缴`);
  const p=selectPolicy(policies,input.province,input.city,r.retirementMonth,input.asOf);
  if(!p){
    const ref=references.find(x=>x.province===input.province),base=referenceBase(ref,input.city,input.asOf);
    if(ref&&base&&r.retirementMonth>=base.from.slice(0,7))return calculateReference(input,s,r,paid,ref,references);
    r.missing.push('该地区或适用日期的必要政策尚未核验，暂不输出金额');return r;
  }
  r.policyId=p.id;r.policyVersion=p.version;
  if(p.effectiveFrom.slice(8)!=='01'&&p.effectiveFrom.slice(0,7)===r.retirementMonth){r.missing.push('本月存在按日生效的政策切换，请核实实际申领日期后选择完整适用月份');return r;}
  r.warnings.push(...p.limitations);
  const targetYear=Math.floor(target/12);
  if(targetYear!==p.parameterYear) r.assumptions.push(`计发基数采用${p.parameterYear}年度已核验参数，未来年度按所选增长假设推算；未声称当年已公布`);
  if(p.effectiveTo&&r.retirementMonth>p.effectiveTo.slice(0,7)) r.assumptions.push(`退休时间超过现行文件有效期，假设届时延续当前规则`);
  if(p.contribution.year!==Math.floor(asOf/12))r.assumptions.push(`缴费上下限参考${p.contribution.year}年度标准，不能代替当年实际征缴标准`);
  let historicalIndex=input.averageIndex;
  if(historicalIndex!==undefined) r.replaced.push('历史缴费水平采用本人提供的官方平均缴费指数');
  else if(input.recordChoice==='records'&&input.records.length){
    let sum=0,count=0,complete=true;
    for(const row of input.records) for(let m=monthNumber(row.start);m<=monthNumber(row.end);m++){
      const year=Math.floor(m/12),denominator=p.historicalIndexBases[String(year)];
      if(!denominator||row.province!==input.province){complete=false;continue;}
      sum+=row.base/denominator;count++;
    }
    if(complete&&count===paid&&input.deemedMonths===0&&p.formula!=='beijing') {historicalIndex=sum/count;r.replaced.push('历史平均指数由完整记录和已核验对应年度分母计算');}
    else r.assumptions.push('历年指数分母、断缴或跨省规则不完整；记录用于校验月数，请补充官方平均缴费指数');
  }
  if(historicalIndex===undefined){historicalIndex=input.contributionBase/p.contribution.indexBase;r.assumptions.push('历史平均缴费指数暂用当前缴费基数与参考指数分母的比值代替，并非历年实际指数');}
  const paymentPolicy=selectPolicy(policies,input.insuredProvince,input.insuredCity,input.asOf,input.asOf);
  if(r.futureMonths>0&&!paymentPolicy){r.missing.push('未来缴费所在地区的上下限尚未核验，无法预测后续缴费和入账金额');return r;}
  const cp=paymentPolicy||p;
  const min=cp.cityMinimums?.[input.insuredCity]??cp.contribution.min;
  const currentBase=Math.min(cp.contribution.max,Math.max(min,input.contributionBase*s.contributionMultiplier));
  if(r.futureMonths>0)r.assumptions.push(`未来持续在当前参保地区缴费，使用${cp.name}${cp.contribution.year}年度参考上下限；跨省指数换算尚未核验时暂按领取地指数分母预测`);
  if(currentBase!==input.contributionBase*s.contributionMultiplier)r.warnings.push(`情景缴费基数按参考上下限调整为${currentBase.toFixed(2)}元/月`);
  let futureSum=0,futureIndex=0,interestAmount=0;
  for(let m=1;m<=r.futureMonths;m++){
    const growth=(1+s.baseGrowth)**(m/12),b=currentBase*growth;
    futureSum+=b;futureIndex+=b/(p.contribution.indexBase*growth);
    interestAmount=(interestAmount+b*.08)*(1+s.accountInterest)**(1/12);
  }
  r.futurePersonalCost=rounded(futureSum*(input.identity==='employee'?.08:.20));
  const actualAverage=rounded((historicalIndex*paid+futureIndex)/Math.max(1,paid+r.futureMonths),4);
  r.averageIndex=p.formula==='beijing'?actualAverage:rounded((historicalIndex*(paid+input.deemedMonths)+futureIndex)/Math.max(1,r.totalMonths),4);
  r.projectedBase=rounded(p.base*(1+s.baseGrowth)**Math.max(0,targetYear-p.parameterYear));
  r.assumptions.push(`静态/情景假设：计发及未来缴费基数年增长${rounded(s.baseGrowth*100)}%，未来账户年利率${rounded(s.accountInterest*100)}%；持续缴至退休当月`);
  const ceilDime=(v:number)=>Math.ceil((v-1e-8)*10)/10;
  const money=(v:number)=>p.formula.startsWith('shanghai')?ceilDime(v):rounded(v);
  let yearFactor=r.totalMonths/12*.01;
  if(p.formula==='shanghai')yearFactor=rounded(r.totalMonths/12,4)*.01;
  if(p.formula==='shanghai-old')yearFactor=Math.floor(r.totalMonths/12)*.01+(r.totalMonths%12)*.00083;
  if(p.formula==='beijing')yearFactor=rounded(r.totalMonths/12,2)*.01;
  if(p.formula==='zhejiang'&&input.city==='330100')yearFactor=rounded(r.totalMonths/12,2)*.01;
  const cityRulesPending=p.formula==='zhejiang'&&input.city!=='330100';
  const cityRulesMessage='该市取整和地方项目尚未专项核验，目前展示浙江省级公式的部分结果';
  if(cityRulesPending)r.missing.push(cityRulesMessage);
  const lowIndexFactor=p.formula==='guangdong'&&r.averageIndex<.6?r.averageIndex/.6:1;
  r.basic=money(r.projectedBase*(lowIndexFactor+r.averageIndex)/2*yearFactor);
  const ageYears=Math.min(70,Math.floor(r.retirementAgeMonths/12));r.divisor=divisors[ageYears]??null;
  if(r.retirementAgeMonths%12&& !p.formula.startsWith('shanghai'))r.assumptions.push('非整岁退休的个人账户计发月数暂按已满周岁取表，具体月龄口径须以当地经办核定为准');
  let balance=input.accountBalance;
  if(balance!==undefined){
    const bm=monthNumber(input.balanceDate);
    if(!Number.isFinite(balance)||balance<0||balance>1e8||!Number.isFinite(bm)||bm>asOf||bm<birth+192){r.missing.push('账户余额及余额对应月份无效');balance=undefined;}
    else if(bm!==asOf&&bm<monthNumber('2006-01')){r.missing.push('2006年前余额的后续历史入账比例尚未核验，请提供截止月实际余额');balance=undefined;}
    else if(bm!==asOf) {
      const later=new Map<number,number>(); for(const row of input.records)for(let m=monthNumber(row.start);m<=monthNumber(row.end);m++)if(m>bm&&m<=asOf)later.set(m,row.base);
      if(later.size!==asOf-bm) {r.missing.push('余额日期早于截止月：请补全此后每月缴费记录，或提供截止月余额；不自动假设空缺月已缴费');balance=undefined;}
      else {for(let m=bm+1;m<=asOf;m++)balance+=later.get(m)!*.08;r.assumptions.push('旧余额之后记录仅累加8%入账本金，未补计未核验历史利息；建议提供最新余额');}
    }
    if(balance!==undefined&&Number.isFinite(bm)&&bm<=asOf) r.replaced.push('个人账户使用本人余额作为起点，不重复加入余额日期之前的缴费');
  } else if(input.firstInsured&&input.firstInsured>='2006-01'){
    if(input.recordChoice==='records'&&input.records.length&&input.records.every(row=>row.start>='2006-01')){balance=input.records.reduce((sum,row)=>sum+(monthNumber(row.end)-monthNumber(row.start)+1)*row.base*.08,0);r.replaced.push('历史本金按完整缴费记录逐段累计，不再使用当前基数倒推');r.assumptions.push('历史账户按记录8%入账本金累计，未计未核验历史利息；最新实际余额优先');}
    else {balance=paid*input.contributionBase*.08;r.assumptions.push('未提供个人账户余额：按当前基数×实际缴费月数×8%估算历史本金，未计历史利息');}
  } else r.missing.push('请补充个人账户余额；早期入账比例与利率不可用当前8%倒推');
  if(balance!==undefined&&Number.isFinite(balance)&&balance>=0&&r.divisor){r.projectedBalance=rounded(balance*(1+s.accountInterest)**(r.futureMonths/12)+interestAmount);r.account=money(r.projectedBalance/r.divisor);}
  if(!r.divisor)r.missing.push('当前年龄的计发月数未核验');
  const first=input.firstInsured; const cutoff=p.formula==='beijing'?'1998-07':p.formula.startsWith('shanghai')?'1998-01':p.formula==='zhejiang'?'1998-01':'1998-07';
  const needsTransition=input.deemedMonths>0||(first&&first<cutoff);
  if(!first)r.missing.push('首次参保年月未确认，无法排除过渡性养老金或地方历史项目');
  else if(!needsTransition)r.transition=0;
  else if(p.formula==='beijing'){
    if(input.bjPre98Months===undefined)r.missing.push('请补充1992年10月至1998年6月实际缴费月数');
    else r.transition=money(r.projectedBase*(rounded(input.deemedMonths/12,2)+actualAverage*rounded(input.bjPre98Months/12,2))*.01);
  } else if(p.formula.startsWith('shanghai')){
    if(input.shVirtualBalance===undefined)r.missing.push('请补充1993—1997年虚账实记总额（无则填0），视同月数仅填1992年底前核定部分');
    else r.transition=money(r.projectedBase*(input.deemedMonths/12)*.012+input.shVirtualBalance/120);
  } else if(p.formula==='zhejiang'){
    if(input.transitionMonths===undefined||input.transitionIndex===undefined)r.missing.push('请补充经核定的过渡性计发月数及该段平均缴费指数');
    else r.transition=money(r.projectedBase*input.transitionIndex*(input.city==='330100'?rounded(input.transitionMonths/12,2):input.transitionMonths/12)*.014);
  } else if(p.formula==='guangdong'&&r.retirementMonth>='2026-01'){
    if(input.transitionMonths===undefined||input.transitionIndex===undefined)r.missing.push('请补充经核定的广东过渡性计发月数及该段平均指数');
    else r.transition=money(r.projectedBase*input.transitionIndex*(input.transitionMonths/12)*.012);
  } else r.missing.push('广东/深圳历史过渡性待遇涉及新老办法比较及地方项目，须经办核定；当前只展示已知组成，不输出总额');
  if(p.formula==='guangdong'){
    if(input.localAmount===undefined)r.missing.push('广东存在固定加发、缴费年限津贴或历史地方待遇，请填写经核定的地方项目合计；未知金额不当作0');
    else if(!Number.isFinite(input.localAmount)||input.localAmount<0||input.localAmount>100000)r.missing.push('地方项目金额无效');
    else {r.local=input.localAmount;r.replaced.push(`地方项目采用本人经核定金额${input.localAmount}元/月；未来退休按该金额不变的情景假设`);}
  }
  else if(p.formula!=='shenzhen')r.local=0;
  if(input.province==='440000'&&input.city==='440300')r.missing.push('深圳地方补充养老待遇是否适用尚需核实，当前不把地方补充待遇默认为0');
  for(const v of [input.transitionMonths,input.bjPre98Months])if(v!==undefined&&(!Number.isInteger(v)||v<0||v>paid+input.deemedMonths))r.missing.push('过渡性计发月数须为非负整数且不超过总历史缴费月数');
  for(const v of [input.transitionIndex,input.shVirtualBalance])if(v!==undefined&&(!Number.isFinite(v)||v<0))r.missing.push('过渡性参数不能为负数');
  r.status=r.missing.length?'partial':'complete';
  // A provincial formula subtotal is distinct from a complete local benefit.
  // Only expose it when the city review is the sole unresolved requirement.
  if(cityRulesPending&&r.eligible&&r.missing.every(x=>x===cityRulesMessage)&&r.basic!==null&&r.account!==null&&r.transition!==null){
    r.partialSubtotal=rounded(r.basic+r.account+r.transition);
    r.assumptions.push('省级公式参考合计仅含已测算的基础、个人账户和过渡性养老金；未包含待核验地方项目及当地最终取整，不是完整待遇金额');
  }
  if(r.status==='complete'&&r.basic!==null&&r.account!==null&&r.transition!==null&&r.eligible){
    const subtotal=rounded(r.basic+r.account+r.transition+(p.formula==='guangdong'?input.localAmount||0:0));
    r.total=p.formula==='zhejiang'&&input.city==='330100'?ceilDime(subtotal):subtotal;
    r.rounding=rounded(r.total-subtotal);
  }
  if(r.status==='partial'&&r.eligible&&r.total===null&&r.partialSubtotal===undefined&&r.basic!==null&&r.account!==null){
    r.partialSubtotal=rounded([r.basic,r.account,r.transition,r.local].filter((v):v is number=>v!==null).reduce((sum,v)=>sum+v,0));
  }
  return r;
}

function calculateReference(input:PersonalInput,s:Scenario,r:Calculation,paid:number,ref:RegionalReference,references:RegionalReference[]):Calculation{
  const base=referenceBase(ref,input.city,input.asOf)!;
  const rule={title:'国务院关于完善企业职工基本养老保险制度的决定',url:'https://fgk.chinatax.gov.cn/zcfgk/c102440/c5193739/content.html',documentNo:'国发〔2005〕38号',publishedAt:'2005-12-03',kind:'rule' as const};
  r.reference={name:ref.name,year:base.year,reviewedAt:ref.reviewedAt,sources:[rule,base.source],...(base.kind==='baseScenario'?{basis:'wage-scenario' as const,baseValue:base.value,scenarioNote:base.scenarioNote}:{})};
  r.status='partial';
  r.missing.push('通用公式仅测算基础与个人账户分项；当地指数口径、过渡性待遇、地方项目和最终取整尚未完整核验');
  r.warnings.push(...ref.notes);
  if(base.scenarioNote)r.assumptions.push(base.scenarioNote);
  r.assumptions.push(base.kind==='baseScenario'?`基数参考情景：暂用${base.year}年度工资参考值${rounded(base.value)}元作为基础养老金公式输入；正式计发基数未核实，该值不是当地正式计发标准，也不是本人缴费指数`: `沿用${base.year}年度已核验参考计发基数${rounded(base.value)}元，按增长假设预测；不是退休年度已公布值`);
  r.assumptions.push('通用参考按累计月数÷12换算年限，金额保留两位小数；当地不足整年和取整规则待核验');
  const asOf=monthNumber(input.asOf);
  const payRef=references.find(x=>x.province===input.insuredProvince);
  const params=payRef?regionalParameters(payRef,input.insuredCity):[];
  const applicable=(kind:string)=>params.find(p=>p.kind===kind&&p.from.slice(0,7)<=input.asOf&&(!p.to||p.to.slice(0,7)>=input.asOf));
  const min=applicable('contributionMin'),max=applicable('contributionMax');
  let currentBase=input.contributionBase*s.contributionMultiplier;
  if(min&&max){currentBase=Math.min(max.value,Math.max(min.value,currentBase));r.assumptions.push(`未来缴费参考当前参保地${min.year}年度上下限`);}
  else r.assumptions.push('当前适用缴费上下限尚未核验，未来支出和入账按所填缴费水平推算，未作合法档次校验');
  const indexParam=regionalParameters(ref,input.city).find(p=>p.kind==='indexBase'&&p.from.slice(0,7)<=input.asOf&&(!p.to||p.to.slice(0,7)>=input.asOf));
  const index=input.averageIndex??(indexParam?input.contributionBase/indexParam.value:1);
  if(input.averageIndex!==undefined)r.replaced.push('历史指数使用本人提供的官方平均缴费指数');
  else r.assumptions.push(indexParam?'历史指数暂用当前缴费基数与已核验年度指数分母比值代替，非历年实际指数':'缺少本人指数及适用年度指数分母，历史指数暂设为1（平均缴费水平情景），请补充本人官方指数');
  const futureIndex=indexParam?currentBase/indexParam.value:index;
  r.assumptions.push(indexParam?'未来指数按当前参考分母及缴费水平推算':'未来指数暂与历史情景指数相同；计发基数未用作缴费指数分母');
  r.averageIndex=rounded((index*(paid+input.deemedMonths)+futureIndex*r.futureMonths)/Math.max(1,r.totalMonths),4);
  r.projectedBase=rounded(base.value*(1+s.baseGrowth)**Math.max(0,Number(r.retirementMonth.slice(0,4))-base.year));
  if(input.deemedMonths===0)r.basic=rounded(r.projectedBase*(1+r.averageIndex)/2*r.totalMonths/12*.01);
  else r.missing.push('有视同缴费经历：当地视同指数口径未核验，基础养老金暂不输出');
  let futureSum=0,accountAdded=0;
  for(let m=1;m<=r.futureMonths;m++){const amount=currentBase*(1+s.baseGrowth)**(m/12);futureSum+=amount;accountAdded=(accountAdded+amount*.08)*(1+s.accountInterest)**(1/12);}
  r.futurePersonalCost=rounded(futureSum*(input.identity==='employee'?.08:.2));
  r.assumptions.push(`未来持续缴至退休当月；基数年增长${rounded(s.baseGrowth*100)}%，未来账户年利率${rounded(s.accountInterest*100)}%`);
  let balance=input.accountBalance;
  if(balance!==undefined){
    const date=monthNumber(input.balanceDate);
    if(!Number.isFinite(balance)||balance<0||balance>1e8||!Number.isFinite(date)||date>asOf||date<monthNumber(input.birth)+192){balance=undefined;r.missing.push('账户余额及余额对应月份无效');}
    else if(date<asOf){
      const later=new Map<number,number>();
      for(const row of input.records)for(let m=monthNumber(row.start);m<=monthNumber(row.end);m++)if(m>date&&m<=asOf)later.set(m,row.base);
      if(date<monthNumber('2006-01')||later.size!==asOf-date){balance=undefined;r.missing.push('请提供截止月实际余额，或补全2006年以后余额日期至截止月的每月缴费记录');}
      else {for(const amount of later.values())balance+=amount*.08;r.assumptions.push('旧余额之后仅累计记录对应8%本金，未补计历史利息');}
    }
    if(balance!==undefined)r.replaced.push('账户使用本人实际余额起算，不重复累加余额之前的缴费');
  }else if(input.firstInsured>='2006-01'&&input.records.every(row=>row.start>='2006-01')){
    balance=input.recordChoice==='records'&&input.records.length?input.records.reduce((n,row)=>n+(monthNumber(row.end)-monthNumber(row.start)+1)*row.base*.08,0):paid*input.contributionBase*.08;
    r.assumptions.push('未填实际余额：历史账户仅估算8%入账本金，未计历史利息');
  }else r.missing.push('早期账户入账比例未核验，请填写实际个人账户余额');
  r.divisor=divisors[Math.min(70,Math.floor(r.retirementAgeMonths/12))]??null;
  if(r.retirementAgeMonths%12)r.assumptions.push('非整岁计发月数暂取已满周岁表值，当地月龄口径待确认');
  if(balance!==undefined&&r.divisor){r.projectedBalance=rounded(balance*(1+s.accountInterest)**(r.futureMonths/12)+accountAdded);r.account=rounded(r.projectedBalance/r.divisor);}
  if(r.eligible&&r.basic!==null&&r.account!==null)r.partialSubtotal=rounded(r.basic+r.account);
  r.assumptions.push('参考合计仅含基础与个人账户养老金，不含未核验过渡性和地方项目，不能当作完整待遇');
  return r;
}
