import type {EvidenceCredential, DeliveryOutcome} from './adapters.mjs';
export type EvidenceDestination = {id:string;destination:'evidence'|'vanta'|'drata'|'secureframe';endpoint:string;target:string;workspace:string|number|null;active:boolean;revision:number};
export type EvidencePreview = {review:string;destination:EvidenceDestination;package:Record<string,any>;fields:string[];packageHash:string;sourceTimestamp:string|number;signedPackage:Record<string,any>};
export type EvidenceDelivery = Partial<DeliveryOutcome> & {id:string;phase?:string;sourceTimestamp?:string|number;destination?:string;[key:string]:any};
export class EvidenceClient {
 constructor(client:any);
 destinations():Promise<EvidenceDestination[]>;
 configure(value:Pick<EvidenceDestination,'destination'|'endpoint'|'target'> & {workspace?:string|number|null}):Promise<EvidenceDestination>;
 revoke(destination:EvidenceDestination):Promise<EvidenceDestination>;
 deliveries(review:string):Promise<EvidenceDelivery[]>;
 preview(review:string,destination:EvidenceDestination):Promise<EvidencePreview>;
 send(preview:EvidencePreview,credential:EvidenceCredential,confirmed:boolean,options?:{fetcher?:typeof fetch}):Promise<EvidenceDelivery>;
}
