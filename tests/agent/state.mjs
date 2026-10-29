// Only disposable verifier clients live here. Never imported by the Worker.
export const state = {};
export function cookie(response) { return response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; '); }
