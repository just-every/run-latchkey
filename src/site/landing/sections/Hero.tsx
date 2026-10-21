import { SiteHeader } from '../../shell/SiteHeader'
import { demoHref } from '../../shell/links'
import { DocsLink, From, RunButton, To } from '../parts'
import { company, leak, minute } from '../records'

// 01, the approved hero C: the headline is the picture, set flat in black on
// the tangerine fold with four annotations in its gaps, each on a leader that
// touches a letter, over the black band with the promise and the actions.
export function Hero() {
  return (
    <section className="screen hero" data-ground="tangerine" aria-labelledby="hero-title" data-leaders="">
      <SiteHeader ground="tangerine" />
      <div className="hero-poster">
        <h1 className="hero-title" id="hero-title">
          <span className="hero-line">The <From name="posted" at="0.34 0.29">p</From>assword</span>{' '}
          <span className="hero-line">mana<From name="replaced" at="0.86 0.62">g</From>er that</span>{' '}
          <span className="hero-line">change<From name="revoked" at="0.84 0.7">s</From></span>{' '}
          <span className="hero-line">pass<From name="counted" at="0.16 0.73">w</From>ords.</span>
        </h1>
        <ol className="hero-notes">
          <li className="hero-note posted"><To name="posted" /><span className="seg">{leak.day} ·</span> <span className="seg">{leak.posted} pm ·</span> AWS key <span className="seg">{leak.key}</span> pasted in <span className="seg">{leak.where}</span></li>
          <li className="hero-note replaced"><To name="replaced" /><span className="seg">{leak.replaced} pm ·</span> <span className="seg">new key →</span> <span className="seg">{leak.machines[0]},</span> <span className="seg">{leak.machines[1]},</span> <span className="seg">{leak.machines[2]} ·</span> <span className="seg">3 of 3 by {leak.allReplacedBy}</span></li>
          <li className="hero-note revoked"><To name="revoked" /><span className="seg">{minute(leak.deployed)} pm ·</span> deploy with new key <span className="seg">passed →</span> old key <span className="seg">revoked {minute(leak.revoked)}</span></li>
          <li className="hero-note counted"><To name="counted" /><span className="seg">{company.day} ·</span> <span className="seg">{company.items} items ·</span> <span className="seg">{company.people} people ·</span> <span className="seg">{company.machines} machines</span></li>
        </ol>
      </div>
      <div className="hero-band">
        <p className="hero-sub">Company logins, passkeys and API keys, end-to-end encrypted and filled on every device. When one leaks or someone leaves, Latchkey changes it everywhere it’s used and checks the new one works.</p>
        <p className="hero-alt">100% free, open source alternative to <b>1Password</b>, <b>Bitwarden</b> and <b>Keeper</b></p>
        <div className="hero-actions">
          <RunButton />
          <a className="text-link" href={demoHref}>Try the demo</a>
          <DocsLink />
        </div>
      </div>
      <svg className="leaders" aria-hidden="true" focusable="false" />
    </section>
  )
}
