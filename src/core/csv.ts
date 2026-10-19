import Papa from 'papaparse';
import type { RecordRow } from './types';
import { recordIssues } from './engine';
export const CSV_HEADER=['起始年月','截止年月','省级代码','市级代码','月缴费基数'];
export const CSV_TEMPLATE='\uFEFF'+CSV_HEADER.join(',')+'\r\n2025-01,2025-12,330000,330100,8000\r\n';
export function parseRecords(text:string,asOf:string,validCities:Map<string,string>,birth?:string) {
  if(text.length>1_000_000) return {rows:[] as RecordRow[],errors:['文件超过1MB，请拆分后导入']};
  const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
  const errors=parsed.errors.map(e=>`CSV格式错误：${e.message}`);const [header,...data]=parsed.data;
  if(!header||header.map(x=>x.trim()).join(',')!==CSV_HEADER.join(','))return {rows:[] as RecordRow[],errors:['列名与顺序不匹配，请使用标准模板']};
  if(data.length>1000)return {rows:[] as RecordRow[],errors:['最多导入1000行']};
  const rows=data.map((cells,i)=>{
    const [start='',end='',province='',city='',base='']=cells.map(c=>c.trim());
    if(cells.length!==5)errors.push(`第${i+1}行应有5列`);
    if(!/^\d{6}$/.test(province)||!/^\d{6}$/.test(city)||validCities.get(city)!==province)errors.push(`第${i+1}行省市代码不匹配或不在地区目录中`);
    if(!/^\d+(\.\d{1,2})?$/.test(base))errors.push(`第${i+1}行金额格式无效`);
    return {start,end,province,city,base:Number(base)};
  });
  return {rows,errors:[...errors,...recordIssues(rows,asOf,birth)]};
}
