import {canonicalJson} from '../reviews/common.mjs';
import {verify} from '../crypto/envelope.mjs';
export const disclosureText=value=>canonicalJson(['latchkey/approved-evidence/v1',value.schema,value.destination,value.package,value.signer,value.authorityKey]);
export const verifyDisclosure=(value,pinnedAuthority)=>value?.schema==='latchkey/signed-evidence/v1'&&value.authorityKey===pinnedAuthority&&verify(pinnedAuthority,value.signature,disclosureText(value));
