import { canonicalJson } from '@runeditrun/rer/modules/portability';
export const exportPolicyText=statement=>canonicalJson(['latchkey-export-policy-v1',statement]);
export const selectionApprovalText=statement=>canonicalJson(['latchkey-selection-approval-v1',statement]);
export const selectionRoutes=Object.freeze({policy:['selection','policy'].join('/'),setPolicy:['selection','policy-set'].join('/'),authorize:['selection','authorize'].join('/'),release:['selection','release'].join('/'),import:['selection','import'].join('/'),outcome:['selection','outcome'].join('/')});

export const selectionOutcomes=Object.freeze(['private_file_written','private_file_write_failed','browser_download_initiated','browser_download_failed','release_response_unverified','release_cancelled']);
