export function invokeApi(client:any,method:string,path:string,input?:object):Promise<any>;
export function requestApi(client:any,method:string,path:string,input?:object,options?:{ifMatch?:number}):Promise<any>;
export function apiCommand(client:any,input:any):Promise<any>;
export const commands:Record<string,[string,string]>;
export class ApiClient {
 constructor(client:any);request(method:string,path:string,input?:object,options?:{ifMatch?:number}):Promise<any>;
 users(page?:any):Promise<any>;user(account:string):Promise<any>;inviteUser(input:{email:string;displayName:string;role?:string;returnTo?:string}):Promise<any>;setUserRole(operator:string,role:string):Promise<any>;setUserStatus(operator:string,status:'active'|'inactive'):Promise<any>;cancelInvitation(operator:string):Promise<any>;
 groups(page?:any):Promise<any>;createGroup(group:string):Promise<any>;groupMembers(group:string):Promise<any>;setGroup(group:string,accounts:string[]):Promise<any>;
 vaults(page?:any):Promise<any>;vault(vault:string):Promise<any>;createVault(input:any):Promise<any>;
 encryptedItems(vault:string,page?:any):Promise<any>;encryptedItem(vault:string,object:string):Promise<any>;putEncryptedItem(vault:string,object:string,input:any,options?:{ifMatch?:number}):Promise<any>;
 policies():Promise<any>;setSharingPolicy(input:any):Promise<any>;setGeneratorPolicy(input:any):Promise<any>;
 projects(page?:any):Promise<any>;project(project:string):Promise<any>;createProject(input:any):Promise<any>;environments(project:string,page?:any):Promise<any>;createEnvironment(project:string,input:any):Promise<any>;
 events(page?:any):Promise<any>;reviews(page?:any):Promise<any>;review(review:string):Promise<any>;createReview(input:any):Promise<any>;
 prepareImport(input:any):Promise<any>;activateImport(restore:string,input:any):Promise<any>;operation(restore:string):Promise<any>;
}
