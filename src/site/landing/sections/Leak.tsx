import { Screen } from '../parts'
import { leak } from '../records'

// 02: the leak's one failure and its recovery, a three-line log on the bottom
// baseline. The refused update is the page's one reversed slug.
export function Leak() {
  return (
    <Screen ground="tangerine" className="leak" titleId="leak-title">
      <h2 className="screen-title" id="leak-title">The key that leaked <br className="desk" />at {leak.posted}.</h2>
      <p className="screen-line">One update failed, so the old key stayed live until every machine and a deploy proved the new one.</p>
      <ol className="screen-proof log">
        <li className="log-slug"><span className="log-time">{leak.refused} ✗</span> <span className="seg">Cloudflare Worker ·</span> <span className="seg">update refused ·</span> <span className="seg">retry in {leak.retryAfter}</span></li>
        <li><span className="log-time">{leak.retried} ✓</span> <span className="seg">Cloudflare Worker ·</span> <span className="seg">new key ·</span> <span className="seg">3 of 3 machines</span></li>
        <li><span className="log-time">{leak.deployed} ✓</span> <span className="seg">deploy with the new key passed</span></li>
      </ol>
    </Screen>
  )
}
