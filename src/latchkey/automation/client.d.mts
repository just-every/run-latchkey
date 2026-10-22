export class AutomationClient {
 constructor(client:any);requests():Promise<any[]>;preview(request:string):Promise<any>;decide(preview:any,decision:'approve'|'deny',confirmed:boolean):Promise<any>;fulfill(preview:any):Promise<any>;
 issueCredential(value:any):Promise<any>;revokeCredential(credential:string):Promise<any>;webhooks():Promise<any[]>;subscribe(value:any):Promise<any>;webhookStatus(subscription:string):Promise<any>;rotateWebhook(subscription:string,revision:number,secret:string,confirmed:boolean):Promise<any>;revokeWebhook(subscription:string,revision:number):Promise<any>;enqueue(subscription:string,revision:number,event:string,confirmed:boolean):Promise<any>;dispatch(subscription:string,revision:number,delivery:string,confirmed:boolean):Promise<any>;
}
export function mcpRequest(options:{origin:string;route?:string;input:any;token:string;privateKey:string;fetcher?:typeof fetch}):Promise<any>;
export class McpClient {
 constructor(options:{origin:string;token:string;privateKey:string;fetcher?:typeof fetch});request(method:string,params?:any):Promise<any>;initialize():Promise<any>;tools():Promise<any>;posture(vault:string):Promise<any>;requestAccess(input:any):Promise<any>;
}
