import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const requests=readFileSync('artifacts/browser-requests.jsonl','utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x) as {time:string;method:string;path:string});
const firstAdminWrite=requests.findIndex(r=>r.method!=='GET'&&r.path.startsWith('/api/admin/'));
const personal=requests.slice(0,firstAdminWrite<0?requests.length:firstAdminWrite);
const groups:Record<string,number>={};for(const r of requests){const key=r.method+' '+r.path;groups[key]=(groups[key]||0)+1;}
const backup=readdirSync('data/backups').filter(x=>x.endsWith('.sqlite')).sort().at(-1)!;
const db=new DatabaseSync(resolve('data/backups',backup),{readOnly:true});
const summary={personalPhase:{requests:personal.length,methods:[...new Set(personal.map(r=>r.method))],hasWriteRequest:personal.some(r=>r.method!=='GET'),note:'填入、导入、比较、保存和刷新恢复阶段；不记录请求正文；同时审阅客户端fetch调用'},allRequestGroups:groups,backup:{file:backup,integrity:db.prepare('PRAGMA integrity_check').all(),activePolicyCount:db.prepare('SELECT COUNT(*) AS n FROM policies WHERE active=1').get()}};
db.close();writeFileSync('artifacts/network-summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
