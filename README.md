# ClipLayer

GUI driven Chrome extension for extracting structured data from logged-in web pages.

## Development

```bash
npm install
npm run dev
```

Build the extension:

```bash
npm run build
```

Load `dist/` as an unpacked extension in Chrome.

Create a distributable ZIP:

```bash
npm run package:chrome
```

The ZIP is generated at `release/ClipLayer-0.1.0.zip`.

Run the API skeleton:

```bash
npm run api:dev
```

Health check:

```bash
curl http://localhost:8787/health
```

## Scope Implemented

- Manifest V3 extension skeleton
- Side Panel, Popup, Options pages
- Background service worker orchestration
- Content script extraction from declarative profiles
- Element Picker MVP with row detection, field selection, preview, and profile saving
- Dexie schema and repositories for profiles, runs, pages, items, logs, and delivery attempts
- Hono API `/health` and profile catalog stub
- Docker Compose for extension dev server, API, and PostgreSQL

## Chrome Web Store

Store listing copy and permission explanations are in [STORE_LISTING.md](STORE_LISTING.md).

Privacy policy:

```text
https://github.com/ankina26-git/ClipLayer/blob/main/docs/privacy-policy.md
```
