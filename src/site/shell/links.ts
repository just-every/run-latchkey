import run from '../run.json'

// The run site's own pages and the source repository: the header, the footer
// and the docs read these, and the homepage's actions point at them.
export const paths = { home: '/', run: '/run', docs: '/docs', contract: '/contract' }
export const repository = run.repository

/** The three links every page carries, in order: Docs, Contract, Source. */
export const siteLinks = [
  { key: 'docs', label: 'Docs', href: paths.docs },
  { key: 'contract', label: 'Contract', href: paths.contract },
  { key: 'source', label: 'Source', href: repository },
] as const

export type SiteLinkKey = (typeof siteLinks)[number]['key']

// There is no hosted Latchkey demo yet (demo.run-latchkey.com does not resolve),
// so "Try the demo" opens the Run page, where Latchkey starts on your computer.
export const demoHref = paths.run
