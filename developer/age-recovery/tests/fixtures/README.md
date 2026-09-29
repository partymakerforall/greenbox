# Disposable test fixture

`keepass-data.mjs` contains a dummy KeePass database. Its public password is `greenbox-test-database-2026`. It is used only by developer checks and is excluded from the production bundle. Private age keys are generated at test time, never committed.
