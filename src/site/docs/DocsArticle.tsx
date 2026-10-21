import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsNav } from './DocsNav'
import { docsNeighbours, getDocsPage } from './pages'

// One docs page: the docs list at left, the page rendered from its Markdown,
// "On this page" at right on wide screens, then the previous and next pages.
export function DocsArticle({ slug }: { slug: string }) {
  const page = getDocsPage(slug)
  if (!page) throw new Error(`No docs page "${slug}"`)
  const { previous, next } = docsNeighbours(slug)
  return (
    <div className="docs" data-ground="black">
      <SiteHeader ground="black" current="docs" />
      <div className="docs-layout">
        <DocsNav current={slug} />
        <main className="docs-article">
          <p className="docs-section">{page.section}</p>
          <h1 className="docs-title">{page.title}</h1>
          <p className="docs-summary">{page.summary}</p>
          <div className="docs-body" dangerouslySetInnerHTML={{ __html: page.html }} />
          <nav className="docs-pager" aria-label="Previous and next">
            {previous ? <a className="docs-pager-previous" href={`/docs/${previous.slug}`}><span className="docs-pager-label">Previous</span><span className="docs-pager-title">{previous.title}</span></a> : <span />}
            {next ? <a className="docs-pager-next" href={`/docs/${next.slug}`}><span className="docs-pager-label">Next</span><span className="docs-pager-title">{next.title}</span></a> : null}
          </nav>
        </main>
        {page.toc.length > 1 ? (
          <aside className="docs-toc" aria-label="On this page">
            <p className="docs-toc-heading">On this page</p>
            <ul>{page.toc.map(entry => <li key={entry.id} data-depth={entry.depth}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul>
          </aside>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  )
}
