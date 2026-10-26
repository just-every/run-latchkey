import type {EvidenceCredential, DeliveryOutcome} from './adapters.mjs';
export type EvidenceDestination = {id:string;destination:'evidence'|'vanta'|'drata'|'secureframe';endpoint:string;target:string;workspace:string|number|null;active:boolean;revision:number;maxAgeSeconds:number;credential_version:number;credentialSaved:boolean};
export type EvidencePreview = {review:string;destination:EvidenceDestination;package:Record<string,any>;fields:string[];packageHash:string;sourceTimestamp:string|number;signedPackage:Record<string,any>;stale:boolean;staleAt:number;kind:string};
export type EvidenceDelivery = Partial<DeliveryOutcome> & {id:string;phase?:string;sourceTimestamp?:string|number;destination?:string;[key:string]:any};
export class EvidenceClient {
 constructor(client:any);
 static verify(value:any,pinnedAuthority:any):Promise<boolean>;
 capture(vault:string,confirmed:boolean):Promise<any>;
 sources(vault:string):Promise<any[]>;
 deletions():Promise<any[]>;
 requestDeletion(delivery:string,requestReference:string,confirmed:boolean):Promise<any>;
 confirmDeletion(deletion:string,confirmationReference:string,confirmed:boolean):Promise<any>;
 destinations():Promise<EvidenceDestination[]>;
 configure(value:Pick<EvidenceDestination,'destination'|'endpoint'|'target'> & {workspace?:string|number|null;maxAgeSeconds?:number}):Promise<EvidenceDestination>;
 revoke(destination:EvidenceDestination):Promise<EvidenceDestination>;
 delivery(delivery:string):Promise<EvidenceDelivery>;
 inspectUpload(delivery:string,credential:EvidenceCredential,options?:{fetcher?:typeof fetch}):Promise<any>;
 resumeUpload(delivery:string,credential:EvidenceCredential,confirmed:boolean,options?:{fetcher?:typeof fetch}):Promise<EvidenceDelivery>;
 deliveries(review:string):Promise<EvidenceDelivery[]>;
 saveCredential(destination:EvidenceDestination,credential:EvidenceCredential,confirmed:boolean):Promise<any>;
 loadCredential(destination:EvidenceDestination):Promise<EvidenceCredential>;
 forgetCredential(destination:EvidenceDestination,confirmed:boolean):Promise<any>;
 sendSaved(preview:EvidencePreview,confirmed:boolean,options?:{fetcher?:typeof fetch}):Promise<EvidenceDelivery>;
 preview(review:string,destination:EvidenceDestination):Promise<EvidencePreview>;
 send(preview:EvidencePreview,credential:EvidenceCredential,confirmed:boolean,options?:{fetcher?:typeof fetch}):Promise<EvidenceDelivery>;
}
