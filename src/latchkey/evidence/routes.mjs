// Shared names for the authenticated evidence protocol.
export const evidenceRoutes = Object.freeze({
 delivery: ['evidence', 'delivery'].join('/'),
 begin: ['evidence', 'begin'].join('/'),
 result: ['evidence', 'result'].join('/'),
 startAttempt: ['evidence', 'attempt', 'start'].join('/'),
 checkpointAttempt: ['evidence', 'attempt', 'checkpoint'].join('/'),
 inspectAttempt: ['evidence', 'attempt', 'inspect'].join('/'),
});
