# Repository review

28 September 2026 — replacement of wallet signature derivation with saved post-quantum age keys.

## Scope

Reviewed the new age/Shamir implementation, file validation, trusted-receipt checks, contribution binding, key handling, browser state, downloads, production bundling, guides, dependencies, and deployment workflow. This is a project review and test pass, not an independent cryptographic audit.

## Changes and checks

- Wallet signing/provider code and ethers were removed. The browser uses `age-encryption` 0.3.1 and `shamir-secret-sharing` 0.0.4, with the full dependency tree locked.
- New packages use one native hybrid PQ age envelope per heir. Classic/mixed envelopes and duplicate public keys are rejected.
- The browser accepts standard age private/public files. Private identities are not serialized or persisted; file inputs clear after selection. Memory erasure remains best-effort.
- The receipt covers the complete package. Released shares bind the payload/header context and recipient, and are checked against commitments before reconstruction. The final AES-GCM tag authenticates the recovered payload.
- The 32 MiB boundary test caught and corrected a large-input regex stack overflow. The parser uses a bounded flat character check and canonical re-encoding.
- The suite covers all 60 three-of-five combinations/orders and Go age interoperability. Browser checks use real file inputs/downloads and a disposable KeePass database, without a fake production mode.
- Both generated pages are self-contained. The local server and Pages artifact expose only these pages. Test keys are temporary; the retained KeePass fixture has a public password and is excluded from the bundle.
- CI installs pinned age 1.3.1, runs tests/build/link checks and the dependency audit, then deploys only from main. GitHub Actions are pinned to commit hashes.
- Old wallet packages fail with an explicit legacy message. The guide explains recovery using the exact prior release; the current production page contains no old signer code.

Exact results, hashes, dependency findings, and the repository scan are in [checks](../checks/). The dependency scan reported no current npm advisories. Scans cannot prove the absence of all secrets or vulnerabilities.

## Remaining limits

Protect and rehearse real heir key backups. The tool is not a time lock, key revocation service, storage service, or guarantee of future quantum security. A receipt requires a trusted source; a replacement package plus its own receipt does not authenticate the creator. Age’s internal 128-bit file key, the owner passphrase, and classical minisign signatures each limit their route. Public discovery and the intended offline hardware still need a complete personal rehearsal.
