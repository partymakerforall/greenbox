# Development files

For normal use, follow the [repository README](../README.md). The handbook and local recovery tool are already built. Dependency installation is only needed to change or test the software.

## Layout

| Folder | Purpose |
|---|---|
| `guide/` | Handbook content, styles, builder, and the shared local server |
| `age-recovery/` | Recovery application source and automated tests |
| `release/` | Standalone HTML builder, wrapper, and release tests |
| `docs/` | Current extended references, included in the HTML handbook |
| `checks/` | Latest build hashes and verification results |

Edit the source and rebuild; do not edit the generated `index.html` or `recovery.html`. The reader-facing guides live in `guide/src/content.py`. Keep their owner commands consistent with `docs/OWNER-REFERENCE.md`.

Generated diagram PNGs live in `guide/assets/diagrams/`. Its `manifest.json` holds the image-generation prompts, labels, and text alternatives. The handbook builder embeds the images directly in `index.html`, so the finished guide needs no separate image files or image server.

## Build and test

Run these commands from the repository root. Development requires Node.js 24 or newer, Python 3, Pandoc, and age 1.3+. Installing the pinned JavaScript dependencies requires network access; subsequent builds and tests are local.

```sh
npm ci --ignore-scripts --prefix developer/age-recovery
npm test --prefix developer/age-recovery
python3 developer/guide/tools/build.py
node --test developer/guide/tools/server.test.mjs developer/guide/tools/pages.test.mjs
python3 developer/guide/tools/check-artifact.py
```

The recovery tests rebuild `recovery.html` and check the production bundle. To rebuild without running its tests:

```sh
npm run build --prefix developer/age-recovery
```

From the repository root, `make check` runs the test and build checks above; `make audit` checks dependencies against current npm advisories. These commands form the local verification pipeline and run in GitHub Actions. The pinned dependencies must be installed first.

Start the already-built pages without installing dependencies:

```sh
node developer/guide/tools/serve.mjs
```

Open `http://127.0.0.1:8788/`. The server only serves the two built HTML files. Source files, fixtures, and arbitrary paths are never served. `GREENBOX_GUIDE_PORT` can select another port.

## Fixtures and browser checks

`age-recovery/tests/fixtures/` contains one disposable KeePass database with a public test password. Keys are generated at test time in temporary folders and removed afterward. Historical wallet compatibility is provided by the previous Git release, not by current runtime code.

No fixture or simulated wallet is part of the production page. The builder enforces a source allowlist and the release test checks the resulting HTML.

`guide/tools/browser-qa.py` checks every route at six widths through browser-harness. With the server running, execute it from the project folder:

```sh
browser-harness -c 'exec(open("developer/guide/tools/browser-qa.py").read())'
```

It uses a separate tab and closes that tab afterward. `age-recovery/tools/browser-layout.py` checks the three recovery views at the same widths. `age-recovery/tools/browser-fixtures.mjs` creates temporary CLI-generated keys and a dummy database for a file workflow rehearsal; delete its printed temporary folder afterward. For headless checks, point browser-harness at an isolated local headless Chrome session using `BU_NAME` and `BU_CDP_WS`. The script accepts `GREENBOX_QA_URL` for a nondefault server address. Real heir key-backup and offline recovery rehearsals still require hands-on checks.

## GitHub Pages

`.github/workflows/pages.yml` tests and rebuilds on pushes to `main` and on pull requests. Only `main` deploys. It uses pinned GitHub Actions and checks npm advisories before publishing.

`make pages` stages only `index.html`, `recovery.html`, and `.nojekyll` in the ignored `_site/` folder. It never publishes the repository directory. Relative links work under `/greenbox/` as well as on the local server.

The repository's Pages source must be **GitHub Actions**. The demo URL is https://partymakerforall.github.io/greenbox/. Real backup work should use a trusted local copy.

## Versioned GitHub releases

The version in `age-recovery/package.json` is the release version. Keep its lockfile root version in sync. `make release` builds both production pages and packages `_releases/greenbox-v<version>.html`, `SHA256SUMS`, and release notes. The HTML embeds the complete production recovery page and handbook; it requests no runtime resources.

To publish a new version, update the version and docs, run `make check` and `make release`, test the downloaded file offline, then commit and push main. Create and push the matching annotated tag, for example:

```sh
git tag -a v2.1.0 -m 'Greenbox v2.1.0'
git push origin v2.1.0
```

The tag workflow checks the version matches, runs all verification, and publishes the HTML plus checksum as GitHub Release assets. Existing releases are not overwritten: use a new version for changes. The main branch separately updates GitHub Pages.

The release wrapper uses an embedded document with the original production CSP plus the outer document’s exact script/style hashes. Handbook links stay inside the downloaded file. Returning to the guide keeps the recovery session in memory; **Clear session** or closing the file discards it.
