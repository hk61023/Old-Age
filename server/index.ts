import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import staticFiles from '@fastify/static';
import { openStore } from './store';
import { buildApp } from './app';
const db=openStore(resolve('data/policies.sqlite'));const {app}=await buildApp(db);
if(existsSync(resolve('dist/index.html'))){await app.register(staticFiles,{root:resolve('dist')});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'接口不存在'}):reply.sendFile('index.html'));}
else {app.get('/',async(_req,reply)=>reply.type('text/html').send('<html lang="zh-CN"><meta charset="utf-8"><h1>知年 · 首次启动</h1><p>请先运行 npm run build，然后重新启动。</p></html>'));}
await app.listen({port:Number(process.env.PORT||3210),host:'127.0.0.1'});
console.log('知年养老金测算已启动：http://127.0.0.1:'+String(process.env.PORT||3210));
console.log('管理员首次设置：http://127.0.0.1:'+String(process.env.PORT||3210)+'/admin');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>{db.close();process.exit(0);});});
