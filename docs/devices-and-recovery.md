# Devices, recovery and passwords

Your account can unlock on more than one device, and you can recover it with your kit. There is no vendor recovery and no administrator password reset: nobody but you holds the factors. Every command reads its JSON on stdin.

## Add a device

A new device never receives your keys from a password or a sign-in session alone. A device you already trust approves it.

1. On the trusted device, run `identity` (with `profile` and `password`) and pass its output to the new device over a channel you trust.
2. On the new device, start enrollment with those values, your password and a new profile path:

   ```json
   {
     "origin": "https://vault.example.com",
     "account": "your account ID",
     "tenant": "your tenant ID",
     "serverKey": "the serverKey from identity",
     "recipientKey": "the recipientKey from identity",
     "authorityKey": "the authorityKey from identity",
     "password": "your unlock password",
     "profile": "latchkey/profile.json"
   }
   ```

   ```sh
   node scripts/latchkey.mjs enroll-start < request.json
   ```

   It prints the new device's ID and a verification fingerprint.
3. On the trusted device, compare that fingerprint and approve exactly that device with `enroll-approve` (`profile`, `password`, `device`, `fingerprint`).
4. On the new device, run `enroll-complete` with its `profile` and `password`.

The trusted device sends the account's keys to the new one encrypted and signed; the new device checks the signature before it saves anything. A challenge expires after two minutes and works once.

## List and revoke devices

`devices` (with `profile` and `password`) lists your devices with their public keys and whether they are revoked. `device-revoke` with a `device` ID refuses that device's next connected request and its next sign-in.

Revoking cannot recall what the device already decrypted or copied. If a device is lost or compromised, revoke it, then [rotate](sharing.md#remove-someone) the vaults it could open and change the exposed passwords at their websites.

## Recover with your kit

If you lose your device, first run `recover-preview` with `kit` and `password`.
The preview verifies your password, kit and account identity before listing the
account, affected vault references and enrolled devices. It does not revoke
anything or return item names, values or recovery material. A kit without its
password, a password without the correct kit, and an old kit cannot preview.

After reviewing the preview, recover with the kit and your password, saving new files:

```json
{ "kit": "kit/latchkey-kit.json", "password": "your unlock password", "profile": "latchkey/new-profile.json", "newKit": "kit/new-kit.json", "confirmed": true }
```

```sh
node scripts/latchkey.mjs recover < request.json
```

Recovery needs both the password and the kit. It revokes every old device and the old kit, and gives you one new device and a new kit. Your vaults stay readable: the account's root keys do not change. The CLI
requires explicit confirmation before it creates new files or revokes authority.
Recovery does not reset MFA. An unreachable cache and already copied values
cannot be recalled; keep their rotation obligations visible.

This kit path is independent of company recovery administrators. Administrator
recovery envelopes, self-recovery codes independent of the kit, emergency-contact
waiting, notices, cancellation and expiry, separate MFA recovery and verified
member notification are not implemented. LKY-009 remains partial.

## Change your password

On a device that unlocks today, `password-change` takes `profile`, `password`, `newPassword`, and new paths for `newProfile` and `newKit`. It saves the new files first, then replaces the sign-in record, the device factor and the kit in one change, and stops the old password and devices. Keep the old files until the command succeeds.
