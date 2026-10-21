// The run site (run-latchkey.com) `rer build --site` writes: the homepage with
// its Run action, /run, the docs from docs/*.md, /contract from CONTRACT.md and
// the not-found page. Every Run page string and command is in run.json; nothing
// here reads installation data.
import './styles/index.css'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { sitePage } from './base-pages'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { siteDocument } from './document'
import { Landing } from './landing/Landing'
import { LEADERS_SCRIPT } from './landing/leaders'
import run from './run.json'

// Code records get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"

const HOME_TITLE = 'Latchkey — The password manager that changes passwords'
const HOME_DESCRIPTION = 'Company logins, passkeys and API keys, end-to-end encrypted and filled on every device. When one leaks or someone leaves, Latchkey changes it everywhere it’s used and checks the new one works.'

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const data: RunData = run
  const docs = (slug?: string) => { const { title, description } = docsHead(slug); return { title, description, styles } }
  return {
    pages: [
      { path: '/', html: siteDocument({ title: HOME_TITLE, description: HOME_DESCRIPTION, styles, body: <Landing />, script: LEADERS_SCRIPT }) },
      { path: '/run', html: sitePage(runPageHtml(identity, data, contract), 'run', 'tangerine', styles) },
      ...(contract ? [{ path: '/contract', html: sitePage(contractPageHtml(identity, data, contract), 'contract', 'black', styles) }] : []),
      { path: '/docs', html: siteDocument({ ...docs(), body: <DocsIndex /> }) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: siteDocument({ ...docs(page.slug), body: <DocsArticle slug={page.slug} />, script: COPY }) })),
      { path: '/404', html: sitePage(siteNotFoundHtml(identity, data, contract), 'not-found', 'tangerine', styles) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site'],
  }
}
