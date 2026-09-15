# Homebrew Core Submission Checklist

This project can only be accepted into `homebrew-core` if it meets Homebrew's formula policy.

## NPM Distribution (Automated)

Releases are now published automatically to the NPM registry whenever a semantic version tag
(e.g. `v1.2.3`) is pushed. The release workflow (`.github/workflows/release.yml`) runs a full
build, typecheck, and test suite before publishing, so every tagged release is verified stable.

### Install via NPM

```bash
npm install -g debaitable
```

Or use without installing:

```bash
npx debaitable
```

Published package: https://www.npmjs.com/package/debaitable

### Triggering a release

1. Merge all changes to the default branch.
2. Create and push a semantic version tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
3. The release workflow automatically:
   - Runs `npm ci`, `npm run typecheck`, and `npm test`.
   - Builds the CLI via `npm run build`.
   - Publishes to NPM using the `NODE_AUTH_TOKEN` secret.
   - Creates a GitHub Release with auto-generated release notes and `dist/` artifacts.

## Current install status
- Works today via personal tap:
  - `brew tap masonliiu/debaitable`
  - `brew install debaitable`
- Not available yet as direct core install:
  - `brew install debaitable` (without tap) only works after merge into `homebrew-core`

## Required prerequisites
- Public source repository
- Open source license file in repo root (`LICENSE`)
- `package.json` license set to an SPDX identifier (currently `MIT`)
- Stable release artifacts (versioned npm tarball URL + SHA256)

## Formula source
- Candidate formula file:
  - `packaging/homebrew/Formula/debaitable.rb`

## Validation commands
- `brew style packaging/homebrew/Formula/debaitable.rb`
- `brew audit --new --formula debaitable` (run after formula is in a tap/core context)

## Submission flow
1. Push a version tag to trigger the automated NPM release (see above).
2. Once the GitHub Release is created, find the versioned tarball URL from the NPM registry:
   ```
   https://registry.npmjs.org/debaitable/-/debaitable-<version>.tgz
   ```
3. Compute the SHA256 of the tarball:
   ```bash
   curl -sL https://registry.npmjs.org/debaitable/-/debaitable-<version>.tgz | sha256sum
   ```
4. Update `packaging/homebrew/Formula/debaitable.rb` with the new `url` and `sha256`.
5. Open PR to `Homebrew/homebrew-core` with formula content and rationale.
6. Address CI and maintainer feedback until merged.

## After merge
- Users can install with:
  - `brew install debaitable`
