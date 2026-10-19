import {readFileSync} from 'node:fs';
import {openStore} from '../server/store';
const db=openStore('data/policies.sqlite');
try{
  if(db.prepare("SELECT value FROM settings WHERE key='deployment-baseline'").get())throw new Error('服务器已导入政策，不自动覆盖现有数据库');
  const baseline=JSON.parse(readFileSync('baseline.json','utf8'));
  if(baseline.references.length!==31||!baseline.policies.length)throw new Error('部署基线不完整');
  db.exec('BEGIN');
  db.prepare('UPDATE policies SET active=0').run();
  for(const p of baseline.policies)db.prepare('INSERT INTO policies(id,version,active,body) VALUES(?,?,1,?) ON CONFLICT(id,version) DO UPDATE SET active=1,body=excluded.body').run(p.id,p.version,JSON.stringify(p));
  for(const r of baseline.references)db.prepare('INSERT INTO regional_references(province,body) VALUES(?,?) ON CONFLICT(province) DO UPDATE SET body=excluded.body').run(r.province,JSON.stringify(r));
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('deployment-baseline',baseline.exportedAt);
  db.exec('COMMIT');console.log('Deployment policy baseline imported; no personal data or local credentials transferred.');
}finally{db.close();}
