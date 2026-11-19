# Teen Patti Champion — Git Repo & Railway Setup

This workspace is organized as a clean monorepo ready to push to GitHub/GitLab and deploy on Railway.

## Directory Layout

- `android/` — Cleaned Android Studio project (`letscardplay/`) extracted from `teenpatti champion3.zip` (~108 MB instead of 1.04 GB; stripped `.git/`, `app/build/`, `.gradle/`, `local.properties`, `*.iml`, and release keystore `letsplaycard.jks`).
- `backend/` — Recovered clean assets & manifests from `teenpatti_champion.zip` (`composer.json`, `composer.lock`, `.well-known/assetlinks.json`, `uploads/`), paired with Railway deployment files:
  - `backend/Dockerfile` (PHP 8.1 Apache + `mysqli`, `pdo_mysql`, `gd`, `zip`, `mod_rewrite`, dynamic `$PORT`)
  - `backend/railway.json`
  - `backend/.htaccess`
  - `backend/.env.example`
- `socket-server/` — Railway configuration (`railway.json`, `.env.example`) for the companion Node.js Socket.IO + Aviator server (`port 3002`).
- `src/` — Drive Archive Inspector web workbench (`vite build`).

## Important Findings Before Deploying

1. **Missing PHP Backend Source (`teenpatti_champion.zip` was truncated at 33.6 MB):**
   - `composer.json`, `composer.lock`, `.well-known/assetlinks.json`, and `uploads/` were recovered into `backend/`.
   - Main CodeIgniter PHP folders (`application/`, `system/`, `index.php`) and the `.sql` database dump were missing from the truncated ZIP. Add those files into `backend/` before deploying the PHP service on Railway.
2. **Missing `:ludogame` Module in `teenpatti champion3.zip`:**
   - `android/settings.gradle` includes `:ludogame` and `Homepage.java` imports `com.first_player_games.*`, but the `ludogame/` folder was not included in `teenpatti champion3.zip`. Add the `ludogame/` module into `android/ludogame/` before compiling a fresh APK in Android Studio.
3. **Railway Deployment Steps:**
   - Create a **MySQL** service in Railway and import your `.sql` database dump.
   - Add a service from your GitHub repo with **Root Directory** set to `/backend`.
   - Set env vars: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `APP_URL`.
   - Update `android/app/src/main/java/com/teenpattigards/teenpattichampion/ApiClasses/Const.java` (`MAIN` and `AVIATOR_MAIN`) to your live Railway HTTPS URLs.
