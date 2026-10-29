import assert from 'node:assert/strict';
import {AutomationClient} from '../../src/latchkey/automation/client.mjs';
import {state} from './state.mjs';
export async function afterStep({step,result}) {
 if(step.id!=='request')return;
 const row=await new AutomationClient(state.owner).preview(result.request);
 assert.equal(row.phase,'pending'); assert.ok(row.preparedBy.includes(' for '));
 assert.equal(row.objects.length,1); assert.equal(row.objects[0].object,state.item);
 assert.equal(row.account,state.recipient.profile.account);
 assert.equal((await state.recipient.call('sharing/received',{})).length,0);
}
export default async function journey() {}
