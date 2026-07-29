# TecPey install on Mac

This ZIP intentionally does not include `package-lock.json` because the previous lockfile contained internal registry URLs from the build environment.

Run:

```bash
cd ~/Desktop
# or cd into the extracted TecPey folder if you extracted into a subfolder
rm -rf node_modules package-lock.json
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 npm run build
TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 npm start
```

`TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1` is only for local development from a ZIP
that has no `.git` metadata. It bakes `unverified-local-source-archive` into the
artifact and must never be used for production. A governed production build
must set `TECPEY_BUILD_COMMIT_SHA` to the exact reviewed 40-character Git SHA.

Open:

```text
http://localhost:3000
```

If npm still tries an unexpected private/internal registry, check your global config:

```bash
npm config list -l | grep -i registry
env | grep -i npm
```
