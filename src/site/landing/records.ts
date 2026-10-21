// The homepage follows one unnamed US company of 214 people through two weeks of
// October 2026 (design desk story, 21 Oct 2026). Every time, count and name the
// screens show comes from these records, so the hero's annotations, the leak's
// log and the dead key agree to the second. Times are Eastern; the page omits
// the zone. Keys are truncated, passwords appear only as bullets and no .env
// value appears anywhere.

/** The minute of a records time: '2:11:20' reads '2:11'. */
export const minute = (time: string) => time.split(':').slice(0, 2).join(':')

export const company = { day: 'Mon Oct 19', items: '1,412', people: '214', machines: '61' }

// Thu Oct 22: an AWS key is pasted in chat, replaced on all three machines that
// use it (one update refused once and retried), proved by a deploy, then revoked.
export const leak = {
  day: 'Thu Oct 22',
  key: 'AKIA…7QXE',
  keyStart: 'AKIA…',
  keyEnd: '7QXE',
  posted: '2:07',
  where: 'Nook #deploys',
  replaced: '2:09',
  machines: ['GitHub Actions', 'Kubernetes', 'Cloudflare Worker'],
  allReplacedBy: '2:10',
  refused: '2:09:31',
  retryAfter: '40 s',
  retried: '2:10:12',
  deployed: '2:11:20',
  revoked: '2:12:04',
  awsRefused: '2:12:30',
}

// Fri Oct 23: Ellie Hart (Marketing) leaves; every shared login she could use
// is changed and signed in with the new password.
export const leaver = { person: 'Ellie Hart', day: 'Fri Oct 23', left: '4:30', first: '4:33', last: '5:41', logins: 17 }

// The Finance vault's bank login, fill only for four people: 6 + 21 + 9 + 4 fills.
export const bankLogin = { title: 'Chase business portal', people: 4, fills: [6, 21, 9, 4], month: 'October', reveals: 0 }
export const bankFills = bankLogin.fills.reduce((sum, fills) => sum + fills, 0)

// Wed Oct 28: Dana Reyes's agent fills her Grainger cart on a one-time grant.
export const agent = { person: 'Dana', day: 'Wed Oct 28', time: '10:14 am', site: 'grainger.com', disclosures: 0 }

// Tue Oct 13: secrets found in code and moved out of .env by pull request.
export const secretsOut = { secrets: 46, repositories: 9, pullRequest: '#2118', repository: 'web-app', merged: 'Tue Oct 13', removed: 5, file: '.env.production', start: 'latchkey run -- node server.js' }

// Fri Oct 16: the move from 1Password, reconciled item for item before the old accounts closed.
export const move = { items: '1,066', closed: 'Fri Oct 16' }
