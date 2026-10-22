import {spawn} from 'node:child_process';
import {resolveRuntime} from '../../src/latchkey/runtime/client.mjs';
export async function runConsumer(input,args){
 if(args[0]==='--')args=args.slice(1);
 if(!args.length||args.some(arg=>typeof arg!=='string'||arg.includes('\0')))throw Error('consumer_command_required');
 const values=await resolveRuntime(input);
 if(Object.keys(values).some(name=>! /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))throw Error('invalid_environment_name');
 const child=spawn(args[0],args.slice(1),{shell:false,stdio:'inherit',env:{...process.env,...values}});
 for(const name of Object.keys(values))delete values[name];
 return new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('consumer_start_failed')));child.once('exit',(code,signal)=>resolve({exitCode:code??1,signal:signal??null}))});
}
