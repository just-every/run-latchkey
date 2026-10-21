import { Lockup } from './Lockup'
import { siteLinks } from './links'

// The footer row on black: the lockup (white key, tangerine tooth) and the
// three links at right.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Lockup ground="black" />
      <nav aria-label="Footer">{siteLinks.map(link => <a key={link.key} href={link.href}>{link.label}</a>)}</nav>
    </footer>
  )
}
