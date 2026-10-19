// Temporary acceptance server: records only request method and path, never request bodies.
import { resolve } from 'node:path';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import staticFiles from '@fastify/static';
import { buildApp } from '../server/app';
import { openStore } from '../server/store';
mkdirSync('artifacts',{recursive:true});
const log=resolve('artifacts/'+(process.env.QA_LOG_NAME||'browser-requests.jsonl'));writeFileSync(log,'');
const db=openStore(':memory:');
const {app}=await buildApp(db,{disableWatcher:true});
app.addHook('onRequest',async(req)=>{appendFileSync(log,JSON.stringify({time:new Date().toISOString(),method:req.method,path:req.url.split('?')[0]})+'\n');});
await app.register(staticFiles,{root:resolve('dist')});
app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'接口不存在'}):reply.sendFile('index.html'));
await app.listen({host:'127.0.0.1',port:3211});console.log('验收专用服务 http://127.0.0.1:3211');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>{db.close();process.exit(0);});});
