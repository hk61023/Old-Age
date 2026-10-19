export type Category = 'male60' | 'female55' | 'female50' | 'unknown';
export type Formula = 'beijing' | 'shanghai-old' | 'shanghai' | 'zhejiang' | 'guangdong' | 'shenzhen';
export interface Source { title: string; url: string; documentNo: string; publishedAt: string; kind: 'rule' | 'parameter' | 'directory'; }
export type RegionalParameterKind = 'pensionBase' | 'baseScenario' | 'contributionMin' | 'contributionMax' | 'indexBase';
export interface RegionalParameter { kind:RegionalParameterKind; year:number; value:number; from:string; to?:string; source:Source; excludeCities?:string[]; scenarioNote?:string; }
export interface RegionalReference { province:string; name:string; portal:Source; parameters:RegionalParameter[]; cityParameters:Record<string,RegionalParameter[]>; notes:string[]; reviewedAt:string; }
export interface Policy {
  id: string; version: number; region: string; name: string; formula: Formula;
  effectiveFrom: string; effectiveTo?: string; parameterYear: number; base: number;
  contribution: { year: number; from: string; min: number; max: number; indexBase: number };
  cityMinimums?: Record<string, number>; historicalIndexBases: Record<string, number>;
  verifiedAt: string; scope: string; limitations: string[]; sources: Source[];
  status: 'published' | 'draft' | 'rejected';
}
export interface RecordRow { start: string; end: string; province: string; city: string; base: number; }
export interface Experience { province: string; months: number; temporary: boolean; }
export interface PersonalInput {
  birth: string; category: Category; identity: 'employee' | 'flexible'; asOf: string;
  province: string; city: string; insuredProvince: string; insuredCity: string;
  paidMonths: number; contributionBase: number; firstInsured: string; deemedMonths: number;
  accountBalance?: number; balanceDate: string; averageIndex?: number;
  records: RecordRow[]; recordChoice: 'summary' | 'records' | 'unconfirmed';
  crossProvince: boolean; household: string; relationship: string; experiences: Experience[];
  experiencesComplete: boolean; locationConfirmed: boolean;
  transitionMonths?: number; transitionIndex?: number; shVirtualBalance?: number;
  bjPre98Months?: number; specialCase: boolean;
  localAmount?: number;
}
export interface Scenario { name: string; retirementOffset: number; contributionMultiplier: number; baseGrowth: number; accountInterest: number; }
export interface Calculation {
  engineVersion: string; status: 'complete' | 'partial' | 'blocked'; total: number | null;
  partialSubtotal?: number | null;
  reference?: {name:string; year:number; reviewedAt:string; sources:Source[]; basis?:'wage-scenario'; baseValue?:number; scenarioNote?:string};
  basic: number | null; account: number | null; transition: number | null; local: number | null; rounding: number;
  statutoryMonth: string; retirementMonth: string; firstPaymentMonth: string; retirementAgeMonths: number;
  originalRetirementAge?: number; statutoryDelayMonths?: number; statutoryAgeMonths?: number;
  minMonths: number; totalMonths: number; eligible: boolean; futurePersonalCost: number;
  futureMonths: number; projectedBalance: number | null; projectedBase: number | null; averageIndex: number | null;
  divisor: number | null; missing: string[]; assumptions: string[]; replaced: string[]; warnings: string[];
  policyId: string | null; policyVersion: number | null; regionResolution: string;
}
export interface SavedPlan { id: string; savedAt: string; input: PersonalInput; scenario: Scenario; policies: Policy[]; references?:RegionalReference[]; result: Calculation; }
