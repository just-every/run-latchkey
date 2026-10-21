import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { docsLead, docsSections } from './pages'

// /docs: every page by section, each a title and its one-line summary on a hairline row.
export function DocsIndex() {
  return (
    <div className="docs" data-ground="black">
      <SiteHeader ground="black" current="docs" />
      <main className="docs-home">
        <h1 className="docs-home-title">Docs</h1>
        <p className="docs-home-lead">{docsLead}</p>
        {docsSections.map(section => (
          <section key={section.title} className="docs-home-section" aria-labelledby={`section-${section.pages[0].slug}`}>
            <h2 id={`section-${section.pages[0].slug}`}>{section.title}</h2>
            <ul>
              {section.pages.map(page => (
                <li key={page.slug}>
                  <a href={`/docs/${page.slug}`}>
                    <span className="docs-home-page">{page.title}</span>
                    <span className="docs-home-summary">{page.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  )
}
