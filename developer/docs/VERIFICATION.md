# Verification and acceptance

Updated 28 September 2026 for saved post-quantum age heir keys. The wallet derivation scheme is retired. No invitation is needed for setup or updates.

## Automated tests

The recovery suite has 14 tests, including all 60 groups/orders for 3-of-5 recovery; 2-of-2 and 10-of-10; the full 32 MiB limit; key reuse across independent packages; wrong keys; modified receipts, metadata, shares and envelopes; rejection of classical recipients; and production exclusion of test fixtures and wallet APIs.

Interoperability checks use age 1.3.1: every browser-generated age envelope decrypts in the Go CLI, CLI-generated post-quantum keys work in the browser implementation, and CLI-encrypted share envelopes open in the browser implementation.

`make check` also rebuilds both pages, tests the local server and GitHub Pages packaging, checks command syntax and internal links, verifies Content Security Policy hashes, and checks all seven embedded diagram placements. Exact outputs are retained in `developer/checks/`.

## Browser acceptance

The headless rehearsal uses the built production page and disposable keys generated with the age CLI. It checks saved-key matching, private-key rejection in the public input, five-recipient package creation, actual downloads, recovery after a reload, the trusted-receipt gate, share release, and byte-for-byte recovery of a dummy KeePass database. Layout checks cover the handbook at 320, 390, 768, 1024, 1440, and 1920 pixels.

The developer/checks folder records the current browser and layout results. Test helpers and the public dummy database stay in developer files and never enter the production bundle or Pages artifact.

## What remains personal

- Each heir restores a saved key from their own protected backup and matches its recipient.
- Any three intended heirs complete recovery and open your actual KeePass database using the recovered unlock instructions and any required key file.
- Two physical copies contain complete matching kits and working offline tools.
- The chosen Mac, Linux or Tails environment supports your complete workflow.
- Public discovery finds every required encrypted file without remembered logins, if you adopt that storage route.

Earlier owner rehearsals recovered a dummy database that the user opened. They do not establish that a future real kit, hardware setup, or public storage arrangement works. Repeat the full drill after changing recovery keys or custodians, and periodically thereafter.

These tests are not an independent security audit. The age envelopes use a hybrid post-quantum scheme with 128-bit internal file keys. The owner passphrase and classical minisign signature routes have separate limits. Any sufficient group of heirs can recover at any time; old packages and released shares are not revocable.
