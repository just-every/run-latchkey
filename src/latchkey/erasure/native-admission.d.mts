import type { Bindings } from '../../auth.server';
import type { OperatorAuth } from '../../modules/operator-auth/index.mjs';
export function nativeErasureResponse(request:Request,env:Bindings,auth:OperatorAuth):Promise<Response|null>;
