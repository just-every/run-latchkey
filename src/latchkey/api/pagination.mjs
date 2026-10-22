import {ApiError} from './catalogue.mjs';
const key=(row,idKey)=>idKey==='versionKey'?`${row.object_id}:${String(row.version).padStart(12,'0')}`:String(row[idKey]);
export function paginate(rows,{limit=50,cursor=null,idKey='id'},scope){
 if(!Array.isArray(rows))throw new ApiError('invalid_collection_response',502);
 const sorted=[...rows].sort((a,b)=>key(a,idKey)<key(b,idKey)?-1:key(a,idKey)>key(b,idKey)?1:0);
 let last='',upper=sorted.length?key(sorted.at(-1),idKey):'';
 if(cursor){
  try{const parsed=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));if(parsed.scope!==scope||typeof parsed.last!=='string'||typeof parsed.upper!=='string'||parsed.last>parsed.upper)throw Error();last=parsed.last;upper=parsed.upper;}catch{throw new ApiError('invalid_cursor');}
 }
 const available=sorted.filter(row=>key(row,idKey)>last&&key(row,idKey)<=upper),data=available.slice(0,limit);
 const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 return {data,nextCursor:available.length>limit?encode({scope,last:key(data.at(-1),idKey),upper}):null};
}
export function pageResult(value,pagination,scope){
 if(!pagination)return value;
 const rows=pagination.listKey?value[pagination.listKey]:value;
 const page=paginate(rows,pagination,scope);
 if(!pagination.listKey)return page;
 const context={...value};delete context[pagination.listKey];
 return {...page,context};
}
