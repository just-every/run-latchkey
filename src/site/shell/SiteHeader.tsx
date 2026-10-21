import { Lockup, type Ground } from './Lockup'
import { siteLinks, type SiteLinkKey } from './links'

// The header strip: the lockup at left, Docs · Contract · Source at right, and
// on a phone the three links behind one Menu button (a <details>, so it works
// without script).
export function SiteHeader({ ground, current }: { ground: Ground; current?: SiteLinkKey }) {
  const links = siteLinks.map(link => (
    <a key={link.key} href={link.href} aria-current={link.key === current ? 'page' : undefined}>{link.label}</a>
  ))
  return (
    <header className="site-header" data-ground={ground}>
      <Lockup ground={ground} />
      <nav className="site-nav" aria-label="Site">{links}</nav>
      <details className="site-menu">
        <summary><span>Menu</span><span className="site-menu-bars" aria-hidden="true" /></summary>
        <nav aria-label="Site">{links}</nav>
      </details>
    </header>
  )
}
