// Finalize the reviewed first-release baseline without losing captured sources.
// Refuses to run after administrator setup or an administrative policy publication.
import {openStore,activePolicies,setting,audit} from '../server/store';
import {seedPolicies} from '../src/data/policies';
import {policySchema,fixtureFor,runFixtures} from '../server/validation';
import {resolve} from 'node:path';
const db=openStore(resolve('data/policies.sqlite'));
try{
  if(setting(db,'admin')||db.prepare("SELECT id FROM audit WHERE action IN ('publish','rollback')").get())throw new Error('已启用管理流程，必须在后台审核发布，不能重置基线');
  const current=activePolicies(db);let changed=0;
  for(const p of seedPolicies){policySchema.parse(p);if(runFixtures(p,[fixtureFor(p)]).some(t=>!t.pass))throw new Error('基线独立手算未通过：'+p.id);}
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const p of seedPolicies){const old=current.find(x=>x.id===p.id);if(old&&JSON.stringify({...old,version:1})===JSON.stringify(p))continue;
      const max=db.prepare('SELECT MAX(version) AS v FROM policies WHERE id=?').get(p.id);
      const next={...p,version:Number(max?.v||0)+1};
      db.prepare('UPDATE policies SET active=0 WHERE id=?').run(p.id);
      db.prepare('INSERT INTO policies VALUES(?,?,1,?)').run(next.id,next.version,JSON.stringify(next));changed++;
    }
    audit(db,'baseline-finalized',`首版人工核对来源修订，独立样例通过，更新${changed}个政策包；来源快照与历史版本保留`);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  console.log(`基线完成：${changed}个政策包更新，管理员仍未设置`);
}finally{db.close();}
