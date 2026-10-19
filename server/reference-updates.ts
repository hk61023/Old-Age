import type {DatabaseSync} from 'node:sqlite';
import type {RegionalReference} from '../src/core/types';
import {bingtuanCities,seedRegionalReferences} from '../src/data/regions';

// Reviewed additive migration. Published formulas, existing values and old plans are untouched.
export function applyCityCoverageUpdate(db:DatabaseSync){
  const key='reference-city-coverage-2026-10-19';
  if(db.prepare('SELECT 1 FROM settings WHERE key=?').get(key))return;
  const row=db.prepare('SELECT body FROM regional_references WHERE province=?').get('650000');
  if(!row)return;
  const old=JSON.parse(String(row.body)) as RegionalReference,merged=structuredClone(old);
  const seed=seedRegionalReferences.find(r=>r.province==='650000')!;
  const added:string[]=[];
  for(const city of bingtuanCities){
    if(!merged.cityParameters[city]?.length){merged.cityParameters[city]=structuredClone(seed.cityParameters[city]);added.push(city);}
  }
  merged.isolatedCities=[...new Set([...(old.isolatedCities||[]),...bingtuanCities])];
  for(const note of seed.notes.filter(n=>n.startsWith('新增石河子')))if(!merged.notes.includes(note))merged.notes.push(note);
  if(added.length)merged.reviewedAt='2026-10-19';
  db.exec('BEGIN');
  try{
    db.prepare('UPDATE regional_references SET body=? WHERE province=?').run(JSON.stringify(merged),'650000');
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key,new Date().toISOString());
    db.prepare('INSERT INTO audit(action,detail,created) VALUES(?,?,?)').run('city-coverage-update',JSON.stringify({province:'650000',added,isolated:bingtuanCities,scope:'明示区域工资参考情景，不发布兵团正式计发标准；保留既有城市数值'}),new Date().toISOString());
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
