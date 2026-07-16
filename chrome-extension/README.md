# Life OS Clipper

A minimal Chrome extension: saves the current page's title, URL, and any
selected text to your Life OS Knowledge Library. No build step — it's
plain HTML/JS, loaded as an unpacked extension.

## Setup

1. **Server side** — generate a token and add it as an environment variable:
   ```
   openssl rand -hex 32
   ```
   Add it to Vercel as `EXTENSION_ACCESS_TOKEN` (Project Settings → Environment
   Variables), then redeploy.

2. **Load the extension** — in Chrome, go to `chrome://extensions`, turn on
   **Developer mode** (top right), click **Load unpacked**, and select this
   `chrome-extension/` folder.

3. **Configure the extension** — click the puzzle-piece icon in Chrome's
   toolbar, find "Life OS Clipper", pin it if you like, then click it once
   (or right-click → Options) to open its settings page. Paste in the same
   token from step 1, and confirm the Life OS URL matches your deployment
   (defaults to `https://testing-azure-eta.vercel.app`).

## Use

Click the extension icon on any page. It pre-fills the title, URL, and
whatever text (if any) you had selected on the page. Edit anything, add
comma-separated tags if you want, and click Save — it lands in your
Knowledge Library as a `resource` item.

## Notes

- This is the minimal version: no folder picker, no screenshot capture, no
  full-page/readability extraction — just title + URL + selection + tags.
  See if it's actually useful before investing in more.
- Not published to the Chrome Web Store — it's a personal, unpacked
  extension. Reloading it after any file changes: `chrome://extensions` →
  the refresh icon on the Life OS Clipper card.
- If you ever move to a different domain (custom domain, etc.), update
  `host_permissions` in `manifest.json` to include it, and the default URL
  in `popup.js`/`options.js`, then reload the unpacked extension.
