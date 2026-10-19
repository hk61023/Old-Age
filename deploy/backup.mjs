import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
mkdirSync('/var/lib/yanglao/backups',{recursive:true,mode:0o700});
const file=`/var/lib/yanglao/backups/policies-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
const db=new DatabaseSync('/var/lib/yanglao/data/policies.sqlite');
try{db.exec(`VACUUM INTO '${file}'`);}finally{db.close();}
const copy=new DatabaseSync(file,{readOnly:true});
try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}finally{copy.close();}
console.log(file);
