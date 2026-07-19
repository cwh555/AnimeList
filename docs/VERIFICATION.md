# Verification

This repository was verified from clean extracted copies on 2026-07-19.

## Environment

- Node.js: 22.16.0
- npm: 10.9.2
- Operating system: Linux x64
- npm cache: empty for every clean-install run

## Results

Two clean installs were recorded against the configured npm registry:

```text
Run 1: npm ci completed in 2.44 seconds
Run 2: npm ci completed in 32.81 seconds during a slower registry response
Final run after the test-runner fix: npm ci completed in 2.35 seconds
```

The final automated checks completed as follows:

```text
npm run check:          2.89 seconds
unit tests:             7 passed, 0 failed
npm run release:check:  0.31 seconds
node --check main.js:   passed
```

The repository installs four packages on the current platform: TypeScript, tslib, esbuild, and the platform-specific esbuild binary. The lockfile contains no private registry hostname and no `resolved` registry URL fields.

The test runner explicitly stops the esbuild service after the Node.js test process exits. This prevents `npm test` from printing successful results and then remaining alive indefinitely.

## Commands

```bash
rm -rf node_modules
npm ci
npm run check
npm run release:check
node --check main.js
```

The exact download time depends on the configured npm registry and network. A clean install should finish or report a network error; it should not remain alive after the unit-test summary.

The verification environment cannot launch the official Obsidian desktop or mobile application. Complete the manual checklist in `docs/MANUAL_TEST_CHECKLIST.md` before publishing.
