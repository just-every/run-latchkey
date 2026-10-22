import {id,sign} from '../crypto/envelope.mjs';
import {policyText,trashText} from '../crypto/lifecycle.mjs';
export class LifecycleClient {
 constructor(client){this.client=client}
 list(vault){return this.client.call('lifecycle/list',{vault})}
 async change(vault,object,state,{confirmed=false}={}){
  if(!confirmed)throw Object.assign(Error('lifecycle_confirmation_required'),{code:'lifecycle_confirmation_required'});
  let context=await this.client.call('lifecycle/context',{vault,object});
  if(state==='trash'&&!context.vault.policy&&context.vault.owner===this.client.profile.account){
   const statement={schema:1,purpose:'trash-retention',tenant:this.client.profile.tenant,vault,owner:this.client.profile.account,days:30};
   await this.client.call('lifecycle/policy/set',{vault,policy:{statement,signature:await sign(this.client.bundle.root.authority.privateKey,policyText(statement))}});
   context=await this.client.call('lifecycle/context',{vault,object});
  }
  let proof=null;
  if(state==='trash'){
   const now=Date.now(),statement={schema:1,purpose:'trash-item',tenant:this.client.profile.tenant,vault,object,owner:context.vault.owner,actor:this.client.profile.account,epoch:context.vault.epoch,version:context.item.version,revision:context.vault.revision,nonce:id(),trashedAt:now,expiresAt:now+30*86400000};
   proof={policy:context.vault.policy,authorization:context.vault.owner===this.client.profile.account?null:context.authorization,statement,signature:await sign(this.client.bundle.root.authority.privateKey,trashText(statement))};
  }
  return this.client.call('lifecycle/change',{vault,object,state,revision:context.vault.revision,stateVersion:context.item.stateVersion,proof,confirmed:true});
 }
}
