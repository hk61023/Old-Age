import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
if(!existsSync(resolve('data/policies.sqlite')))throw new Error('政策数据库不存在，请先启动网站');
mkdirSync('data/backups',{recursive:true});
const target=resolve('data/backups',`policies-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(resolve('data/policies.sqlite'));
db.exec(`VACUUM INTO '${target.replace(/'/g,"''")}'`);db.close();console.log(`一致性备份已生成：${target}`);
