import { ApiError } from './catalogue.mjs';

// Public Base administration remains responsible for policy, step-up, last-owner
// protection, role validation, current-version CAS and session invalidation.
export async function usersAuthenticated(route,input,ctx){
 if(!route.startsWith('api/users/'))return null;
 if(!ctx.auth||!ctx.request)throw new ApiError('operator_auth_context_required',503);
 try{
  const fields={'api/users/list':[],'api/users/get':['operator'],'api/users/invite':['email','displayName','role','returnTo'],'api/users/role':['operator','role'],'api/users/status':['operator','status'],'api/users/cancel-invitation':['operator']}[route];
  if(!fields||Object.keys(input).sort().join()!==[...fields].sort().join())throw new ApiError('invalid_fields');
  if(!await ctx.db.prepare(`SELECT 1 AS allowed WHERE ${ctx.fence}`).bind(...ctx.fenceArgs).first())throw new ApiError('authority_changed',409);
  if(route==='api/users/list')return await ctx.auth.listOperators(ctx.request);
  if(route==='api/users/get'){
   const operators=await ctx.auth.listOperators(ctx.request),row=operators.find(value=>value.id===input.operator);
   if(!row)throw new ApiError('operator_not_found',404);return row;
  }
  // This method conversion happens only AFTER the service has validated the
  // original signed REST bytes. Base requires POST for its public admin methods.
  const request=new Request(ctx.request.url,{method:'POST',headers:ctx.request.headers});
  if(route==='api/users/invite')return await ctx.auth.invite(request,input);
  if(route==='api/users/role')return await ctx.auth.setRole(request,input.operator,input.role);
  if(route==='api/users/status')return await ctx.auth.setOperatorStatus(request,input.operator,input.status);
  if(route==='api/users/cancel-invitation')return await ctx.auth.cancelInvitation(request,input.operator);
  throw new ApiError('api_route_not_found',404);
 }catch(error){
  if(error instanceof ApiError)throw error;
  throw new ApiError(typeof error?.code==='string'&&/^[a-z_]{1,64}$/.test(error.code)?error.code:'operator_request_refused',Number.isInteger(error?.status)?error.status:400);
 }
}
