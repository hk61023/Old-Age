import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
const db=new DatabaseSync('data/policies.sqlite',{readOnly:true});
try{
  const policies=db.prepare('SELECT body FROM policies WHERE active=1').all().map(r=>JSON.parse(String(r.body)));
  const references=db.prepare('SELECT body FROM regional_references ORDER BY province').all().map(r=>JSON.parse(String(r.body)));
  if(!policies.length||references.length!==31)throw new Error('政策数据不完整');
  mkdirSync('artifacts/deployment',{recursive:true});
  writeFileSync('artifacts/deployment/baseline.json',JSON.stringify({exportedAt:new Date().toISOString(),policies,references},null,2));
  console.log(JSON.stringify({policies:policies.length,references:references.length}));
}finally{db.close();}
