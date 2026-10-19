import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {seedRegionalReferences} from '../src/data/regions';
import type {RegionalReference} from '../src/core/types';
const db=new DatabaseSync(resolve('data/policies.sqlite'));
mkdirSync('data/backups',{recursive:true});
const backup=resolve('data/backups',`references-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
db.exec(`VACUUM INTO '${backup.replace(/'/g,"''")}'`);
const changed:string[]=[];
db.exec('BEGIN');
try{
  for(const code of ['130000','140000','150000','210000','230000','320000','370000','410000','420000','450000','460000','500000','510000','520000','540000','610000','620000','630000','640000','650000']){
    const seed=seedRegionalReferences.find(r=>r.province===code)!;
    const row=db.prepare('SELECT body FROM regional_references WHERE province=?').get(code);
    if(!row)throw new Error(`缺少地区${code}`);
    const old=JSON.parse(String(row.body)) as RegionalReference;
    const merged=structuredClone(old);
    for(const p of seed.parameters)if(!merged.parameters.some(x=>x.kind===p.kind&&x.year===p.year))merged.parameters.push(p);
    for(const [city,params] of Object.entries(seed.cityParameters)){
      merged.cityParameters[city]=[...(old.cityParameters[city]||[])];
      for(const p of params)if(!merged.cityParameters[city].some(x=>x.kind===p.kind&&x.year===p.year))merged.cityParameters[city].push(p);
    }
    if(code==='210000'&&merged.cityParameters['210100']?.length&&merged.cityParameters['210200']?.length)merged.notes=merged.notes.filter(n=>!n.includes('这两市独立参数尚未核验'));
    if(code==='650000'&&seed.cityParameters['650100']?.length)merged.notes=merged.notes.filter(n=>!n.includes('暂不开放金额测算城市'));
    merged.notes=merged.notes.filter(n=>!n.startsWith('仅包头开放参考测算')&&!n.startsWith('仅武汉开放历史核定案例参考')&&!n.startsWith('仅指定主要城市开放'));
    if(code==='370000')merged.notes=merged.notes.filter(n=>!n.includes('测算选项暂隐藏'));
    for(const note of seed.notes)if(!merged.notes.includes(note))merged.notes.push(note);
    if(code==='320000')for(const p of merged.parameters)if(p.kind==='pensionBase'&&p.year===2025&&p.source.url===seed.parameters.find(x=>x.kind==='pensionBase')?.source.url)p.source=seed.parameters.find(x=>x.kind==='pensionBase')!.source;
    if(JSON.stringify(merged)!==JSON.stringify(old)){merged.reviewedAt=seed.reviewedAt;db.prepare('UPDATE regional_references SET body=? WHERE province=?').run(JSON.stringify(merged),code);changed.push(code);}
  }
  if(changed.length)db.prepare('INSERT INTO audit(action,detail,created) VALUES(?,?,?)').run('reviewed-reference-update',JSON.stringify({regions:changed,backup,scope:'人工核对官方原文后补充地区参考参数；不修改已发布地方公式'}),new Date().toISOString());
  db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log(JSON.stringify({changed,backup}));
