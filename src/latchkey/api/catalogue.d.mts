export class ApiError extends Error {code:string;status:number;constructor(code:string,status?:number)}
export const routes:any[][];
export function resolveApi(method:string,path:string,body?:object):{route:string;input:Record<string,any>;pagination:any;definition:any};
