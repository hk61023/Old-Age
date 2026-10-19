// Isolated in-memory UI acceptance server. Never registered by server/index.ts.
import {resolve} from 'node:path';
import staticFiles from '@fastify/static';
import {openStore} from '../server/store';
import {buildApp} from '../server/app';
const db=openStore(':memory:'),{app}=await buildApp(db,{disableWatcher:true});
const host='127.0.0.1:33310';
let cookie:string|string[]|undefined;
app.get('/qa-monitor',async(_req,reply)=>{reply.header('set-cookie',cookie!);return reply.redirect('/admin');});
await app.register(staticFiles,{root:resolve('dist')});app.setNotFoundHandler((_req,reply)=>reply.sendFile('index.html'));
const login=await app.inject({method:'POST',url:'/api/admin/setup',headers:{host,origin:'http://'+host,'content-type':'application/json'},payload:{password:'isolated-ui-fixture-password'}});cookie=login.headers['set-cookie'];
await app.listen({host:'127.0.0.1',port:33310});console.log('Isolated UI acceptance: http://127.0.0.1:33310/qa-monitor');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>{db.close();process.exit(0);}));
