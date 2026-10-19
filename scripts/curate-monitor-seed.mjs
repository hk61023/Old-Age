import {readFileSync,writeFileSync} from 'node:fs';
const report=JSON.parse(readFileSync('artifacts/discovery/report.json','utf8'));
const discovered=JSON.parse(readFileSync('artifacts/discovery/seed.json','utf8'));
// Explicitly review the discovery output: a matching navigation caption alone is not a directory.
const keep=[0,1,2,3,9,10,11,12,13,14,16,21,25,26];
const seed=keep.map(i=>({...discovered[i]}));
for(const s of seed){
  if(s.url.includes('shanxi.chinatax')){s.region='140000';s.department='税务';s.title='山西税务 · '+s.title.split(' · ').at(-1);}
  if(s.url.includes('/web/detail/'))s.kind='article';
  if(s.url.includes('rsj.weihai')){s.region='371000';s.title='威海市人社局通知公告';}
  if(s.url.includes('shbx.hrss')){s.kind='entry';s.title='河南省社会保险中心入口（需核验具体栏目）';}
  if(s.url.includes('tjj.henan')){s.kind='entry';s.title='河南省统计局入口';s.channel='income';s.department='统计';}
  if(s.url.includes('ayx.gov')){s.region='410000';s.title='安阳县数据发布（县级来源，不代表全省或郑州市数据）';s.channel='income';s.department='统计/政府';}
}
const national=[
 ['https://www.gov.cn/zhengce/zuixin/','国务院最新政策发布','国务院','policy'],
 ['https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/gfxwj/','人社部规范性文件','人社','policy'],
 ['https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/','财政部政策发布','财政','policy'],
 ['https://www.chinatax.gov.cn/chinatax/n810341/n810755/index.html','税务总局政策文件（历史栏目，需核对迁移）','税务','policy'],
 ['https://www.stats.gov.cn/sj/zxfb/','国家统计局数据发布','统计','income']
];
for(const [url,title,department,channel]of national)seed.push({url,title,department,channel,region:'000000',kind:'directory',enabled:true,topics:channel==='income'?['居民收入','平均工资','统计公报']:['养老保险','缴费基数','退休']});
for(const s of seed){const o=report.observations.find(o=>o.url===s.url&&['automatic','manual'].includes(o.status));if(o){s.verification=s.kind==='entry'?'manual':o.status;s.checkedAt=report.checkedAt;s.error=s.verification==='manual'?o.reason:'';}}
writeFileSync('src/data/monitor-seed.json',JSON.stringify(seed,null,2)+'\n');
const accepted=seed.filter(s=>s.verification==='automatic'&&s.kind!=='entry');
writeFileSync('artifacts/discovery/人工复核说明.md',`# 来源发现人工复核\n\n核验时间：${report.checkedAt}。原始探测149个入口及文件页、32个栏目候选。原始报告中的20次可解析结果不是20个有效监测栏目。\n\n剔除无关税务、职称新闻和误认的栏目；将省级税务站点改回省级归属、威海人社归入威海，安阳县来源不计郑州市覆盖。最终预置${seed.length}条（含5个国家栏目），其中${accepted.length}条通过本次正文解析；其余保留待核验或人工处理。31省的既有文件和部门入口继续登记，尚缺独立城市栏目详见后台覆盖列表。\n\n新增来源及探测成功均不代表已核验养老金参数；超时站点没有绕过验证码或证书检查。原始报告保留用于审计，部署采用src/data/monitor-seed.json中的人工复核清单。\n`);
console.log(JSON.stringify({curated:seed.length,automatic:accepted.length,manual:seed.filter(s=>s.verification==='manual').length}));
