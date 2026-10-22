import { SubjectErasureError, subjectReplayKnown } from './subject-common.mjs';
// Installations with no erased subjects need no erasure key. Once a fence
// exists, absence of the separately held key refuses the operation.
export async function subjectAdmission(ctx, checks) {
 if(!await ctx.db.prepare('SELECT 1 AS present FROM lky_subject_fences WHERE tenant=? LIMIT 1').bind(ctx.tenant).first())return;
 for(const [kind,value] of checks)if(value!=null&&await subjectReplayKnown(ctx,kind,value))throw new SubjectErasureError('erased_identity',409);
}
