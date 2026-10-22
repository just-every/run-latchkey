import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { repository } from '../../shell/links.ts'
import type { DocsBody, DocsSection } from '../types.ts'
import { docsDirectory, manifestPath, readManifest } from './manifest.ts'
import { renderMarkdown } from './render.ts'

// The whole docs site from the tree as it is: every page in docs/site.json rendered, every link to another docs page and
// every anchor checked, and nothing that names a build machine's paths. Any problem fails the build with the full list.

export type DocsSite = { sections: DocsSection[]; bodies: Record<string, DocsBody>; files: string[] }

/** An absolute path on the build machine must never reach a published page. */
const machinePath = /(?<![\w.@~-])\/(?:Users|home|private|tmp|var|Volumes|root)\/[^\s"'`<\\]*/g

export function buildDocs(root: string): DocsSite {
  const sections = readManifest(root)
  const pages = sections.flatMap(section => section.pages)
  const slugOf = new Map(pages.map(page => [page.file, page.slug]))
  const files = [join(root, manifestPath)]
  // A Markdown href as the site serves it: full addresses, the site's own pages and /docs links as they are, a #anchor
  // on the same page, a relative link to another published .md file (as GitHub resolves it) as its /docs/<slug>, and
  // a relative link to any other file of the repository as that file on GitHub.
  const siteHref = (file: string) => (href: string): string | null => {
    if (/^(?:https:|mailto:)/i.test(href) || /^\/(?:run|contract)?$/.test(href) || /^\/docs(?:\/|$|#)/.test(href) || href.startsWith('#')) return href
    const [path, anchor] = href.split('#')
    const target = normalize(join(dirname(file), path)).replaceAll('\\', '/')
    const slug = path.endsWith('.md') ? slugOf.get(target) : undefined
    if (slug) return `/docs/${slug}${anchor ? `#${anchor}` : ''}`
    const source = normalize(join(docsDirectory, target)).replaceAll('\\', '/')
    return path && !source.startsWith('../') && existsSync(join(root, source)) ? `${repository}/blob/main/${source}${anchor ? `#${anchor}` : ''}` : null
  }
  const rendered = new Map(pages.map(page => {
    const path = join(root, docsDirectory, page.file)
    files.push(path)
    return [page.slug, renderMarkdown(readFileSync(path, 'utf8'), siteHref(page.file))] as const
  }))
  const problems: string[] = []
  for (const page of pages) {
    const { html, links, problems: own } = rendered.get(page.slug)!
    const report = (problem: string) => problems.push(`${docsDirectory}/${page.file}: ${problem}`)
    own.forEach(report)
    for (const href of links) {
      if (/^(?:https?:|mailto:)/i.test(href) || /^\/(?:run|contract)?$/.test(href)) continue
      const local = /^\/docs(?:\/([^#?/]+))?\/?(?:#(.+))?$/.exec(href)
      const inPage = /^#(.+)$/.exec(href)
      if (inPage) {
        if (!rendered.get(page.slug)!.ids.includes(inPage[1])) report(`links to ${href}, which is not a heading on this page`)
      } else if (!local) report(`links to ${href}; link to other pages by their .md file, as /docs/<slug>, or with a full https:// address`)
      else if (local[1] && !rendered.has(local[1])) report(`links to ${href}, but docs/site.json has no page "${local[1]}"`)
      else if (local[2] && !(local[1] ? rendered.get(local[1])!.ids : []).includes(local[2])) report(`links to ${href}, which is not a heading on that page`)
    }
    for (const leak of new Set(html.match(machinePath) ?? [])) report(`contains ${leak}, a build machine path`)
  }
  if (problems.length) throw new Error(`Docs: ${problems.length} problem(s) in the Markdown:\n- ${problems.join('\n- ')}`)
  const bodies = Object.fromEntries(pages.map(page => {
    const { html, toc } = rendered.get(page.slug)!
    return [page.slug, { html, toc }]
  }))
  return { sections, bodies, files }
}
