import { SiteFooter } from '../../shell/SiteFooter'
import { DocsLink, RunButton } from '../parts'

// 09: the method in three words, the two actions and the footer.
export function Close() {
  return (
    <section className="screen close" data-ground="black" aria-labelledby="close-title">
      <h2 className="close-title" id="close-title">Changed, tested, <br className="desk" />then revoked.</h2>
      <p className="close-line">100% free and open source. MIT licensed.</p>
      <div className="close-actions"><RunButton /><DocsLink /></div>
      <SiteFooter />
    </section>
  )
}
