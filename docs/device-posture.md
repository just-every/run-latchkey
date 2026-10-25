# Read device posture

`node scripts/latchkey.mjs posture-inspect` reads one explicitly selected device
from Jamf, Kandji or Microsoft Intune. JSON enters on standard input:

```json
{"source":"intune","origin":"https://graph.microsoft.com","token":"synthetic-latchkey-2601","device":"synthetic-latchkey-2602","serial":"synthetic-latchkey-2603","maxAgeMs":3600000}
```

Supply a dedicated read-only token through a private input file. Never place a
token in command arguments. Jamf origins must be a tenant on `jamfcloud.com`;
Kandji origins must be a tenant on `api.kandji.io`. Intune uses Microsoft Graph.
No token or raw response is printed or persisted. Every request is a bounded
GET with redirect refusal, a ten-second deadline and a 256 KiB response limit.
There is no automatic retry and no device-management command.

The result includes the source, inventory timestamp, exact record and serial
match, freshness, encryption, OS version and management observation. A missing,
future-dated or unrecognized value stays unknown. A mismatched record exposes
no other device's controls. Neither successful authentication nor a matching
serial proves physical possession or trusted-device enrollment.

Screen lock is unknown for these inventory resources. Activation lock,
FileVault recovery lock, disabled automatic login and generic compliance are
not screen-lock evidence. An OS version is an observation, not an assertion
that the OS remains supported. Kandji's documented string management values
are handled explicitly; arbitrary nonempty strings never mean true.

This is a read-only diagnostic door. It does not enforce vault or group policy,
issue overrides, approve enrollment, unwrap keys or impose an offline timeout.
Linen's current asset records have no device-security posture schema; selecting
Linen refuses before any network request. LKY-026 remains partial until those
source controls and the policy and client enforcement journeys exist.

Source schemas: [Jamf inventory](https://developer.jamf.com/jamf-pro/reference/get_v3-computers-inventory-detail-id),
[Kandji device details](https://api-docs.kandji.io/), and
[Microsoft managed device](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice?view=graph-rest-1.0).
