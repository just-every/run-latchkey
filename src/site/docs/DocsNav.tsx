import { docsSections } from './pages'

// Every docs page by section, the current one marked with the leaders' dot. On
// a phone the same list folds into one "All docs" disclosure above the page.
function Sections({ current }: { current?: string }) {
  return (
    <>
      <a className="docs-nav-home" href="/docs" aria-current={current === undefined ? 'page' : undefined}>All docs</a>
      {docsSections.map(section => (
        <div key={section.title} className="docs-nav-section">
          <p className="docs-nav-heading">{section.title}</p>
          <ul>
            {section.pages.map(page => (
              <li key={page.slug}><a href={`/docs/${page.slug}`} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export function DocsNav({ current }: { current?: string }) {
  return (
    <>
      <nav className="docs-nav" aria-label="Docs"><Sections current={current} /></nav>
      <details className="docs-nav-fold">
        <summary>All docs</summary>
        <nav aria-label="Docs"><Sections current={current} /></nav>
      </details>
    </>
  )
}
