export type AliasProviderOptions = {token:string;fetcher?:typeof fetch};
export type AliasDomain = {id:string;scope:'company'|'personal';owner:string;provider:string;zone:string;domain:string;providerStatus:string;routingEnabled:boolean;observedAt:number;active:boolean;revision:number};
export type AliasMailbox = {id:string;scope:'company'|'personal';owner:string;address:string;providerRef:string|null;verifiedAt:number|null;observedAt:number;active:boolean;revision:number};
export type AliasRecord = {id:string;scope:'company'|'personal';owner:string;vault:string;object:string;state:string;intent:string|null;ruleRef:string|null;replaces:string|null;replacedBy:string|null;delivery:string;failure:string|null;revision:number;createdAt:number;updatedAt:number;deliveryReportedAt:number|null;domain:{id:string;zone:string;domain:string;providerStatus:string;active:boolean}|null;mailbox:{id:string;address:string;verifiedAt:number|null;active:boolean;scope:string}|null;forwarding:string;canManage:boolean;canRetarget:boolean;address?:string|null};
export class AliasClient {
 constructor(client:any);
 domains():Promise<AliasDomain[]>;
 mailboxes():Promise<AliasMailbox[]>;
 list():Promise<AliasRecord[]>;
 saveDomain(value:{scope:'company'|'personal';zone:string;token:string;confirmed?:boolean;fetcher?:typeof fetch}):Promise<AliasDomain>;
 saveMailbox(value:{scope:'company'|'personal';account:string;address:string;token:string;requestVerification?:boolean;confirmed?:boolean;fetcher?:typeof fetch}):Promise<AliasMailbox>;
 revokeDomain(domain:AliasDomain):Promise<AliasDomain>;
 revokeMailbox(mailbox:AliasMailbox):Promise<AliasMailbox>;
 report(alias:string,provider:any,extra?:Record<string,unknown>):Promise<AliasRecord>;
 create(value:{vault:string;object:string;domain:{id:string};mailbox:{id:string};replaces?:string|null;prepare?:(pending:{id:string;address:string})=>Promise<unknown>}&AliasProviderOptions):Promise<{alias:AliasRecord;address:string;replaced:string|null}>;
 disable(alias:AliasRecord,options:AliasProviderOptions):Promise<AliasRecord>;
 retarget(alias:AliasRecord,mailbox:AliasMailbox,options:AliasProviderOptions):Promise<AliasRecord>;
 replace(alias:AliasRecord,options:{domain?:{id:string};mailbox?:{id:string}}&AliasProviderOptions):Promise<{alias:AliasRecord;address:string;replaced:string|null;disabled:AliasRecord}>;
 reconcile(alias:AliasRecord,options:{address?:string}&AliasProviderOptions):Promise<AliasRecord>;
 reportDelivery(alias:AliasRecord,state:'received'|'not-received'):Promise<AliasRecord>;
 export(scope:'company'|'personal',readItems?:()=>Promise<any[]>):Promise<any>;
}
export function pendingAlias(item:any,entry:{id:string;address:string}):any;
export function withAlias(item:any,created:{address:string;alias:AliasRecord}):any;
