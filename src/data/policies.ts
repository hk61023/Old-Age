import type { Policy, Source } from '../core/types';
const source=(title:string,url:string,documentNo:string,publishedAt:string,kind:Source['kind']='rule'):Source=>({title,url,documentNo,publishedAt,kind});
export const nationalSources:Source[]=[
  source('渐进式延迟法定退休年龄政策解读','https://www.gov.cn/zhengce/202409/content_6974508.htm','全国人大常委会关于实施渐进式延迟法定退休年龄的决定','2024-09-13'),
  source('实施弹性退休制度暂行办法','https://www.shicheng.gov.cn/scxxxgk/shbx/202501/503eec78c1ca4499a2f25c6a7f440684.shtml','人社部发〔2024〕94号','2025-01-01'),
  source('个人账户养老金计发月数表','https://rsj.sh.gov.cn/cmsres/78/7836229668704374979af136becb6a20/c48b7f53120c64aa212dd64e2c6d91a6.pdf','国发〔2005〕38号相关附表','2022-01-17'),
  source('跨省市就业人员待遇领取地','https://rsj.sh.gov.cn/tzhgl_17555/20220118/t0035_1405219.html','国办发〔2009〕66号相关问答','2022-01-18')
];
const common={version:1,status:'published' as const,verifiedAt:'2026-10-13',historicalIndexBases:{},scope:'普通企业职工及参加职工养老的灵活就业人员；特殊身份不适用'};
const bj:Policy={...common,id:'beijing-2025-v1',region:'110000',name:'北京',formula:'beijing',effectiveFrom:'2025-01-01',parameterYear:2025,base:12049,
  contribution:{year:2026,from:'2026-07-01',min:7270,max:36348,indexBase:12116},
  limitations:['计发基数已核验至2025年度；缴费上下限已核验至2026年度。北京断缴指数分母须优先采用官方指数。'],
  sources:[source('2025年度养老保险待遇计发基数','https://www.beijing.gov.cn/fwcj/jiage/yanglaofuwu1/65d2ed2811a82834a86396d1.html','2025年本市参保人员社会保险待遇有关问题的通告','2025','parameter'),source('2026年度社保缴费基数上下限','https://rsj.beijing.gov.cn/xxgk/2024zcwj/202608/t20260821_4831461.html','2026年度各项社会保险缴费工资基数上下限通告','2026-08-21','parameter'),source('北京基本养老保险待遇测算表及公式','https://fuwu.rsj.beijing.gov.cn/bjdkhy/static/file/oldjbylbxdy/oldjbylbxdy/index7.html','北京市企业职工养老金测算公式','未标注'),source('北京人社政策文件目录','https://rsj.beijing.gov.cn/xxgk/2024zcwj/','官方文件目录','持续更新','directory')]};
const sh:Policy={...common,id:'shanghai-2026-v1',region:'310000',name:'上海',formula:'shanghai',effectiveFrom:'2026-08-16',effectiveTo:'2031-08-15',parameterYear:2026,base:12577,
  contribution:{year:2026,from:'2026-07-01',min:7546,max:37731,indexBase:12577},historicalIndexBases:{'2026':12577},
  limitations:['2026年8月16日起按新办法；新旧办法切换月份需确认实际申领日。历史指数保底规则请使用经办核定的平均指数。'],
  sources:[source('上海2026年企业基本养老金计发办法','https://www.shanghai.gov.cn/gwk/search/content/t0035_1443100','沪人社规〔2026〕16号','2026-07-24'),source('2026社保年度缴费基数及2025年全口径平均工资','https://shanghai.chinatax.gov.cn/bsfw/nszx/hdfk/202609/t481435.html','上海税务2026社保年度缴费基数问答','2026-08-25','parameter'),source('养老金计发办法官方目录','https://rsj.sh.gov.cn/tyljjfbf_17557/index.html','官方问答目录','持续更新','directory')]};
const shOld:Policy={...sh,id:'shanghai-2025-v1',name:'上海（旧办法）',formula:'shanghai-old',effectiveFrom:'2025-01-01',effectiveTo:'2026-08-15',parameterYear:2025,base:12434,
  contribution:{year:2025,from:'2025-07-01',min:7460,max:37302,indexBase:12434},historicalIndexBases:{'2025':12434},
  limitations:['旧办法仅用于2026年8月16日前申领场景；2026年8月内具体日期需核实。'],sources:[source('旧办法及历史指数保护口径','https://rsj.sh.gov.cn/tshbx_17729/20220117/t0035_1405188.html','沪人社规〔2021〕32号','2022-01-17'),source('2025年社保缴费基数上下限','https://rsj.sh.gov.cn/tgsgg_17341/20250918/t0035_1435637.html','上海2025年社保缴费基数公告','2025-09-18','parameter'),source('旧办法基础养老金月份折算','https://rsj.sh.gov.cn/tyljjfbf_17557/20250527/t0035_1432738.html','上海人社计发问答','2025-05-27')]};
const gd:Policy={...common,id:'guangdong-2025-v1',region:'440000',name:'广东（深圳除外）',formula:'guangdong',effectiveFrom:'2025-01-01',parameterYear:2025,base:9493,
  contribution:{year:2025,from:'2025-07-01',min:4775,max:27549,indexBase:9183},cityMinimums:{'440100':5510},
  limitations:['深圳执行独立计发基数；省直参保下限为5510元，当前城市入口不覆盖省直账户。历史地方项目及过渡性待遇需补充核定值。'],
  sources:[source('2025年缴费上下限与计发基数通知','https://www.shantou.gov.cn/stsshbxjj/zwgk/content/post_2508025.html','粤人社发〔2025〕32号','2025-10-24','parameter'),source('广东职工基础养老金及个人账户公式','https://www.gd.gov.cn/hdjl/hygq/content/post_73285.html','广东养老保险政策热点知识问答（历史资料，仅引用基础公式）','2016'),source('过渡性待遇新老办法比较与地方项目衔接','https://hrss.gd.gov.cn/gkmlpt/content/3/3666/mmpost_3666366.html','粤人社规〔2021〕24号政策解读','2021'),source('广东人社厅政策法规','https://hrss.gd.gov.cn/zcfg/zcfgk/','官方文件目录','持续更新','directory')]};
const sz:Policy={...gd,id:'shenzhen-2025-v1',region:'440300',name:'深圳',formula:'shenzhen',base:11293,limitations:['深圳地方补充养老待遇和历史过渡性待遇未完整核验；只能展示已知部分，不输出总额。'],sources:[...gd.sources,source('深圳2025年企业职工养老金计发基数','https://hrss.sz.gov.cn/zmhd/cjwt/cjwt/shbz/content/post_12493488.html','深圳市人社局计发基数问答','2025-11-17','parameter')]};
const zj:Policy={...common,id:'zhejiang-2025-v1',region:'330000',name:'浙江',formula:'zhejiang',effectiveFrom:'2025-01-01',parameterYear:2025,base:8433,
  contribution:{year:2025,from:'2025-01-01',min:4986,max:25299,indexBase:8433},historicalIndexBases:{'2025':8433},
  limitations:['缴费下限基于2023年工资，指数分母基于2024年工资，两者不得混用。特殊补贴、历史折算及转制人员需经办核定。'],
  sources:[source('2025年社会保险有关基数官方解读','https://zhejiang.chinatax.gov.cn/art/2025/12/11/art_13314_645797.html','浙人社发〔2025〕52号相关问答','2025-12-11','parameter'),source('浙江职工养老金构成与过渡性公式','https://www.qiantang.gov.cn/art/2021/12/22/art_1229608568_58932951.html','杭州市钱塘区人社养老金计算说明','2021-12-22'),source('浙江人社规范性文件','https://rlsbt.zj.gov.cn/col/col1229506778/index.html','官方文件目录','持续更新','directory')]};
const gd2026:Policy={...gd,id:'guangdong-2026-v1',effectiveFrom:'2026-01-01',
  contribution:{year:2026,from:'2026-07-01',min:5521,max:27603,indexBase:9201},cityMinimums:{},
  limitations:['计发基数沿用已公布的2025年9493元作预测；2026年缴费下限1—6月5510元、7月起5521元。地方加发、年限津贴及历史地方养老金需填写经核定的地方项目金额，未知时只输出部分结果。'],
  sources:[...gd.sources,source('2026年广东职工养老保险缴费基数上下限','https://guangdong.chinatax.gov.cn/gdsw/ssfggds/2026-10/08/content_b40dcb7bf605411fbb12e0f81281dc6b.shtml','粤人社发〔2026〕24号','2026-09-17','parameter'),source('广东新计发办法与低指数计算口径','https://www.shanwei.gov.cn/swrsj/zcfg/shbx/content/post_289371.html','粤府〔2006〕96号','2006'),source('广东地方加发与缴费年限津贴核定依据','https://www.lw.gov.cn/attachment/7/7610/7610331/9673838.pdf','荔湾府行复〔2024〕21号（引用粤人社发〔2014〕8号）','2024')]};
const sz2026:Policy={...sz,id:'shenzhen-2026-v1',effectiveFrom:'2026-01-01',contribution:gd2026.contribution,cityMinimums:{},sources:[...gd2026.sources,...sz.sources.slice(-1),source('深圳基本养老金计发办法','https://www.sz.gov.cn/zfgb/2022/gb1253/content/post_10008776.html','深府规〔2022〕4号','2022-07-23'),source('深圳地方补充养老保险待遇','https://hrss.sz.gov.cn/szsi/sbjxxgk/zcfggfxwj/zcfg/ylbx/content/post_8207597.html','深圳市人民政府令第257号相关实施细则','2014')]};
const zj2026:Policy={...zj,id:'zhejiang-2026-v1',effectiveFrom:'2026-01-01',parameterYear:2026,base:8537,
  contribution:{year:2026,from:'2026-01-01',min:5122,max:25611,indexBase:8537},historicalIndexBases:{'2025':8433,'2026':8537},
  limitations:['2026年下限恢复按上年度全口径工资的60%执行。特殊补贴、历史折算及转制人员需经办核定。'],
  sources:[...zj.sources,source('浙江2026年社会保险有关基数通知','https://rlsbt.zj.gov.cn/col/col1229506773/art/2026/art_2b4555c11a034b9e874038cbff2f84fb.html','浙人社发〔2026〕52号','2026-10-08','parameter'),source('浙江2026年社会保险基数官方解读','https://rlsbt.zj.gov.cn/col/col1229101513/art/2026/art_e8b496ab59834390884b8d375cff1651.html','浙人社发〔2026〕52号政策解读','2026-10-08','parameter')]};
gd.effectiveTo='2025-12-31';sz.effectiveTo='2025-12-31';zj.effectiveTo='2025-12-31';
for(const p of [gd,gd2026,sz,sz2026])p.sources=p.sources.map(s=>s.url==='https://www.gd.gov.cn/hdjl/hygq/content/post_73285.html'?source('广东基础公式及低指数a系数官方转载','https://www.shanwei.gov.cn/swrsj/zcfg/shbx/content/post_289371.html','粤府〔2006〕96号','2006'):s);
for(const p of [zj,zj2026]){
  p.sources=p.sources.map(s=>s.url==='https://www.qiantang.gov.cn/art/2021/12/22/art_1229608568_58932951.html'?source('杭州基本养老金公式和年限保留两位','https://zfgb.hangzhou.gov.cn/10/105220253/t123220253054/519977.shtml','杭政办〔2014〕4号','2014-01-29'):s);
  p.sources.push(source('退休人员基本养老金核定表及进角补足','https://xd-sxkxtoss.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/8/1/1e64fbbe-6bbd-4fc4-a976-126c936a9b29.pdf','浙江政务服务官方办事表格','未标注'));
  p.limitations.push('杭州市普通公式含年限保留两位与总额进角；其他市地方取整尚待专项核验。最低待遇补足及历史调节金需经办确认，不适用时的公式情景不等于最终核定待遇。');
}
export const seedPolicies:Policy[]=[bj,sh,shOld,gd2026,sz2026,zj2026,gd,sz,zj];
