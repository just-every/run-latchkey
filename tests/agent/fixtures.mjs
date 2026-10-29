import {state} from './state.mjs';
export default async function prepare() {
 return {values:{vault:state.vault,item:state.item,recipient:state.recipient.profile.account,expiresAt:Date.now()+1800000}};
}
