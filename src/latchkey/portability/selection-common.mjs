import { canonicalJson } from '@runeditrun/rer/modules/portability';
export const exportPolicyText=statement=>canonicalJson(['latchkey-export-policy-v1',statement]);
export const selectionApprovalText=statement=>canonicalJson(['latchkey-selection-approval-v1',statement]);
export const selectionRoutes=Object.freeze({policy:['selection','policy'].join('/'),setPolicy:['selection','policy-set'].join('/'),authorize:['selection','authorize'].join('/'),release:['selection','release'].join('/'),import:['selection','import'].join('/')});
