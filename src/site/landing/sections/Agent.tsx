import { From, Screen, To } from '../parts'
import { agent } from '../records'

// 06: an agent doing real work without the password. One leader drops from the
// full stop of the heading to the first line of the annotation on the bottom baseline.
export function Agent() {
  return (
    <Screen ground="tangerine" className="agent" titleId="agent-title" leaders>
      <h2 className="screen-title" id="agent-title">{agent.person}’s agent <br className="desk" />signs in for her<From name="agent" at="0.5 0.78">.</From></h2>
      <p className="screen-line">It filled her Grainger cart on a one-time grant; the password went to the site, never the agent.</p>
      <p className="screen-proof agent-note">
        <span className="record-line"><To name="agent" />{agent.day} · {agent.time}</span>
        <span className="record-line"><span className="seg">password → {agent.site} ·</span> <span className="seg">{agent.disclosures} times to the agent ✓</span></span>
      </p>
    </Screen>
  )
}
