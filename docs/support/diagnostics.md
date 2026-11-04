# Private local support diagnostics

In the loaded vault page, open **Settings**, then **Support diagnostics**. The
same door is available while the vault is locked. Read the help, choose
**Preview diagnostic bundle**, inspect the exact JSON, and explicitly allow that
payload before choosing **Download diagnostic bundle**. Cancel makes no file.
Locking the vault discards pending preview and consent. A browser connectivity
change, a new normalized error or any other changed payload requires fresh review
and confirmation, including a final comparison immediately before download.

The allowlist contains only:

- The diagnostic schema and public web and foundation release versions.
- Booleans for secure context, Web Crypto, file reading, local download,
  clipboard writing and the browser's connectivity observation.
- Service status, always `unknown`; this page performs no service health probe.
- At most one normalized error code. Unrecognized errors become
  `operation_failed`; free text, stacks and response bodies are never included.

There is no timestamp, user agent, URL, account, installation or device identifier,
profile, token, cookie, key, recovery material, item metadata or arbitrary log.
The diagnostic builder does not accept a vault client and reads no browser
storage. No support upload, submission or external request is made. The preview
is the complete file, with no hidden envelope or extra metadata. Browser download
initiation is reported without claiming verified delivery. Keep downloaded copies
private and review them again before sharing them yourself.

The already loaded page can show this help and create diagnostics during an
outage. Browser connectivity does not prove service availability; status remains
unknown even if local connectivity is reported. This does not provide a fully
offline application, update verification or complete compatibility support.
Reloading or opening a new page can still require the service.

Support receives no decryption authority. A diagnostic file is neither a profile
nor a recovery kit, carries no device signing key or active grant and cannot open
vault ciphertext. Never provide support with your master password, profile,
recovery material or saved credentials. Signed native rollout, management tools,
whole-product accessibility, mobile approval, actual support submission and
reviewed reversible browser-manager policies remain outside this local feature.
