# Space Station Game

Browser-based station management sim built with TypeScript + Vite.

## Local development

```bash
npm ci
npm run dev
```

## Build and tests

```bash
npm run build
npm run test:sim
```

## GitHub Pages deployment

This repository uses GitHub Actions for deployment:

- PRs to `main` run CI only (`.github/workflows/ci.yml`).
- Pushes to `main` deploy production Pages (`.github/workflows/deploy-pages.yml`).
- No PR preview deploy is configured.

Production URL format:

- `https://ryanboye.github.io/space-station-game/`

### Required GitHub repo settings

In your GitHub repository:

1. Go to `Settings -> Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions`.
3. Go to `Settings -> Branches` and add a branch protection rule for `main`:
   - Require a pull request before merging.
   - Require at least one approval.
   - Require status checks from the CI workflow.
4. (Optional) Enable auto-merge in repository settings so approved + passing PRs merge automatically.
5. Go to `Settings -> Actions -> General` and keep/enable fork PR workflow approval for outside contributors.

## Contributor PR deploy behavior

- Contributors open PRs.
- CI runs on the PR.
- You approve and merge (or auto-merge if enabled).
- Merge to `main` triggers production deployment automatically.

This avoids deploying untrusted PR code directly.

## Save and load sharing

The game supports local save slots and JSON import/export through the **Save / Load** modal.

- Local save slots are stored in browser `localStorage`.
- `localStorage` data is per browser and per site origin.
- To share a save across people/devices:
  - Export JSON from **Save / Load**.
  - Share the JSON (PR description/comment, gist, etc.).
  - Paste JSON into **Import** on another session and import as a new slot.
