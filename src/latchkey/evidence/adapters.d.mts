export type DestinationName = 'Evidence' | 'Vanta' | 'Drata' | 'Secureframe';
export type EvidenceCredential = string | {apiKey:string; keySecret:string};
export type DeliveryStage = {name:string; binding?:string; uploadReference?:string; referenceAvailable?:boolean};
export type DeliveryOutcome = {state:'accepted'|'rejected'|'backlog'; providerReference:string|null; retryable:boolean; status:number|null; stage:DeliveryStage};
export function deliverEvidence(input:{destination:DestinationName;endpoint?:string;credential:EvidenceCredential;target:string;workspace?:string|number|null;packageValue:object;coveredFrom:string;coveredTo:string;fetcher?:typeof fetch;resume?:DeliveryStage;beforeMutation?:(stage:DeliveryStage)=>Promise<unknown>;checkpoint?:(stage:DeliveryStage)=>Promise<unknown>}):Promise<DeliveryOutcome>;

export function inspectVantaUpload(input:{endpoint:string;credential:EvidenceCredential;target:string;uploadReference:string;fetcher?:typeof fetch;beforeRead?:()=>Promise<unknown>;pagination?:{cursor?:string|null;pages?:number;seenCursors?:string[]};checkpoint?:(page:{cursor:string|null;nextCursor:string|null;page:number})=>Promise<unknown>}):Promise<{presence:string;status:number|null;pages:number;providerReference?:string;observedAt?:number;provesSubmit?:boolean;retryAfterSeconds?:number}>;
