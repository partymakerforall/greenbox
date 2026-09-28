# Development files

For normal use, follow the [repository README](../README.md). The handbook and local recovery tool are already built. Dependency installation is only needed to change or test the software.

## Layout

| Folder | Purpose |
|---|---|
| `guide/` | Handbook content, styles, builder, and the shared local server |
| `wallet-recovery/` | Recovery application source and automated tests |
| `docs/` | Current extended references, included in the HTML handbook |
| `checks/` | Latest build hashes and verification results |

Edit the source and rebuild; do not edit the generated `index.html` or `recovery.html`. The reader-facing guides live in `guide/src/content.py`. Keep their owner commands consistent with `docs/OWNER-REFERENCE.md`.

Generated diagram PNGs live in `guide/assets/diagrams/`. Its `manifest.json` holds the image-generation prompts, labels, and text alternatives. The handbook builder embeds the images directly in `index.html`, so the finished guide needs no separate image files or image server.

## Build and test

Run these commands from the repository root. Development requires Node.js 20.19 or newer, Python 3, and Pandoc. Installing the pinned JavaScript dependencies requires network access; subsequent builds and tests are local.

```sh
npm ci --ignore-scripts --prefix developer/wallet-recovery
npm test --prefix developer/wallet-recovery
python3 developer/guide/tools/build.py
node --test developer/guide/tools/server.test.mjs developer/guide/tools/pages.test.mjs
python3 developer/guide/tools/check-artifact.py
```

The wallet tests rebuild `recovery.html` and check the production bundle. To rebuild without running its tests:

```sh
npm run build --prefix developer/wallet-recovery
```

From the repository root, `make check` runs the test and build checks above; `make audit` checks dependencies against current npm advisories. These commands form the local verification pipeline and can also run in a future CI job. The pinned dependencies must be installed first.

Start the already-built pages without installing dependencies:

```sh
node developer/guide/tools/serve.mjs
```

Open `http://127.0.0.1:8788/`. The server only serves the two built HTML files. Source files, fixtures, and arbitrary paths are never served. `GREENBOX_GUIDE_PORT` can select another port.

## Fixtures and browser checks

`wallet-recovery/tests/fixtures/` contains disposable test data. The saved version 1 vectors and downloaded package are retained so compatibility is checked against files created before version 2. Do not regenerate those fixtures to make a failing compatibility test pass. They contain no user backup.

No fixture or simulated wallet is part of the production page. The builder enforces a source allowlist and the release test checks the resulting HTML.

`guide/tools/browser-qa.py` checks every route at six widths through browser-harness. With the server running, execute it from the project folder:

```sh
browser-harness -c 'exec(open("developer/guide/tools/browser-qa.py").read())'
```

It uses a separate tab and closes that tab afterward. For headless checks, point browser-harness at an isolated local headless Chrome session using `BU_NAME` and `BU_CDP_WS`. The script accepts `GREENBOX_QA_URL` for a nondefault server address. Hardware signing and restored Trezor devices require separate hands-on checks; automated software-wallet tests cannot establish that compatibility.

## GitHub Pages

`.github/workflows/pages.yml` tests and rebuilds on pushes to `main` and on pull requests. Only `main` deploys. It uses pinned GitHub Actions and checks npm advisories before publishing.

`make pages` stages only `index.html`, `recovery.html`, and `.nojekyll` in the ignored `_site/` folder. It never publishes the repository directory. Relative links work under `/greenbox/` as well as on the local server.

The repository's Pages source must be **GitHub Actions**. The demo URL is https://partymakerforall.github.io/greenbox/. Wallet extensions can use the HTTPS recovery page; real backup work should use a trusted local copy.
