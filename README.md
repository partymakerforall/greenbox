# Greenbox

A local handbook and recovery tool for encrypted KeePass backups.

[Open the online demo](https://partymakerforall.github.io/greenbox/) · [Recovery tool](https://partymakerforall.github.io/greenbox/recovery.html)

Your passphrase recovers the keys that open your backup. The optional heirs route lets a chosen group—such as any 3 of 5 custodians—recover those keys using saved post-quantum age keys. Each heir sends you a public `.recipient` file once and keeps their private `.key` file. Reuse the public recipients for later backups.

## Open Greenbox

With Node.js installed, run this from the repository folder:

```sh
node developer/guide/tools/serve.mjs
```

Open [127.0.0.1:8788](http://127.0.0.1:8788/). Keep the terminal open; **Control-C** stops the server. No dependency installation is needed to use the built pages.

To read the handbook offline, open [index.html](index.html) directly. Use the local server for the recovery tool.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Complete handbook with embedded diagrams |
| `recovery.html` | Age + Shamir recovery tool |
| `developer/` | Source, tests, build tools, and technical references |

Keep your actual backups, passwords, and private keys outside this repository. The local server serves only the two built pages; encryption and recovery happen in your browser.

The online demo uses the same application with no bundled test data. Use a trusted local copy for real backups. GitHub Pages publishes only the two built HTML files.

The heirs route is a research prototype using hybrid post-quantum age encryption. It requires age 1.3+ for key creation. Real key-backup rehearsals and an independent security review remain outstanding. See [verification and limits](developer/docs/VERIFICATION.md).

Old wallet packages require the previous release; see [legacy recovery](https://partymakerforall.github.io/greenbox/#help!legacy-recovery).

[Development instructions](developer/README.md) · [Repository audit](developer/docs/REPOSITORY-AUDIT.md) · [Third-party notices](developer/docs/THIRD-PARTY-NOTICES.md)
