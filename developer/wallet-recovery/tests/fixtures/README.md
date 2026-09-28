# Public test fixtures

These files contain disposable data, not a user's backup. All keys, signatures, passwords, and released shares here are public test values. Never use these keys for funds or real backups.

- `keepass-data.mjs` contains the dummy KeePass bytes and its public test password.
- `legacy-v1.json` contains fixed version 1 keys, signatures, derived secrets, and an encrypted example. Tests recreate its original keys and plaintext.
- `legacy-downloads/` contains a saved version 1 dummy package, receipt, and three released shares. Tests check recovery against the original KeePass bytes.

Keep these vectors unchanged so compatibility tests can detect regressions. The production builder excludes this entire directory, and the local server cannot serve it.
