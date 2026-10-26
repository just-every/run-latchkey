// Shared names for the authenticated evidence protocol.
export const evidenceRoutes = Object.freeze({
 credentialGet: ['evidence','credential','get'].join('/'),
 credentialSave: ['evidence','credential','save'].join('/'),
 credentialForget: ['evidence','credential','forget'].join('/'),
 delivery: ['evidence', 'delivery'].join('/'),
 begin: ['evidence', 'begin'].join('/'),
 result: ['evidence', 'result'].join('/'),
 startAttempt: ['evidence', 'attempt', 'start'].join('/'),
 checkpointAttempt: ['evidence', 'attempt', 'checkpoint'].join('/'),
 startInspection: ['evidence', 'inspection', 'start'].join('/'),
 checkpointInspection: ['evidence', 'inspection', 'checkpoint'].join('/'),
 finishInspection: ['evidence', 'inspection', 'finish'].join('/'),
 inspectAttempt: ['evidence', 'attempt', 'inspect'].join('/'),
});

export const evidenceCredentialContext=(tenant,destination,revision,version)=>({tenant,vault:'evidence-credentials',object:destination,purpose:'provider-credential',epoch:revision,version});
