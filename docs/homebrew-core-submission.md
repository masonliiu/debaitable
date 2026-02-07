# Homebrew Core Submission Checklist

This project can only be accepted into `homebrew-core` if it meets Homebrew's formula policy.

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
1. Keep publishing stable npm versions (`debaitable@x.y.z`).
2. Update formula `url` and `sha256` for each new release.
3. Open PR to `Homebrew/homebrew-core` with formula content and rationale.
4. Address CI and maintainer feedback until merged.

## After merge
- Users can install with:
  - `brew install debaitable`
