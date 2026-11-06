import { access, exact, guarded, need, uuid } from '../lifecycle/common.mjs';
import { id, validateEnvelope, verifyWrapped } from '../crypto/envelope.mjs';
import { quorumBinding, enrollmentStatement, caseStatement } from './quorum-context.mjs';
const ownerSql="SELECT a.id,a.tenant,a.generation,a.recipient_key,a.authority_key,o.version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active' AND o.role='owner'";
const snapshot=row=>({account:row.id,generation:row.generation,version:row.version,recipientKey:row.recipient_key,authorityKey:row.authority_key});
async function owner(ctx,account){const row=await access(ctx).first(ownerSql,uuid(account),ctx.tenant);need(row,'quorum_owner_required',403);return snapshot(row)}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function authority(ctx,custodians){need(custodians.length===2&&custodians[0].account!==custodians[1].account,'two_distinct_custodians_required',403);for(const c of custodians)need(same(c,await owner(ctx,c.account)),'quorum_authority_changed',409)}
function authorityGuards(ctx,custodians){return custodians.map(c=>access(ctx).guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND a.recipient_key=? AND a.authority_key=? AND o.version=? AND o.status='active' AND o.role='owner')",[c.account,ctx.tenant,c.generation,c.recipientKey,c.authorityKey,c.version]))}
const policyGuard=(ctx,p)=>access(ctx).guard('EXISTS(SELECT 1 FROM lky_quorum_policies WHERE account=? AND generation=? AND revision=? AND change_id=?)',[p.account,p.generation,p.revision,p.change_id]);
export async function quorumPolicy(ctx,account){const p=await access(ctx).first('SELECT * FROM lky_quorum_policies WHERE account=? AND tenant=?',account,ctx.tenant);need(p&&p.generation===ctx.generation,'quorum_policy_unavailable',403);const custodians=JSON.parse(p.custodians);need(custodians.every(c=>c.account!==account),'quorum_self_approval_forbidden',403);await authority(ctx,custodians);return p}
export async function quorumEnrollment(ctx,enrollment){const row=await access(ctx).first('SELECT * FROM lky_quorum_enrollments WHERE id=? AND account=? AND generation=? AND revoked_at IS NULL',enrollment,ctx.actor,ctx.generation);if(!row)return null;const p=await quorumPolicy(ctx,ctx.actor);need(p.revision===row.revision&&p.change_id===row.policy_id,'quorum_policy_changed',409);return {...row,kind:'quorum',policy:p}}
export async function quorumCase(ctx,operation,enrolled){
 const {first,all}=access(ctx),entry=await first('SELECT statement FROM lky_quorum_cases WHERE id=?',operation.id);need(entry,'quorum_case_unavailable',403);
 const statement=caseStatement(enrollmentStatement(enrolled.id,enrolled.policy),operation.id,operation.transfer_key,operation.expires_at);need(entry.statement===JSON.stringify(statement),'quorum_case_changed',409);
 const approvals=await all('SELECT custodian,wrapped FROM lky_quorum_approvals WHERE case_id=? ORDER BY custodian',operation.id);
 const guards=[access(ctx).guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND o.status='active')",[operation.account,operation.generation]),policyGuard(ctx,enrolled.policy),...authorityGuards(ctx,statement.custodians),access(ctx).guard('EXISTS(SELECT 1 FROM lky_quorum_enrollments WHERE id=? AND revoked_at IS NULL AND generation=? AND revision=?)',[enrolled.id,ctx.generation,enrolled.revision])];
 return {statement,approvals,guards};
}
export async function quorumStart(ctx,enrolled,operation,transferKey,expiresAt){const statement=caseStatement(enrollmentStatement(enrolled.id,enrolled.policy),operation,transferKey,expiresAt);return {statement,statements:[access(ctx).stmt('INSERT INTO lky_quorum_cases VALUES(?,?)',operation,JSON.stringify(statement))],guards:[policyGuard(ctx,enrolled.policy),...authorityGuards(ctx,statement.custodians)]}}
export async function quorumAuthenticated(action,input,ctx,account,notice){
 if(!action.startsWith('quorum-'))return null;
 const {first,all,stmt,guard,event}=access(ctx);
 // Only a signed, current member device can reach this handler. Agent and runtime
 // grants never route here; human intent still requires exact ceremony text.
 if(action==='quorum-policy'){exact(input,[]);return {policy:await first('SELECT * FROM lky_quorum_policies WHERE account=?',ctx.actor)}}
 if(action==='quorum-propose'){
  exact(input,['custodians','confirmed']);need(input.confirmed===true,'recovery_confirmation_required',403);need(Array.isArray(input.custodians)&&[0,2].includes(input.custodians.length),'two_distinct_custodians_required');
  const custodians=await Promise.all(input.custodians.map(c=>owner(ctx,c)));if(custodians.length)await authority(ctx,custodians);need(custodians.every(c=>c.account!==ctx.actor),'quorum_self_approval_forbidden',403);
  const prior=await first('SELECT revision FROM lky_quorum_policies WHERE account=?',ctx.actor),change=id();
  await guarded(ctx,[],[stmt('INSERT INTO lky_quorum_changes VALUES(?,?,?,?,?,?,?,NULL)',change,ctx.actor,ctx.tenant,ctx.generation,prior?.revision??0,JSON.stringify(custodians),ctx.now+86400000),event('quorum_change_requested',change)],authorityGuards(ctx,custodians));return {change};
 }
 if(action==='quorum-change-review'||action==='quorum-change-approve'){
  const change=await first('SELECT * FROM lky_quorum_changes WHERE id=? AND tenant=? AND expires_at>? AND consumed_at IS NULL',uuid(input.change),ctx.tenant,ctx.now);need(change,'quorum_change_unavailable',409);need(change.account!==ctx.actor,'quorum_self_approval_forbidden',403);
  const approver=await owner(ctx,ctx.actor),member=await first("SELECT a.generation FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND o.status='active'",change.account);need(member?.generation===change.generation,'quorum_authority_changed',409);
  const custodians=JSON.parse(change.custodians);if(custodians.length)await authority(ctx,custodians);
  const prior=await first('SELECT revision FROM lky_quorum_policies WHERE account=?',change.account);need((prior?.revision??0)===change.base_revision,'quorum_policy_changed',409);
  if(action==='quorum-change-review'){exact(input,['change']);return {...change,custodians,votes:(await all('SELECT approver FROM lky_quorum_votes WHERE change_id=?',change.id)).map(r=>r.approver)}}
  exact(input,['change','exactChange','confirmed']);need(input.confirmed===true&&input.exactChange===change.id,'exact_human_approval_required',403);
  const votes=await all('SELECT * FROM lky_quorum_votes WHERE change_id=?',change.id);need(!votes.some(v=>v.approver===ctx.actor),'duplicate_quorum_approval',409);const voters=[...votes.map(v=>JSON.parse(v.authority)),approver];await authorityForVoters(ctx,voters);
  const guards=[...authorityGuards(ctx,[...custodians,...voters]),guard('EXISTS(SELECT 1 FROM lky_quorum_changes WHERE id=? AND consumed_at IS NULL AND expires_at>?)',[change.id,ctx.now]),guard('COALESCE((SELECT revision FROM lky_quorum_policies WHERE account=?),0)=?',[change.account,change.base_revision]),guard('EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND o.status=\'active\')',[change.account,change.generation]),guard('(SELECT COUNT(*) FROM lky_quorum_votes WHERE change_id=?)=?',[change.id,votes.length])];
  const writes=[stmt('INSERT INTO lky_quorum_votes VALUES(?,?,?)',change.id,ctx.actor,JSON.stringify(approver)),event('quorum_change_approved',change.id)];
  if(voters.length===2)writes.push(stmt('INSERT INTO lky_quorum_policies VALUES(?,?,?,?,?,?) ON CONFLICT(account) DO UPDATE SET generation=excluded.generation,revision=excluded.revision,change_id=excluded.change_id,custodians=excluded.custodians',change.account,ctx.tenant,change.generation,change.base_revision+1,change.id,change.custodians),stmt('UPDATE lky_quorum_changes SET consumed_at=? WHERE id=?',ctx.now,change.id),stmt('UPDATE lky_quorum_enrollments SET revoked_at=? WHERE account=?',ctx.now,change.account),event('quorum_policy_changed',change.id));
  await guarded(ctx,[],writes,guards);return {approved:true,active:voters.length===2};
 }
 if(action==='quorum-enroll'){
  exact(input,['enrollment','statement','payload','shares','confirmed']);need(input.confirmed===true,'recovery_confirmation_required',403);const policy=await quorumPolicy(ctx,ctx.actor),enrollment=uuid(input.enrollment),statement=enrollmentStatement(enrollment,policy);need(same(input.statement,statement),'quorum_policy_changed',409);
  need(!await first("SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.kind='family'",ctx.actor),'independent_family_account_required',403);
  validateEnvelope(input.payload,await quorumBinding(statement,'quorum-payload'));need(Array.isArray(input.shares)&&input.shares.length===2,'quorum_shares_required',403);
  for(let i=0;i<2;i++)need(await verifyWrapped(input.shares[i],account.authority_key,ctx.actor,await quorumBinding(statement,'quorum-share',statement.custodians[i])),'invalid_key_signature',403);
  await notice(ctx,account.operator_id,'two-person recovery enrollment');
  await guarded(ctx,[],[stmt('UPDATE lky_quorum_enrollments SET revoked_at=? WHERE account=?',ctx.now,ctx.actor),stmt('INSERT INTO lky_quorum_enrollments VALUES(?,?,?,?,?,?,?,?,NULL)',enrollment,ctx.actor,ctx.tenant,ctx.generation,policy.revision,policy.change_id,JSON.stringify(input.payload),JSON.stringify(input.shares)),event('quorum_enrolled',enrollment)],[policyGuard(ctx,policy),...authorityGuards(ctx,statement.custodians),guard("NOT EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.kind='family')",[ctx.actor])]);return {enrollment};
 }
 if(action==='quorum-review'||action==='quorum-approve'){
  const operation=await first('SELECT c.* FROM lky_recovery_cases c JOIN lky_accounts a ON a.id=c.account JOIN oa_operators o ON o.id=a.operator_id WHERE c.id=? AND a.tenant=? AND c.generation=a.generation AND o.status=\'active\' AND c.expires_at>? AND c.consumed_at IS NULL',uuid(input.operation),ctx.tenant,ctx.now);need(operation,'quorum_case_unavailable',409);need(operation.account!==ctx.actor,'quorum_self_approval_forbidden',403);
  const memberCtx={...ctx,actor:operation.account,generation:operation.generation},enrolled=await quorumEnrollment(memberCtx,operation.enrollment);need(enrolled,'quorum_enrollment_unavailable',403);const state=await quorumCase(memberCtx,operation,enrolled),index=state.statement.custodians.findIndex(c=>c.account===ctx.actor);need(index>=0,'named_quorum_custodian_required',403);
  const member=await first('SELECT authority_key FROM lky_accounts WHERE id=?',operation.account);
  if(action==='quorum-review'){exact(input,['operation']);return {statement:state.statement,share:JSON.parse(enrolled.shares)[index],authorityKey:member.authority_key,custodian:state.statement.custodians[index]}}
  exact(input,['operation','exactCase','confirmed','identityChecked','wrapped']);need(input.exactCase===operation.id&&input.confirmed===true&&input.identityChecked===true,'exact_human_approval_required',403);need(!state.approvals.some(a=>a.custodian===ctx.actor),'duplicate_quorum_approval',409);
  need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,await quorumBinding(state.statement,'quorum-release',state.statement.custodians[index])),'invalid_key_signature',403);
  await guarded(ctx,[],[stmt('INSERT INTO lky_quorum_approvals VALUES(?,?,?)',operation.id,ctx.actor,JSON.stringify(input.wrapped)),event('quorum_share_released',operation.id)],[...state.guards,guard('EXISTS(SELECT 1 FROM lky_recovery_cases WHERE id=? AND generation=? AND consumed_at IS NULL AND expires_at>?)',[operation.id,operation.generation,ctx.now])]);return {approved:true};
 }
 need(false,'not_found',404);
}
async function authorityForVoters(ctx,voters){for(const voter of voters)need(same(voter,await owner(ctx,voter.account)),'quorum_authority_changed',409)}
