import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const db=new DatabaseSync('/var/lib/yanglao/data/policies.sqlite',{readOnly:true});
try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  const counts=Object.fromEntries(['policies','regional_references','candidates','income_records','income_candidates','monitor_sources','monitor_tasks'].filter(t=>tables.includes(t)).map(t=>[t,db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
  const hash=table=>tables.includes(table)?createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all())).digest('hex'):null;
  console.log(JSON.stringify({counts,adminInitialized:!!db.prepare("SELECT 1 FROM settings WHERE key='admin'").get(),policyHash:hash('policies'),incomeHash:hash('income_records'),referenceHash:hash('regional_references')},null,2));
}finally{db.close();}
