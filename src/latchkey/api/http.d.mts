export interface ApiMetadata {route:string;input:Record<string,any>;raw:Uint8Array;signatureMethod:string;signaturePath:string;pagination:any;definition:any}
export {ApiError,resolveApi} from './catalogue.mjs';
export function apiRequest(request:Request,dispatch:(request:Request,meta:{route:string;input:Record<string,any>;raw:Uint8Array;signatureMethod:string;signaturePath:string;pagination:any;definition:any})=>Promise<Response>):Promise<Response|null>;
export function apiAuthenticated(route:string,input:any,ctx:any):Promise<any>;
export function rateApi(ctx:any):Promise<void>;
