import { z } from 'zod';
import type { PersonalInput, Scenario, Policy } from '../src/core/types';
import { calculate } from '../src/core/engine';
import { officialUrl } from './watcher';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>!Number.isNaN(Date.parse(x)));
const official=z.string().url().refine(officialUrl,'必须使用HTTPS政府官方网站');
export const policySchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/).max(80),version:z.number().int().positive(),region:z.enum(['110000','310000','330000','440000','440300']),name:z.string().min(1).max(80),formula:z.enum(['beijing','shanghai','shanghai-old','zhejiang','guangdong','shenzhen']),effectiveFrom:date,effectiveTo:date.optional(),parameterYear:z.number().int().min(2000).max(2100),base:z.number().positive().max(100000),contribution:z.object({year:z.number().int().min(2000).max(2100),from:date,min:z.number().positive(),max:z.number().positive(),indexBase:z.number().positive()}),cityMinimums:z.record(z.number().positive()).optional(),historicalIndexBases:z.record(z.number().positive()),verifiedAt:date,scope:z.string().min(10),limitations:z.array(z.string()),sources:z.array(z.object({title:z.string().min(1),url:official,documentNo:z.string(),publishedAt:z.string(),kind:z.enum(['rule','parameter','directory'])})).min(2),status:z.enum(['published','draft','rejected'])}).strict().superRefine((p,ctx)=>{
  if(p.contribution.min>p.contribution.max)ctx.addIssue({code:'custom',message:'缴费下限不能大于上限'});
  if(p.effectiveTo&&p.effectiveTo<p.effectiveFrom)ctx.addIssue({code:'custom',message:'生效区间顺序错误'});
  const allowed:Record<string,string[]>= {'110000':['beijing'],'310000':['shanghai','shanghai-old'],'330000':['zhejiang'],'440000':['guangdong'],'440300':['shenzhen']};
  if(!allowed[p.region].includes(p.formula))ctx.addIssue({code:'custom',message:'地区与已实现公式不匹配'});
});
export interface Fixture { name:string; input:PersonalInput; scenario:Scenario; expectedBasic:number; expectedAccount:number; }
export function fixtureFor(p:Policy):Fixture {
  const old=p.formula==='shanghai-old';const historical=p.effectiveTo==='2025-12-31';const m=old?'2026-03':historical?'2025-10':'2026-10';
  return {name:'20年、指数1、个人账户139000元、计发月数139的独立手算样例；地方项目仅使用测试核定值0',input:{birth:old?'1965-12':historical?'1965-08':'1966-05',category:'male60',identity:'employee',asOf:m,province:p.region==='440300'?'440000':p.region,city:p.region==='440300'?'440300':p.region.slice(0,2)+'0100',insuredProvince:p.region==='440300'?'440000':p.region,insuredCity:p.region==='440300'?'440300':'',paidMonths:240,contributionBase:10000,firstInsured:historical?'2005-01':'2006-01',deemedMonths:0,accountBalance:139000,balanceDate:m,averageIndex:1,localAmount:0,records:[],recordChoice:'summary',crossProvince:false,household:'',relationship:'',experiences:[],experiencesComplete:false,locationConfirmed:false,specialCase:false},scenario:{name:'手算基线',retirementOffset:0,contributionMultiplier:1,baseGrowth:0,accountInterest:0},expectedBasic:{beijing:2409.8,shanghai:2515.4,'shanghai-old':2486.8,zhejiang:p.parameterYear===2026?1707.4:1686.6,guangdong:1898.6,shenzhen:2258.6}[p.formula],expectedAccount:1000};
}
export function runFixtures(p:Policy,fixtures:Fixture[]){
  if(!Array.isArray(fixtures)||!fixtures.length||fixtures.length>20)throw new Error('至少提供一个独立手算样例，最多20个');
  return fixtures.map(f=>{
    if(!f.input||!f.scenario||!Number.isFinite(f.expectedBasic)||!Number.isFinite(f.expectedAccount))throw new Error('样例格式无效');
    const result=calculate(f.input,f.scenario,[{...p,status:'published'}]);
    return {name:f.name,pass:result.basic!==null&&result.account!==null&&Math.abs(result.basic-f.expectedBasic)<.005&&Math.abs(result.account-f.expectedAccount)<.005,expected:{basic:f.expectedBasic,account:f.expectedAccount},actual:{basic:result.basic,account:result.account},missing:result.missing};
  });
}
