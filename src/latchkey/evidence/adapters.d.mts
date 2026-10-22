export type DestinationName = 'Evidence' | 'Vanta' | 'Drata' | 'Secureframe';
export type EvidenceCredential = string | {apiKey:string; keySecret:string};
export type DeliveryStage = {name:string; binding?:string; uploadReference?:string; referenceAvailable?:boolean};
export type DeliveryOutcome = {state:'accepted'|'rejected'|'backlog'; providerReference:string|null; retryable:boolean; status:number|null; stage:DeliveryStage};
export function deliverEvidence(input:{destination:DestinationName;endpoint?:string;credential:EvidenceCredential;target:string;workspace?:string|number|null;packageValue:object;coveredFrom:string;coveredTo:string;fetcher?:typeof fetch;resume?:DeliveryStage}):Promise<DeliveryOutcome>;
