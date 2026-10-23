import { FleetClient,createProviderIdentity } from '../../src/latchkey/msp/client.mjs';
export async function mspCommand(command,input,{readPrivate,writePrivate}){
 if(command==='msp-identity'){
  const identity=await createProviderIdentity(input.consoleOrigin);await writePrivate(input.output,identity);return{written:true,provider:identity.provider};
 }
 const identity=await readPrivate(input.identity),delegation=await readPrivate(input.delegation),client=new FleetClient(identity,{consoleOrigin:input.consoleOrigin});
 const result=await client.call(delegation,input.action,input.input??{});await writePrivate(input.output,result);return{written:true};
}
