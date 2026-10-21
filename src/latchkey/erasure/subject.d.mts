import type { Bindings } from '../../auth.server';
import type { Session } from '../../modules/operator-auth/index.mjs';
export class SubjectErasureError extends Error {code:string;status:number;constructor(code:string,status?:number)}
export interface SubjectContext {db:D1Database;env:Bindings & {LATCHKEY_ERASURE_SECRET?:string};now:number;actor:string;device:string;tenant:string;session:Session;fence:string;fenceArgs:(string|number)[]}
export function subjectErasureAuthenticated(route:string,input:Record<string,any>,ctx:SubjectContext):Promise<any|null>;
export function subjectReplayKnown(ctx:Pick<SubjectContext,'db'|'env'|'tenant'>,kind:string,value:unknown):Promise<boolean>;
export function subjectItemReplayKnown(ctx:Pick<SubjectContext,'db'|'env'|'tenant'>,vault:string,object:string):Promise<boolean>;
export function subjectVaultWriteAllowed(ctx:Pick<SubjectContext,'db'|'tenant'>,vault:string):Promise<true>;
export function subjectRotationStatements(ctx:Pick<SubjectContext,'db'|'tenant'>,vault:string,newEpoch:number):D1PreparedStatement[];
export function verifySubjectAudit(ctx:SubjectContext,operation:string,checkpoint?:{root:string;length:number;signature:string}):Promise<any>;
