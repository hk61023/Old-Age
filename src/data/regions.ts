import type { RegionalReference,RegionalParameter,Source } from '../core/types';
// Department links were checked against the Ministry's China Employment site directory.
const directory='https://chinajob.mohrss.gov.cn/zcms/catalog/32/pc/index_402.shtml';
const provinces=[
 ['110000','北京','rsj.beijing.gov.cn'],['120000','天津','hrss.tj.gov.cn'],['130000','河北','rst.hebei.gov.cn'],['140000','山西','rst.shanxi.gov.cn'],
 ['150000','内蒙古','rst.nmg.gov.cn'],['210000','辽宁','rst.ln.gov.cn'],['220000','吉林','hrss.jl.gov.cn'],['230000','黑龙江','hrss.hlj.gov.cn'],
 ['310000','上海','rsj.sh.gov.cn'],['320000','江苏','jshrss.jiangsu.gov.cn'],['330000','浙江','rlsbt.zj.gov.cn'],['340000','安徽','hrss.ah.gov.cn'],
 ['350000','福建','rst.fujian.gov.cn'],['360000','江西','rst.jiangxi.gov.cn'],['370000','山东','hrss.shandong.gov.cn'],['410000','河南','hrss.henan.gov.cn'],
 ['420000','湖北','rst.hubei.gov.cn'],['430000','湖南','rst.hunan.gov.cn'],['440000','广东','hrss.gd.gov.cn'],['450000','广西','rst.gxzf.gov.cn'],
 ['460000','海南','hrss.hainan.gov.cn'],['500000','重庆','rlsbj.cq.gov.cn'],['510000','四川','rst.sc.gov.cn'],['520000','贵州','rst.guizhou.gov.cn'],
 ['530000','云南','hrss.yn.gov.cn'],['540000','西藏','hrss.xizang.gov.cn'],['610000','陕西','rst.shaanxi.gov.cn'],['620000','甘肃','rst.gansu.gov.cn'],
 ['630000','青海','rst.qinghai.gov.cn'],['640000','宁夏','hrss.nx.gov.cn'],['650000','新疆','rst.xinjiang.gov.cn']
];
const source=(title:string,url:string,documentNo:string,publishedAt:string):Source=>({title,url,documentNo,publishedAt,kind:'parameter'});
const param=(kind:RegionalParameter['kind'],value:number,year:number,s:Source,to?:string):RegionalParameter=>({kind,value,year,from:`${year}-01-01`,to:to||`${year}-12-31`,source:s});
export const seedRegionalReferences:RegionalReference[]=provinces.map(([province,name,host])=>({province,name,portal:{title:`${name}人社部门官方入口`,url:`https://${host}/`,documentNo:`地方链接来源：${directory}`,publishedAt:'持续更新',kind:'directory'},parameters:[],cityParameters:{},notes:['已提供官方查询入口；参数、地方待遇和计算规则需分别核验。地区可查询不表示养老金全额测算已覆盖。'],reviewedAt:'2026-10-13'}));
function add(code:string,ps:RegionalParameter[],note?:string){const r=seedRegionalReferences.find(r=>r.province===code)!;r.parameters.push(...ps);if(note)r.notes.push(note);return r;}
const tj=source('天津2025年度基本养老金计发基数','https://www.tj.gov.cn/zwgk/zfxxgkzl/fdzdgknr/zdmsxx220316/yl_157354/zcwj_157367/202609/t20260914_7373588.html','津人社局发〔2025〕9号','2025-11-17');
add('120000',[param('pensionBase',9417,2025,tj)]);
const ln=source('辽宁2025年养老保险缴费及计发参数官方通告','https://liaoning.chinatax.gov.cn/art/2025/10/13/art_701_154501.html','辽人社〔2025〕17号相关通告','2025-10-13');
add('210000',[{...param('pensionBase',7346,2025,ln),excludeCities:['210100','210200']}],'省级7346元计发基数不适用沈阳、大连；这两市独立参数尚未核验，不自动套用省值。');
const jl=source('吉林社会保险缴费基数和计发基数通知','https://xxgk.jl.gov.cn/zcbm/fgw_97992/xxgkmlqy/202509/t20250922_9324837.html','吉林省社会保险缴费基数和计发基数通知','2025-09-22');
const jlRef=add('220000',[{...param('pensionBase',87865/12,2025,jl),excludeCities:['220100']},{...param('contributionMin',4393.2,2025,jl,'2026-06-30'),from:'2025-07-01'},{...param('contributionMax',21966,2025,jl,'2026-06-30'),from:'2025-07-01'}],'普通职工计发基数原文以元/年发布，页面换算为月值；农垦企业另有标准，不适用本入口。');
jlRef.cityParameters['220100']=[param('pensionBase',95739/12,2025,jl)];
const js=source('江苏2025年度社会保险有关基数','https://jiangsu.chinatax.gov.cn/art/2025/10/20/art_22437_1941.html','苏人社发〔2025〕33号','2025-10-20');
add('320000',[param('contributionMin',4952,2025,js),param('contributionMax',24762,2025,js)],'此文件的2025年度标准已失效，仅保留历史查询；未把缴费上限除以3作为官方个人平均指数。');
const ah=source('安徽2025年退休人员基本养老金计发基数','https://www.ahlx.gov.cn/Jczwgk/show/3644517.html','安徽省2025年退休人员基本养老金计发基数通知（官方转载）','2025-09-18');
add('340000',[param('pensionBase',7999,2025,ah)]);
const fj=source('福建2025年职工养老保险缴费与计发基数','https://rst.fj.gov.cn/zw/zfxxgk/zfxxgkml/zyywgz/ldgx/202509/t20250922_7013397.htm','闽人社文〔2025〕45号','2025-09-22');
add('350000',[param('pensionBase',7932,2025,fj),param('contributionMin',4043,2025,fj),param('contributionMax',22607,2025,fj)],'企业职工缴费下限4043元，不能混用机关事业单位下限4521元。');
const jx=source('江西2025年度城镇职工养老金计发基数','https://www.jxln.gov.cn/lnxxxgk/zcwjscbhg/202512/8aa82bef0c2c4fcca30840e9549bc177.shtml','江西省2025年度职工基本养老金计发基数通知（官方转载）','2025-12-04');
add('360000',[param('pensionBase',7054,2025,jx)]);
const sd=source('山东2025年度缴费上下限及月缴费指数分母','https://rsj.weihai.gov.cn/art/2025/9/26/art_45565_5955431.html','鲁人社字〔2025〕91号','2025-09-26');
add('370000',[param('contributionMin',4504,2025,sd),param('contributionMax',22518,2025,sd),param('indexBase',7506,2025,sd)],'指数分母7506元属于2025缴费年度，不能替代养老金计发基数。');
const hn=source('湖南2025年缴费基准值及计发基数','https://rst.hunan.gov.cn/rst/xxgk/zcfg/zxzc/202509/t20250922_33809937.html','湖南省2025年社会保险缴费基准值和计发基数通知','2025-09-22');
add('430000',[param('pensionBase',7694,2025,hn),param('contributionMin',4072,2025,hn),param('contributionMax',20361,2025,hn),param('indexBase',6787,2025,hn)]);
const sc=source('四川2026年度社保缴费基数公布','https://chinajob.mohrss.gov.cn/h5/c/2026-09-11/602828.shtml','四川2026年度社会保险缴费基数上下限具体标准等参数通知（人社部官方报道）','2026-09-11');
add('510000',[param('contributionMin',4699,2026,sc),param('contributionMax',23493,2026,sc)],'已核验的是养老缴费上下限；原文医疗保险参考工资不得当作养老缴费指数分母。');
const sx=source('山西2026年缴纳社会保险费基数标准','https://shanxi.chinatax.gov.cn/son/detail/sz-11406-522-1824057','晋人社厅发〔2026〕27号','2026-08-31');
add('140000',[param('contributionMin',4244,2026,sx),param('contributionMax',21219,2026,sx)]);
const nm=source('内蒙古2025年度社会保险缴费基数','https://neimenggu.chinatax.gov.cn/xxgk/tzgg/202510/t20251011_841385.html','内人社办发〔2025〕160号相关通告','2025-10-11');
add('150000',[param('contributionMin',4907,2025,nm),param('contributionMax',24537,2025,nm)]);
const yn=source('云南2025年职工养老保险相关参数','https://www.dhlc.gov.cn/hgx/Web/_F0_0_6C4RSW4X10BC743CE56C457EA9.htm','云南省2025年度全省职工基本养老保险相关参数通知（官方转载）','2025-09-26');
add('530000',[param('pensionBase',8265,2025,yn),param('contributionMin',4357,2025,yn),param('contributionMax',21789,2025,yn),param('indexBase',7263,2025,yn)]);
const xz=source('西藏2025年职工工资与缴费基数','https://hrss.lasa.gov.cn/rsj/xxyw/202509/94481a07de4044239c6111a6cc4936ba.shtml','藏人社发〔2025〕56号官方解读','2025-09-24');
add('540000',[param('contributionMin',7066.2,2025,xz),param('contributionMax',35331,2025,xz)]);
const gs=source('甘肃2025年职工基本养老保险缴费基数','https://zwfw.gansu.gov.cn/zhuoni/zxfb/art/2025/art_f7d55b5f32c443b5a0ee8531194008e5.html','甘人社通〔2025〕261号','2025-09-24');
add('620000',[param('contributionMin',4403,2025,gs),param('contributionMax',22014,2025,gs)]);
const hb=source('湖北2026社保年度缴费基数标准','https://rst.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202610/t20261008_6027858.shtml','鄂人社发〔2026〕29号','2026-10-08');
add('420000',[{...param('contributionMin',4552,2026,hb,'2027-06-30'),from:'2026-07-01'},{...param('contributionMax',22761,2026,hb,'2027-06-30'),from:'2026-07-01'}]);

// Manually reviewed official additions; they enable reference components only.
const lnFull=source('辽宁2025年养老保险缴费及各市计发基数原文','https://liaoning.chinatax.gov.cn/art/2025/9/15/art_5869_7692.html','辽人社〔2025〕17号','2025-09-15');
const lnRef=add('210000',[param('contributionMin',4359,2025,lnFull),param('contributionMax',21792,2025,lnFull)]);
lnRef.cityParameters['210100']=[param('pensionBase',8390,2025,lnFull)];
lnRef.cityParameters['210200']=[param('pensionBase',8956,2025,lnFull)];
lnRef.notes=lnRef.notes.filter(n=>!n.includes('这两市独立参数尚未核验'));
lnRef.notes.push('沈阳8390元、大连8956元，其他城市7346元；市级参数分开适用，地方项目仍待核验。');
const sdBase=source('山东2025年度职工养老保险待遇计发基数（官方附件）','https://www.jining.gov.cn/art/2025/10/17/art_33517_2919595.html','鲁人社字〔2025〕100号','2025-10-16');
add('370000',[{...param('pensionBase',7831,2025,sdBase),excludeCities:['371700']}],'7831元不适用菏泽，菏泽计发参数未核验，测算选项暂隐藏；官方PDF已人工阅读核对。');
const hlj=source('黑龙江2025年度企业职工基本养老保险计发参数（官方转载）','https://songling.gov.cn/songling/c100317/202501/c13_302609.shtml','黑人社函〔2024〕548号','2025-01-17');
add('230000',[param('pensionBase',7570,2025,hlj)]);
const nx=source('宁夏2025年缴费和待遇计发基数政策解读','https://hrss.nx.gov.cn/xxgk/zcj/zcjd/wzjd_new/202509/t20250921_5030585.html','宁人社函〔2025〕130号相关官方解读','2025-09-21');
add('640000',[param('pensionBase',8366,2025,nx),param('contributionMin',4955,2025,nx),param('contributionMax',24774,2025,nx)]);
const jsBase=source('江苏2025年基础养老金计发基数官方地方执行信息','https://www.jinhu.gov.cn/col/1387_142711/index.html','金湖县政府社会保障执行信息；省级年度适用口径见苏人社规〔2024〕1号','页面未标注（核验2026-10-13）');
add('320000',[param('pensionBase',8917,2025,jsBase)],'8917元来自官方地方执行信息，省级基础养老金年度统一口径另见苏人社规〔2024〕1号；地方精确计算尚未完整核验。');

// 2026-10-14: original government documents reviewed, not inferred from pay ceilings.
const hebei=source('河北2025年养老保险缴费及计发基数（官方附件）','https://rsj.chengde.gov.cn/art/2025/10/22/art_2829_1087786.html','冀人社字〔2025〕105号（成文2025-09-18）','2025-10-22');
const hebeiRef=add('130000',[param('pensionBase',7410,2025,hebei),param('contributionMin',4007,2025,hebei),param('contributionMax',20034,2025,hebei)],'适用于全省（含定州、辛集、雄安）；官方附件已人工核对。6678元仅是上下限核定基准，未自动认定为本人指数分母。');
hebeiRef.reviewedAt='2026-10-14';
const gxBase=source('广西2025年职工基本养老保险待遇计发基数（官方原文附件）','https://rst.gxzf.gov.cn/zwgk/xxgkzcfg/fgfxlm/t25993557.shtml','官方公开原文未标注文号（成文2025-09-18）','2025-09-23');
const gxPay=source('广西2025年职工基本养老保险缴费上下限','https://guangxi.chinatax.gov.cn/xwdt/ztzl/jdxjmqysbf/zcwj_16519/202511/t20251127_425843.html','官方公开原文未标注文号','2025-09-18');
const gxRef=add('450000',[param('pensionBase',6983,2025,gxBase),param('contributionMin',4143,2025,gxPay),param('contributionMax',20715,2025,gxPay)],'全区职工养老计发基数6983元，与缴费上下限核定指标6905元分开使用。HTTPS原文访问异常，本次通过同一官方域名公开HTTP原文附件人工核对；自动检查仍使用HTTPS，不关闭证书验证。');
gxRef.reviewedAt='2026-10-14';
const qh=source('青海2025年度城镇职工社会保险有关基数','https://rst.qinghai.gov.cn/zxzx/tzgg/query/202509221457558639.html','关于公布2025年度城镇职工社会保险有关基数的通知（未标注文号，成文2025-09-19）','2025-09-22');
const qhRef=add('630000',[param('pensionBase',9056,2025,qh)],'已核对人社厅公开正文：计发基数9056元，缴费核定基准8816元；未据后者推导未公布的指数分母或上下限。');
qhRef.reviewedAt='2026-10-14';
const gsHistorical=source('甘肃2024年度基本养老金计发基数官方执行信息','https://www.jyg.gov.cn/rsj/xwdt/bmdt/art/2025/art_2de3800b28314efb932da6c79eda737d.html','甘人社通〔2024〕330号相关官方执行信息','2025-01-16');
const gsRef=add('620000',[param('pensionBase',7594,2024,gsHistorical)],'目前核验到2024年计发基数7594元；2025/2026计发参数尚未取得可核对官方原文，参考测算沿用历史参数，不标记为当前年度最新。');
gsRef.reviewedAt='2026-10-14';

const gz2025=source('贵州2025年度养老金计发依据年工资（官方原文）','https://rst.guizhou.gov.cn/zwgk/zdlyxx/sbxx/202509/t20250919_88635347.html','黔人社发〔2025〕16号','2025-09-19');
const gz2026=source('贵州2026年度养老金计发依据年工资（官方原文）','https://rst.guizhou.gov.cn/zwgk/zfxxgk/fdzdgknr/qtfdxx/ggfwsx/202607/t20260714_90621072.html','公开正文未标注文号（成文2026-07-08）','2026-07-14');
const gzRef=add('520000',[param('pensionBase',87894/12,2025,gz2025),param('pensionBase',88521/12,2026,gz2026)],'原文明确年工资用于确定相应年度基本养老金计发基数；月参考值按公布年值÷12换算，2026年为7376.75元。未由该值推导未核验的指数分母或缴费上下限。当地最终取整和待遇项目仍需核验。');
gzRef.reviewedAt='2026-10-14';
const xz2025=source('西藏2025年养老保险征缴及待遇计发依据','https://hrss.xizang.gov.cn/xwzx/tzgg/202509/t20250922_501002.html','藏人社发〔2025〕56号','2025-09-22');
const xz2026=source('西藏2026年养老保险征缴及待遇计发依据（官方转载）','https://hrss.lasa.gov.cn/rsj/xxyw/202609/f4ff9e663eea434393afd44f3d85c9c8.shtml','藏人社发〔2026〕46号','2026-09-17');
const xzRef=add('540000',[param('pensionBase',11777,2025,xz2025),param('pensionBase',11954,2026,xz2026),param('contributionMin',7172.4,2026,xz2026),param('contributionMax',35862,2026,xz2026)],'文件明确全区职工月平均工资用于基本养老保险待遇计发，2026年为11954元。本入口只支持普通全国退休类别情景；高海拔等特殊退休条件须由经办确认，不按普通类别自动核定。地方加发及过渡性项目未完整核验。');
xzRef.reviewedAt='2026-10-14';
const btExample=source('包头市青山区人社部门弹性退休官方计算样例','https://www.qsq.gov.cn/bmdt/103789.html','官方经办样例（国发〔2005〕38号口径）','2025-11-20');
const nmRef=seedRegionalReferences.find(r=>r.province==='150000')!;
nmRef.cityParameters['150200']=[param('pensionBase',8179,2025,btExample)];
nmRef.notes.push('仅包头开放参考测算：采用2025年人社部门公开养老金样例中的8179元基数，属于历史样例参考，未核验为2026年正式标准。其他市的适用基数、地方口径未核验，仍隐藏测算选项；不把样例自动套用全区。');
nmRef.reviewedAt='2026-10-14';

const whExample=source('武汉市政府2024年退休待遇核定行政复议案例','https://sfj.wuhan.gov.cn/qmyfzs/xzfy/xzfyjdgk/2024/202505/P020250523369690549688.pdf','武政复决〔2024〕第990号（第4页）','2025-05-23');
const whRef=seedRegionalReferences.find(r=>r.province==='420000')!;
whRef.cityParameters['420100']=[param('pensionBase',8880,2024,whExample)];
whRef.notes.push('仅武汉开放历史核定案例参考：2024年退休人员核定案例使用8880元，属于个案公开参数，不认定为2026年正式计发标准。采用该历史基数作静态情景；其余湖北城市的计发基数未核验，不外推武汉参数。');
whRef.reviewedAt='2026-10-14';
const xj2026=source('新疆2026年职工基本养老保险缴费基数官方原文','https://rst.xinjiang.gov.cn/xjrst/c112734/202609/234e01d8b8b9404ca3c98c2cee384903.shtml','公开正文未标注文号（成文2026-07-27）','2026-07-27');
const xjRef=add('650000',[param('contributionMin',5246,2026,xj2026),param('contributionMax',26231,2026,xj2026)],'已核验2026年职工养老缴费上下限5246/26231元；正文公布的8744元是全口径工资，尚未核验其与养老金计发基数的适用衔接，不能自动作为计发基数或本人缴费指数。暂不开放金额测算城市。');
xjRef.reviewedAt='2026-10-14';

// Wage scenarios are an explicit approximation, never published pensionBase/indexBase.
function addCityScenarios(code:string,cities:string[],value:number,year:number,s:Source,note:string){
  const ref=seedRegionalReferences.find(r=>r.province===code)!;
  for(const city of cities)ref.cityParameters[city]=[...(ref.cityParameters[city]||[]),{...param('baseScenario',value,year,s),from:s.publishedAt.slice(0,7)+'-01',scenarioNote:note}];
  ref.notes.push('仅指定主要城市开放基础与账户参考情景；工资参考值不等于正式养老金计发基数，不据此认定个人缴费指数或地方政策已核验。',note);
  ref.reviewedAt='2026-10-14';return ref;
}
addCityScenarios('140000',['140100','140200','140400','140800'],7073,2026,sx,'采用官方2025年全口径月平均工资7073元作情景输入，未核验正式计发基数。');
const henanWage=source('河南2025缴费基准官方答复','https://www.ayx.gov.cn/2026/02-04/3620463.html','豫人社办〔2025〕67号相关官方答复（回复2026-01-29）','2026-02-04');
addCityScenarios('410000',['410100','410300','411300','410700'],6385,2025,henanWage,'沿用已核验的2025年度缴费基准6385元作基数情景；未认定为2026年计发标准。');
const hainan2026=source('海南2026城镇职工社会保险缴费上下限官方原文','https://hrss.hainan.gov.cn/hrss/0503/202610/efba4207598e47908b632e2d6bc4577c.shtml','琼人社发〔2026〕71号','2026-10-10');
addCityScenarios('460000',['460100','460200','460400','469002'],24762/3,2026,hainan2026,'参考值8254元由官方缴费上限24762÷3推导，仅用于基数情景；不是已核验的正式计发基数或官方个人指数。');
const chongqing2026=source('重庆2026社会保险缴费基数官方原文','https://rlsbj.cq.gov.cn/zwgk_182/zfxxgkml/zcwj_145360/jfxzgfxwj/202609/t20260917_16091209.html','渝人社规〔2026〕18号（成文2026-09-14）','2026-09-17');
const cqRef=addCityScenarios('500000',['500103','500101','500102','500116'],91059/12,2026,chongqing2026,'采用官方年平均工资91059÷12换算7588.25元作基数情景；未核验正式计发标准。重庆按区县选择。');
cqRef.parameters.push(param('contributionMin',4553,2026,chongqing2026),param('contributionMax',22765,2026,chongqing2026));
addCityScenarios('510000',['510100','510700','510600','511500'],7831,2026,sc,'采用官方报道中的上年度全省城镇全部单位就业人员月平均工资7831元作情景；原文该工资用于医保等缴费，不能认定为养老计发基数或缴费指数分母。');
const shaanxi2026=source('陕西2026三项社会保险缴费基数官方原文','https://rst.shaanxi.gov.cn/sy/tzgg/202608/t20260831_3672572.html','陕人社函〔2026〕326号（成文2026-08-27）','2026-08-31');
const snRef=addCityScenarios('610000',['610100','610300','610400','610800'],7895,2026,shaanxi2026,'采用官方2025年度全口径月平均工资7895元作情景；未核验正式养老金计发标准。');
snRef.parameters.push(param('contributionMin',4737,2026,shaanxi2026),param('contributionMax',23685,2026,shaanxi2026));
addCityScenarios('650000',['650100','650200','650400','650500'],8744,2026,xj2026,'采用官方2025年度全口径月平均工资8744元作基数情景；未核验养老金计发口径衔接，不包含兵团特殊口径。');
xjRef.notes=xjRef.notes.filter(n=>!n.includes('暂不开放金额测算城市'));

// Explicit scope expansion: all prefectures, never inferred formal local policy.
function expandScenarios(code:string,cities:string[],value:number,year:number,s:Source,note:string){
  const ref=seedRegionalReferences.find(r=>r.province===code)!;
  addCityScenarios(code,cities.filter(c=>!ref.cityParameters[c]?.some(p=>p.kind==='baseScenario'&&p.year===year)),value,year,s,note);
  ref.notes=ref.notes.filter(n=>!n.startsWith('仅包头开放参考测算')&&!n.startsWith('仅武汉开放历史核定案例参考')&&!n.startsWith('仅指定主要城市开放'));
  ref.notes.push('已接入地区可显示基础与账户参考合计；工资情景不是正式养老金计发标准，未核验地方待遇暂不纳入。');
}
expandScenarios('140000',['140100','140200','140300','140400','140500','140600','140700','140800','140900','141000','141100'],7073,2026,sx,'采用官方2025年全口径月平均工资7073元作情景，未核验正式计发基数。');
const nmWage=source('内蒙古2025缴费年度全口径工资官方原文',nm.url,'内税函〔2025〕244号','2025-09-25');
expandScenarios('150000',['150100','150300','150400','150500','150600','150700','150800','150900','152200','152500','152900'],8179,2025,nmWage,'沿用2025缴费年度采用的2024年月平均工资8179元作情景；不是2026正式计发标准。包头保留独立历史样例。');
expandScenarios('410000',['410100','410200','410300','410400','410500','410600','410700','410800','410900','411000','411100','411200','411300','411400','411500','411600','411700','419001'],6385,2025,henanWage,'沿用2025年度缴费基准6385元作情景，未认定为2026计发标准。');
expandScenarios('420000',['420200','420300','420500','420600','420700','420800','420900','421000','421100','421200','421300','422800','429004','429005','429006','429021'],7587,2026,hb,'采用2026社保年度全省缴费月标准7587元作情景；不是正式养老金计发基数。武汉保留独立历史核定案例。');
expandScenarios('460000',['460100','460200','460300','460400','469001','469002','469005','469006','469007','469021','469022','469023','469024','469025','469026','469027','469028','469029','469030'],8254,2026,hainan2026,'参考值8254元由缴费上限24762÷3推导，仅用于情景，不是正式计发基数或本人指数。');
expandScenarios('500000',['500101','500102','500103','500104','500106','500107','500108','500109','500110','500111','500113','500114','500115','500116','500117','500118','500119','500120','500151','500152','500153','500154','500155','500156','500157','500229','500230','500231','500233','500235','500236','500237','500238','500240','500241','500242','500243'],7588.25,2026,chongqing2026,'采用年平均工资91059÷12换算7588.25元作情景，未核验正式计发标准；按重庆现行区县选择。');
expandScenarios('510000',['510100','510300','510400','510500','510600','510700','510800','510900','511000','511100','511300','511400','511500','511600','511700','511800','511900','512000','513200','513300','513400'],7831,2026,sc,'采用官方报道月平均工资7831元作情景；原文用于医保等缴费，不认定为养老计发基数或指数分母。');
expandScenarios('610000',['610100','610200','610300','610400','610500','610600','610700','610800','610900','611000'],7895,2026,shaanxi2026,'采用2025年度全口径月平均工资7895元作情景，未核验正式计发标准。');
expandScenarios('650000',['650100','650200','650400','650500','652300','652700','652800','652900','653000','653100','653200','654000','654200','654300'],8744,2026,xj2026,'采用2025年度全口径月平均工资8744元作情景，未核验养老金计发衔接；不包含兵团特殊口径。');
expandScenarios('370000',['371700'],7506,2025,sd,'菏泽正式计发基数未核验；沿用官方2025年度缴费基准7506元作情景，不套用其他山东城市的7831元计发基数。');
const sdRef=seedRegionalReferences.find(r=>r.province==='370000')!;
sdRef.notes=sdRef.notes.map(n=>n.replace('菏泽计发参数未核验，测算选项暂隐藏','菏泽计发参数未核验，仅提供独立工资基数情景'));

// Bingtuan cities have their own pension administration. A regional wage scenario
// is useful for comparison, but must not inherit the autonomous region's pay limits.
export const bingtuanCities=['659001','659002','659003','659004','659005','659006','659007','659008','659009','659010','659011','659012'];
expandScenarios('650000',bingtuanCities,8744,2026,xj2026,'兵团城市的区域工资参考情景：借用已公布的新疆区域全口径工资8744元作为可比较的假设输入，不认定为兵团正式计发基数、兵团平均工资或缴费指数；兵团缴费上下限、地方待遇及取整未核验。仅适用于普通企业职工及灵活就业情景，不适用于连队职工、特殊退休或机关事业单位。');
xjRef.isolatedCities=bingtuanCities;
xjRef.reviewedAt='2026-10-19';
xjRef.notes.push('新增石河子等12个兵团城市；独立隔离自治区缴费参数，采用明示区域工资情景。兵团统筹及特殊人员口径须由经办确认，不能将情景结果当作已核定待遇。兵团官方依据：https://www.xjbt.gov.cn/c/2018-07-16/8041214.shtml 。');
