# Releasing ShortStack

Two audiences, two ways to get the newest version.

## On this computer — development

The newest version is whatever is checked out. Run **Build and run ShortStack.bat**, which closes
the running copy (it sits in the tray and holds `dist\win-unpacked` open), rebuilds, and starts the
new one. Settings → Updates shows the build you are running and how far the source has moved past
it, with a button that does the same thing.

Nothing is downloaded and no GitHub repository is involved.

## For other people — releases

ShortStack checks GitHub Releases on startup and every six hours, tells the user when there is
something newer, and downloads only when they ask. It installs only when they ask.

### The setup, already done

The repository is https://github.com/ItsNollid/shortstack, public, and `package.json` points the
updater at it. Public matters: a private repository needs a token embedded in the app for the
updater to read releases, and an app carrying a token that can read your private repositories is
not something to hand to friends.

Releasing needs a GitHub token with `repo` scope in `GH_TOKEN`. It uploads the release and is never
built into the app.

### Cutting a release

1. Add an entry at the top of `CHANGELOG` in `src/shared/changelog.ts`. This is the single source:
   the app shows it after updating, and `npm run docs:changelog` writes `CHANGELOG.md` and the
   release body from it.
2. If the privacy policy or terms changed, set `legal` on that entry **and** bump `LEGAL_VERSION` in
   `src/shared/legal.ts`. The app then blocks itself on the agreement screen until the user accepts
   again, and that screen shows the `legal` notes as what changed. Run `npm run docs:legal` to
   refresh the hosted copies.
3. Set the same version in `package.json`. The changelog entry and the package version have to
   match, or the app will not announce the release it is running.
4. `npm run release` — verifies, regenerates the docs, builds, and uploads to GitHub.
5. Publish the draft release on GitHub. Until it is published nobody's app can see it — drafts are
   not readable without a token, which is exactly what makes the draft a safe place to check the
   notes and the installer before anyone gets them.
6. Check the assets are named with hyphens: `ShortStack-Setup-<version>.exe` and its `.blockmap`.
   electron-builder names them that way and `latest.yml` points at those names; uploading one by
   hand gets you dots instead, and an updater that cannot find the file it was told about.

### What your friends will see

The installer is not code signed, so Windows SmartScreen shows "Windows protected your PC" on the
first install, and they have to choose **More info** then **Run anyway**. That warning fades as more
people install it, and goes away entirely with a code signing certificate, which costs money and is
not worth it for a handful of people.

Updates after the first install do not show that warning.
