import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
const db=new DatabaseSync(resolve('data/policies.sqlite'),{readOnly:true});
const policies=db.prepare('SELECT id,version FROM policies WHERE active=1').all();
const jobs=db.prepare('SELECT id,status,started,finished,detail FROM jobs ORDER BY id DESC LIMIT 3').all();
const status={policies,jobs,adminInitialized:!!db.prepare("SELECT key FROM settings WHERE key='admin'").get(),integrity:db.prepare('PRAGMA integrity_check').all()};
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/policy-status.json',JSON.stringify(status,null,2));db.close();console.log(JSON.stringify(status,null,2));
