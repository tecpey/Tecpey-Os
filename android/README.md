# TecPey Android (Trusted Web Activity)

A thin native wrapper around `https://tecpey.ir` using a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/) —
the site's existing PWA (`public/site.webmanifest`, `public/sw.js`) runs
full-screen inside Chrome with no browser UI. This project has no app logic
of its own; every screen is the live website.

**This is a debug-signed test build, not a Play Store release.** It's
signed with `app/tecpey-debug.keystore`, a key committed to this repo on
purpose because the build only needs to produce an installable test APK —
see `app/build.gradle` for the reasoning. Do not reuse this key for a real
release; generate and privately store a proper upload key first.

## Getting an APK

The Android SDK can only be fetched from Google's Maven repo, which this
project's own CI sandbox cannot reach — so the APK is built on a
GitHub-hosted runner instead:

1. Go to **Actions → Android APK (test build)** in this repository.
2. Run it via **Run workflow** (or open a PR touching `android/`, which
   triggers it automatically).
3. Download the `tecpey-debug-apk` artifact from the finished run and
   install it on a device with **Install unknown apps** allowed for
   whatever app you download it through.

## Building locally

Requires a JDK (17+) and the Android SDK (`ANDROID_HOME` set, with
`platforms;android-34` and `build-tools;34.0.0` installed):

```sh
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Digital Asset Links

For the app to open with no address bar (a "verified" TWA) instead of
falling back to an ordinary Custom Tab, Android checks
`https://tecpey.ir/.well-known/assetlinks.json` against the APK's signing
certificate. Three places must stay in sync if the signing key ever
changes:

- `public/.well-known/assetlinks.json` (served by the Next.js app)
- `app/src/main/res/values/strings.xml` (`asset_statements`, an in-app copy
  of the same statement)
- `app/tecpey-debug.keystore`'s own fingerprint

Regenerate the fingerprint with:

```sh
keytool -list -v -keystore app/tecpey-debug.keystore \
  -alias tecpey-debug -storepass tecpey-debug-pass | grep SHA256
```

## Package identity

- Application ID: `ir.tecpey.app`
- Min SDK: 21 · Target/compile SDK: 34
