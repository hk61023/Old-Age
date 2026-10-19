import {fetchOfficial} from '../server/watcher';
const start=Date.now();console.log('probe-start',process.argv[2]);
try{const r=await fetchOfficial(process.argv[2]);console.log(JSON.stringify({length:r.content.length,links:r.links.length,elapsed:Date.now()-start}));}catch(e){console.log(String(e),Date.now()-start);process.exitCode=1;}
