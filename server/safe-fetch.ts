import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {BlockList,isIP} from 'node:net';
const denied=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)denied.addSubnet(ip,bits);
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');denied.addSubnet('2001:db8::',32,'ipv6');
export function publicAddress(address:string){const family=isIP(address);return family===4?!denied.check(address):family===6&&global6.check(address,'ipv6')&&!denied.check(address,'ipv6');}
export async function resolvePublic(host:string,resolver:(host:string,options:{all:true;verbatim:true})=>Promise<{address:string;family:number}[]>=lookup){
  const records=await resolver(host,{all:true,verbatim:true});
  if(!records.length||records.some(r=>!publicAddress(r.address)))throw new Error('来源解析到非公网地址，拒绝访问');
  return records.find(r=>r.family===4)||records[0];
}
// Pin the checked DNS address on the actual TLS connection to prevent DNS rebinding.
export const safeFetch:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('来源必须使用标准HTTPS');
  const address=await resolvePublic(url.hostname);
  return new Promise<Response>((resolve,reject)=>{
    const req=request(url,{method:'GET',agent:false,family:address.family,...{autoSelectFamily:false},
      lookup:(_host,_options,callback)=>callback(null,address.address,address.family),
      signal:init?.signal||undefined,headers:{'User-Agent':'ZhiyanPolicyMonitor/2.0','Accept-Encoding':'identity'}},res=>{
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){req.destroy(new Error('正文大于2MB，需人工核验'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{
        const headers=new Headers();for(const [key,value]of Object.entries(res.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
        const status=res.statusCode||500;resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}));
      });
    });
    req.setTimeout(15000,()=>req.destroy(new Error('官方来源请求超时')));req.on('error',reject);req.end();
  });
};
