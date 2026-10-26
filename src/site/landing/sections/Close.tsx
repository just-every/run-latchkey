import { SiteFooter } from '../../shell/SiteFooter'
import { DocsLink, RunButton } from '../parts'

// 09: the method in three words, the two actions and the footer.
export function Close() {
  return (
    <section className="screen close" data-ground="black" aria-labelledby="close-title">
      <h2 className="close-title" id="close-title"><span className="close-step">Changed,</span> <span className="close-step">tested,</span> <br className="desk" /><span className="nowrap">then revoked.</span></h2>
      <p className="close-line">100% free and open source.</p>
      <div className="close-actions"><RunButton /><DocsLink /></div>
      <SiteFooter />
    </section>
  )
}
