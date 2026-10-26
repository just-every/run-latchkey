export const providerClasses: readonly {id:string;provider:string;label:string;issue:string;validate:string;revoke:string;scopes:string;overlap:string;quota:string;ceremony:string;url:string}[];
export function cutoverPlan(input?:any): {blockers:string[];destructiveCutover:false;maintenance:string};
export function validateProviderPlan(plan:any):any;
