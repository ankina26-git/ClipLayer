# ClipLayer Distribution

## Local Package

Create the Chrome extension bundle:

```bash
npm install
npm run package:chrome
```

The packaged extension is written to:

```text
release/ClipLayer-0.1.0.zip
```

For local testing, load the built directory:

```text
dist/
```

Chrome path:

```text
chrome://extensions
```

Enable Developer Mode, choose "Load unpacked", and select `dist/`.

## Current Distribution Status

This is ready for private/manual distribution as an unpacked extension or ZIP.

Chrome Web Store submission still needs product listing assets, privacy policy URL, support URL, and a final permissions review.
