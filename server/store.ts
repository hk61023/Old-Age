import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedPolicies, nationalSources } from '../src/data/policies';
import type { Policy } from '../src/core/types';
import type { RegionalReference,RegionalParameter } from '../src/core/types';
import { seedRegionalReferences } from '../src/data/regions';
import { initIncome,incomeSources } from './income';
import { initMonitorSources } from './monitor-sources';
import { applyCityCoverageUpdate } from './reference-updates';
export function openStore(path:string){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS policies(id TEXT NOT NULL,version INTEGER NOT NULL,active INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,version));
    CREATE TABLE IF NOT EXISTS candidates(id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,title TEXT NOT NULL,hash TEXT NOT NULL,previous TEXT NOT NULL DEFAULT '',content TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',proposal TEXT,fixtures TEXT,created TEXT NOT NULL,UNIQUE(url,hash));
    CREATE TABLE IF NOT EXISTS snapshots(url TEXT PRIMARY KEY,hash TEXT NOT NULL,content TEXT NOT NULL,checked TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,started TEXT NOT NULL,finished TEXT,status TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '');`);
  db.exec('CREATE TABLE IF NOT EXISTS regional_references(province TEXT PRIMARY KEY,body TEXT NOT NULL)');
  const insertReference=db.prepare('INSERT OR IGNORE INTO regional_references VALUES(?,?)');
  for(const ref of seedRegionalReferences)insertReference.run(ref.province,JSON.stringify(ref));
  if(!db.prepare("SELECT value FROM settings WHERE key='seeded'").get()){
    db.exec('BEGIN');
    try{for(const p of seedPolicies)db.prepare('INSERT INTO policies VALUES(?,?,1,?)').run(p.id,p.version,JSON.stringify(p));
      db.prepare('INSERT INTO settings VALUES(?,?)').run('seeded','1');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  applyCityCoverageUpdate(db);
  db.prepare("UPDATE jobs SET status='interrupted',finished=? WHERE status='running'").run(new Date().toISOString());
  initIncome(db);
  initMonitorSources(db,sources(db),regionalReferences(db),incomeSources(db));
  return db;
}
export type Store=ReturnType<typeof openStore>;
export function activePolicies(db:Store):Policy[]{return db.prepare('SELECT body FROM policies WHERE active=1').all().map(row=>JSON.parse(String(row.body)));}
export function setting(db:Store,key:string){const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?String(row.value):null;}
export function setSetting(db:Store,key:string,value:string){db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
export function audit(db:Store,action:string,detail:string){db.prepare('INSERT INTO audit(action,detail,created) VALUES(?,?,?)').run(action,detail,new Date().toISOString());}
export function regionalReferences(db:Store):RegionalReference[]{
  const refs=db.prepare('SELECT body FROM regional_references ORDER BY province').all().map(row=>JSON.parse(String(row.body)) as RegionalReference);
  // Published local formulas remain authoritative; reference parameters enable explicitly partial national components only.
  for(const ref of refs){
    const byRegion=new Map<string,Policy>();
    for(const p of activePolicies(db).filter(p=>p.region===ref.province||p.region==='440300'&&ref.province==='440000')){
      const old=byRegion.get(p.region);if(!old||p.effectiveFrom>old.effectiveFrom)byRegion.set(p.region,p);
    }
    for(const p of byRegion.values()){
      const parameterSources=p.sources.filter(s=>s.kind==='parameter');
      const baseSource=parameterSources.find(s=>s.title.includes(String(p.parameterYear))&&s.title.includes('计发基数'))||parameterSources.find(s=>s.title.includes(String(p.parameterYear)))||parameterSources[0];
      const paySource=parameterSources.find(s=>s.title.includes(String(p.contribution.year)))||parameterSources.find(s=>s.documentNo.includes(String(p.contribution.year)))||parameterSources[0];
      const values:RegionalParameter[]=[{kind:'pensionBase',value:p.base,year:p.parameterYear,from:`${p.parameterYear}-01-01`,to:`${p.parameterYear}-12-31`,source:baseSource},
        ...(['contributionMin','contributionMax','indexBase'] as const).map(kind=>({kind,value:kind==='contributionMin'?p.contribution.min:kind==='contributionMax'?p.contribution.max:p.contribution.indexBase,year:p.contribution.year,from:p.contribution.from,source:paySource}))];
      if(p.region===ref.province){ref.parameters.push(...values);if(ref.province==='440000')ref.parameters.find(x=>x.kind==='pensionBase')!.excludeCities=['440300'];}
      else ref.cityParameters[p.region]=values;
      ref.notes.push(...p.limitations);
    }
  }
  return refs;
}
export function sources(db:Store){const refs=regionalReferences(db);const map=new Map<string,{title:string;url:string;kind:string}>();for(const s of [...nationalSources,...activePolicies(db).flatMap(p=>p.sources),...refs.flatMap(r=>[...r.parameters,...Object.values(r.cityParameters).flat()].map(p=>p.source)),...refs.map(r=>r.portal)])map.set(s.url,s);return [...map.values()];}
