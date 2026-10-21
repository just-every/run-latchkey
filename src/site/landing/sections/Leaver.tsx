import { From, Screen, To } from '../parts'
import { leaver } from '../records'

// 04: a leaver, done the same way as the leak. One leader runs from the full
// stop of the heading to the record on the bottom baseline.
export function Leaver() {
  return (
    <Screen ground="tangerine" className="leaver" titleId="leaver-title" leaders>
      <h2 className="screen-title" id="leaver-title">{leaver.logins} new <br className="desk" />passwords by {leaver.last}<From name="leaver" at="0.5 0.78">.</From></h2>
      <p className="screen-line">After {leaver.person} left at {leaver.left}, every shared login she could use got a new password, tested by signing in.</p>
      <p className="screen-proof leaver-record">
        <To name="leaver" />
        <span className="record-line">{leaver.day} · {leaver.first} – {leaver.last} pm</span>
        <span className="record-line"><span className="seg">{leaver.logins} of {leaver.logins} changed ·</span> <span className="seg">{leaver.logins} of {leaver.logins} signed in ✓</span></span>
      </p>
    </Screen>
  )
}
