# Weekly Budget App (Web Companion)

Static single-page web application deployable to **GitHub Pages** with 100% feature, math, theme, and sync compatibility with the Android **Weekly Budget** app.

## Features

- **100% Android Master CSV v3 Sync Compatibility (`weekly-budget-master.csv`):**
  - Identical `#TABLE,meta` header (`format_version=3`, `sync_protocol=3`, SHA-256 `content_hash`, revision counter, and 20-ancestor lineage trail).
  - Row-level 32-character SHA-256 fingerprints (`SyncFingerprints`) and 3-way merge (`ThreeWayMerge` + `SyncPlanner` + `SyncEngine`).
  - Automatic `.trash/` rolling safety snapshots (up to 10 revisions) and `reports/` summary CSVs.
  - Deterministic UUIDv3 recurring transaction IDs (`UUID.nameUUIDFromBytes("recurring|" + ruleId + "|" + date)`) so both phone and web materialize due recurring rules with identical IDs.
- **Native Google Drive Sync (`Link Folder` → `Google Account Chooser` → `Choose Folder`):**
  - Click **Link Folder** in the top bar or Settings → select your Google account in the Google OAuth popup → browse or create a folder in Google Drive → sync directly with the same folder linked on your Android phone.
  - Also supports local directory linking via the Browser File System Access API and direct CSV import/export.
- **All 5 Tabs & 6 Material 3 Palettes:**
  - **Cash flow**, **Budget**, **Dashboard** (default), **Ledger** (with session-retained reconciliation date), and **Settings**.
  - **Emerald**, **Deep Ocean**, **Forest Glow**, **Midnight Violet**, **Ember**, and **Arctic** in **System**, **Light**, and **Dark** modes.

## Publishing to GitHub Pages

1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/<your-username>/weekly-budget-app.git
   git branch -M main
   git push -u origin main
   ```
2. In your GitHub repository, go to **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. *(Optional)* To pre-configure your Google Cloud OAuth Web Client ID at build time, add `VITE_GOOGLE_CLIENT_ID` under **Settings → Secrets and variables → Actions → Variables** (or enter it directly inside the web app's **Settings → OAuth Client ID** dialog).

## Local Development

```bash
npm install
npm test
npm run dev
```
