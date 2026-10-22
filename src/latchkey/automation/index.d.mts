export class AutomationError extends Error {code:string;status:number;constructor(code:string,status?:number)}
export function automationPublic(route:string,input:any,ctx:any):Promise<any>;
export function automationAuthenticated(route:string,input:any,ctx:any):Promise<any>;
export const tools:any[];
