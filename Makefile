.PHONY: serve build check audit pages release

serve:
	node developer/guide/tools/serve.mjs

build:
	npm run build --prefix developer/age-recovery
	python3 developer/guide/tools/build.py

check:
	npm test --prefix developer/age-recovery
	python3 developer/guide/tools/build.py
	node --test developer/guide/tools/server.test.mjs developer/guide/tools/pages.test.mjs developer/release/release.test.mjs
	python3 developer/guide/tools/check-artifact.py

audit:
	npm audit --prefix developer/age-recovery

pages:
	node developer/guide/tools/package-pages.mjs

release: build
	node developer/release/build.mjs
