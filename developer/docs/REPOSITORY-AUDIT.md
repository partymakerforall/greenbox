# Repository audit — 28 September 2026

This records the source and release review of the project at the repository root. It is a review by the implementing assistant, not an independent cryptographic audit. The GitHub Pages workflow separately verifies builds and publishes only the two delivered HTML pages.

## Changes made

- Removed the Mac launcher and replaced every startup reference with the local server command.
- Replaced the old text README with a concise repository README.
- Added repository-wide exclusions for personal keys, databases, backup kits, released shares, credentials, and local dependencies. Saved compatibility fixtures have a narrow exception.
- Added `make check`, `make build`, and `make audit` for repeatable local verification.
- Removed the old rehearsal package name and documented the public test fixtures.
- Rebuilt both delivered HTML files and refreshed the verification records.

## Review results

| Check | Result |
|---|---|
| Wallet tests | 40 passed, including both formats, all 60 three-of-five combinations/orders, tampering, wrong keys, and wallet restoration with software accounts |
| Local server tests | 4 passed; only the two HTML pages are served, foreign Host headers and uploads are rejected |
| Handbook | 244 links checked, no broken internal links, 62 shell blocks syntax-checked, exact script/style CSP hashes |
| Headless layout | 37 routes at 320, 390, 768, 1024, 1440, and 1920 pixels; no page overflow or failed diagrams |
| Headless recovery | Production page recovered the saved version 1 package with shares 5, 1, 3; downloaded KeePass database matched all 2,238 original bytes |
| Release builds | Both HTML files rebuild byte-for-byte identically with the installed, locked toolchain |
| Dependency audit | npm reports zero known vulnerabilities; package sources use the npm registry and lockfile integrity hashes |
| Secret scan | Gitleaks 8.30.1 found 15 reviewed matches: 10 public ephemeral keys and 5 disposable derived secrets, all in compatibility fixtures |
| Production separation | No fixture private keys, private signatures, sample database, or simulated wallet in the built app; fixtures are not served |
| Portability | No personal filesystem paths or launcher references in the built pages; all seven diagrams are embedded |
| Notices | License texts for bundled packages are included; development and Node-only packages retain their npm license files |

The fixed test vectors also contain deliberately public dummy wallet keys, signatures, passwords, and released shares. These were reviewed manually as well as scanned. They remain so old packages can be tested without regenerating the expected results. No real user credentials or backup material were identified. Scanning cannot prove that every possible secret has been detected.

Results are recorded in [checks](../checks/), including [the reviewed secret findings](../checks/secret-scan.json), [dependency results](../checks/dependency-audit.json), and [build hashes](../checks/guide-build.json). The source review covered input validation, signature separation, receipt checks, authenticated encryption, share binding, account changes, downloads, local serving, and production bundling. Third-party cryptographic libraries were not independently audited in this pass.

## Remaining limits

- Wallet-signature recovery remains experimental. Physical Trezor Safe 3/5/7 and restored hardware-wallet compatibility have not been established.
- A sufficient group can recover at any time. Old packages and released shares cannot be revoked by publishing a new backup.
- The receipt needs a trusted source; it is not a creator signature. Private derivation signatures must stay private.
- Memory-only retrieval through an online name, storage-provider independence, and recovery of the user's real database have not been tested here.
- No project-wide license or branch-protection policy has been selected. The Pages workflow runs checks before each deployment.

The protocol's signing assumptions were checked against [EIP-712](https://eips.ethereum.org/EIPS/eip-712), the hardware signing instructions against [MetaMask's signing documentation](https://docs.metamask.io/metamask-connect/evm/guides/sign-data/), and the Shamir integrity requirements against [the library's security notes](https://github.com/privy-io/shamir-secret-sharing#security-considerations). These references support the design review, not a guarantee of wallet compatibility or security.

## Repeat the checks

Follow [development setup](../README.md), then run `make check` and `make audit` from the repository root. The headless browser procedure is documented there too. For a fresh secret scan, scan the staged file snapshot with Gitleaks and compare every fixture finding with `checks/secret-scan.json`; no blanket secret-scan exclusion has been added.
