// The run site (run-latchkey.com) as `rer build --site` writes it: a visitor reaches /run from the homepage's Run
// action, every docs page listed in docs/site.json is published, every same-site link and file a page names resolves,
// no page links an instance-only route, and no page outside the docs carries a local dev address or rer dev output.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../..', import.meta.url).pathname
const site = join(root, 'dist/site')
const pages = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])
const served = path => [path, `${path}.html`, join(path, 'index.html')].some(candidate => existsSync(join(site, candidate)) && !candidate.endsWith('/'))
const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map(match => match[1].replaceAll('&amp;', '&'))
const anchors = html => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, inner]) => ({ href, label: inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))

test('the run site builds, its Run action opens /run, the docs are published and every link and file resolves', () => {
  // Inside CI's verify the job queue is already held, so the nested build skips it (rer allows that only under CI).
  execFileSync(join(root, 'node_modules/.bin/rer'), ['build', '--site', ...(process.env.CI === 'true' ? ['--no-queue'] : [])], { cwd: root, stdio: 'pipe' })
  const home = readFileSync(join(site, 'index.html'), 'utf8')
  const runs = anchors(home).filter(link => /^Run Latchkey\b/.test(link.label))
  assert.ok(runs.length, 'the homepage has a Run Latchkey action')
  for (const link of runs) assert.equal(link.href, '/run', 'every Run Latchkey action opens /run')
  for (const path of ['run', 'contract', 'docs', '404']) assert.ok(served(path), `/${path} is built`)
  const manifest = JSON.parse(readFileSync(join(root, 'docs/site.json'), 'utf8'))
  for (const page of manifest.sections.flatMap(section => section.pages)) assert.ok(served(`docs/${page.slug}`), `/docs/${page.slug} is built`)
  for (const file of pages(site)) {
    const html = readFileSync(file, 'utf8'), where = relative(site, file)
    const refs = [...attrs(html, 'href'), ...attrs(html, 'src'), ...attrs(html, 'srcset').flatMap(set => set.split(',').map(part => part.trim().split(/\s+/)[0]))]
    for (const ref of refs.filter(ref => ref.startsWith('/') && !ref.startsWith('//'))) {
      const path = decodeURIComponent(ref.split(/[?#]/)[0])
      assert.doesNotMatch(path, /^\/(signin|login|sign-in|setup|app|auth|api|health)(\/|$)/, `${where} links the instance-only ${path}`)
      if (path !== '/') assert.ok(served(path), `${where} names ${path}, which the site does not serve`)
    }
    if (!where.startsWith('docs')) assert.doesNotMatch(html, /\b(?:127\.0\.0\.1|localhost):\d{2,5}\b|\bRER_(?:OPEN|READY|SIGNED_IN|SITE)\b/, `${where} carries a local dev address or rer dev output`)
  }
})
