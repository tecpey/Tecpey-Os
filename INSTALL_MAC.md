# TecPey install on Mac

This ZIP intentionally does not include `package-lock.json` because the previous lockfile contained internal registry URLs from the build environment.

Run:

```bash
cd ~/Desktop
# or cd into the extracted TecPey folder if you extracted into a subfolder
rm -rf node_modules package-lock.json
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

If npm still tries an unexpected private/internal registry, check your global config:

```bash
npm config list -l | grep -i registry
env | grep -i npm
```
