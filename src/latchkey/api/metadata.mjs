import { projectsAuthenticated } from '../projects/service.mjs';
import { management } from '../sharing/management.mjs';
import { generatorAuthenticated } from '../generator/service.mjs';
import { ApiError } from './catalogue.mjs';
import {usersAuthenticated} from './users.mjs';
export async function rateApi(ctx){
 const row=await ctx.db.prepare('INSERT INTO lky_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind('api:'+ctx.tenant+':'+ctx.actor,Math.floor(ctx.now/60000)).first();
 if(!row||row.count>120)throw new ApiError('rate_limited',429);
}
export async function apiAuthenticated(route,input,ctx){
 if(!route.startsWith('api/'))return null;
 const users=await usersAuthenticated(route,input,ctx);if(users!==null)return users;
 const refuse=(condition,code='invalid_fields',status=400)=>{if(!condition)throw new ApiError(code,status);};
 if(route==='api/groups'){
  refuse(Object.keys(input).length===0);refuse(['owner','admin'].includes(ctx.session?.operator?.role),'permission_denied',403);
  return(await ctx.db.prepare(`SELECT id,created_by FROM lky_share_groups WHERE tenant=? AND ${ctx.fence} ORDER BY id`).bind(ctx.tenant,...ctx.fenceArgs).all()).results;
 }
 if(route==='api/policies'){
  refuse(Object.keys(input).length===0);
  return{sharing:await management('sharing/policy',{},ctx),generator:await generatorAuthenticated('generator/policy',{},ctx)};
 }
 if(route==='api/project'){
  refuse(Object.keys(input).join()==='project');
  const values=await projectsAuthenticated('project/list',{},ctx),row=values.projects.find(value=>value.id===input.project);
  refuse(row,'not_found',404);return row;
 }
 throw new ApiError('api_route_not_found',404);
}
