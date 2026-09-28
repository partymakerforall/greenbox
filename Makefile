.PHONY: serve build check audit pages

serve:
	node developer/guide/tools/serve.mjs

build:
	npm run build --prefix developer/wallet-recovery
	python3 developer/guide/tools/build.py

check:
	npm test --prefix developer/wallet-recovery
	python3 developer/guide/tools/build.py
	node --test developer/guide/tools/server.test.mjs developer/guide/tools/pages.test.mjs
	python3 developer/guide/tools/check-artifact.py

audit:
	npm audit --prefix developer/wallet-recovery

pages:
	node developer/guide/tools/package-pages.mjs
