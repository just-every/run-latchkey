import { Screen } from '../parts'
import { secretsOut } from '../records'

// 07: the same follow-through applied to code, as a three-line pull request.
export function SecretsOut() {
  return (
    <Screen ground="black" className="secrets" titleId="secrets-title">
      <h2 className="screen-title" id="secrets-title">Secrets leave .env <br className="desk" />by pull request.</h2>
      <p className="screen-line">Latchkey found {secretsOut.secrets}&nbsp;secrets in {secretsOut.repositories}&nbsp;repositories and opened a pull request in each; apps now read them at runtime.</p>
      <ol className="screen-proof pull-request">
        <li><span className="seg">PR {secretsOut.pullRequest} · {secretsOut.repository} ·</span> <span className="seg">merged {secretsOut.merged} ✓</span></li>
        <li><s>− {secretsOut.removed} secrets from <span className="nowrap">{secretsOut.file}</span></s></li>
        <li><span className="nowrap">+ {secretsOut.start}</span></li>
      </ol>
    </Screen>
  )
}
