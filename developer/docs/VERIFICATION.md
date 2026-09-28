# Verification and acceptance

Project cleanup: 25 September 2026. The current build uses reusable wallet-derived public cards. No invitation file is needed for new setup or routine backup updates.

## Repeatable software checks

The retained wallet suite contains 40 tests. It covers every group of three out of five, in every order, in both package formats; reusable cards across backups; older saved files; invalid inputs; tampering; wrong wallets; and exclusion of test fixtures from the production page.

The server tests check the allowed pages, private-path rejection, foreign Host headers, upload rejection, and safe errors. Handbook checks validate internal links, command syntax, and inline script/style integrity. Browser layout checks visit every page and step at six screen widths.

Current machine-readable results and exact build hashes are in `developer/checks/`. Instructions to repeat the checks are in `developer/README.md`. Those files are local development records, not an independent audit or trusted signature on the software.

## Earlier recovery rehearsals

The owner route recovered a disposable KeePass database, and the user opened it and read its stored challenge. A wallet recovery also recovered the full bundle, followed by minisign verification, age decryption, and opening the database. A headless browser recovered a saved dummy package and shares; its downloaded database opened in KeePassXC.

These are historical results from the earlier project. Old practice kits, passwords, screenshots, and duplicate records were removed during cleanup. The fixtures needed for repeatable automated compatibility tests remain only in the development tests.

## What has not been established

- Physical Trezor Safe 3, 5, or 7 signing and restored-wallet compatibility.
- Recovery using your real database, key files, and other unlock requirements.
- Availability and independence of your intended custodians.
- Retrieval of your complete kit using only a remembered name.
- Independent security review of the signature-derived-key integration.

The wallet route is classical cryptography. Any sufficient group of custodians can recover at any time; no inheritance date is enforced. Old published packages and previously released shares cannot be revoked by creating a new backup.

## Acceptance checklist for your own backup

- Recover the owner route from saved encrypted files in a fresh private folder.
- Verify the vault signature with the key recovered from the trusted owner bundle.
- Open the recovered KeePass database using only recovered unlock information.
- Confirm expected entries and attachments, and the intended release number.
- For each custodian, reproduce the original public card using the intended restored wallet and signing method.
- Recover the saved wallet package using sufficient distinct custodians and an independently trusted matching receipt.
- Check complete recovery independently from each offline copy.
- If using online discovery, retrieve every file without saved credentials or a local publishing node, then recover offline.
- Keep trusted recovery tools and compatible installers with your recovery materials.
- Rehearse periodically and after wallet, firmware, custodian, or storage changes.

The HTML handbook provides the actual [verification walkthrough](../../index.html#check-backup), [owner recovery](../../index.html#recover-owner), and [custodian recovery](../../index.html#recover-heirs).
