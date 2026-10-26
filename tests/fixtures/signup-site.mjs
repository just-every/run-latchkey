// A small real website with a signup form, an emailed verification code and a sign-in form.
// Its verification mail goes out through the shared mail module's SendGrid adapter; the SendGrid
// network edge hands each message to the forwarding provider, like the internet would.
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createMailSender } from '../../src/modules/mail/index.mjs';
const page = body => `<!doctype html><meta charset="utf-8"><title>Fabrikam Marketplace</title><main>${body}</main>`;
const form = (action, fields, label) => `<form method="post" action="${action}">${fields.map(([name, text, type = 'text']) => `<label>${text}<input name="${name}" type="${type}" autocomplete="off" required></label>`).join('')}<button>${label}</button></form>`;
export async function signupSite({ forward }) {
 const accounts = new Map(), sent = [];
 const sendgrid = async (url, init) => {
  assert.equal(url, 'https://api.sendgrid.com/v3/mail/send'); assert.equal(init.headers.authorization, 'Bearer synthetic-latchkey-2061');
  const body = JSON.parse(init.body), to = body.personalizations[0].to[0].email, text = body.content.find(row => row.type === 'text/plain').value;
  sent.push({ to, text, result: forward(to, { subject: body.subject, text }) });
  return new Response(null, { status: 202, headers: { 'x-message-id': `synthetic-latchkey-${2062 + sent.length}` } });
 };
 const mail = createMailSender({ provider: 'sendgrid', mode: 'production', apiKey: 'synthetic-latchkey-2061' }, { fetch: sendgrid });
 const send = (email, code) => mail.send({ deliveryId: `signup-${email}-${code}`, from: 'Fabrikam <hello@fabrikam.test>', to: [email], subject: 'Confirm your Fabrikam account', text: `Your Fabrikam verification code is ${code}.` });
 const server = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const input = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())), reply = (status, html) => { response.writeHead(status, { 'content-type': 'text/html' }); response.end(page(html)); };
  if (request.method === 'GET' && request.url === '/signup') return reply(200, `<h1>Create your account</h1>${form('/signup', [['email', 'Email'], ['password', 'Password', 'password']], 'Sign up')}`);
  if (request.method === 'POST' && request.url === '/signup') { const code = String(100000 + accounts.size * 7919 + 4321).slice(0, 6); accounts.set(input.email, { password: input.password, code, verified: false }); await send(input.email, code); return reply(200, `<h1>Check your email</h1><p>We sent a code to ${input.email}.</p>${form('/verify', [['email', 'Email'], ['code', 'Verification code']], 'Verify')}`); }
  if (request.method === 'POST' && request.url === '/verify') { const account = accounts.get(input.email); if (account?.code === input.code) { account.verified = true; return reply(200, '<h1>Email verified</h1><p>Now sign in.</p>' + form('/login', [['email', 'Email'], ['password', 'Password', 'password']], 'Sign in')); } return reply(400, '<h1>That code is not right</h1>'); }
  if (request.method === 'POST' && request.url === '/login') { const account = accounts.get(input.email); return account?.verified && account.password === input.password ? reply(200, '<h1>Welcome back</h1>') : reply(401, '<h1>Sign in failed</h1>'); }
  if (request.method === 'POST' && request.url === '/resend') { const account = accounts.get(input.email); await send(input.email, account.code); return reply(200, '<h1>Sent again</h1>'); }
  return reply(404, '<h1>Not found</h1>');
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 return { origin, accounts, sent, resend: email => fetch(origin + '/resend', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email }) }), close: () => new Promise(resolve => server.close(resolve)) };
}
