# Life OS Clipper

A Chrome extension: saves the current page — title, URL, a screenshot, and
either your selected text or the full article text — as a task in your Life
OS Inbox. No build step — it's plain HTML/JS, loaded as an unpacked
extension.

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

Click the extension icon on any page. It pre-fills:
- **Title** and **URL** from the tab
- **Notes** — whatever text you had selected, or if nothing's selected, the
  page's full article text (extracted with [Mozilla's
  Readability](https://github.com/mozilla/readability), the same library
  behind Firefox's Reader View)
- **Screenshot** — a capture of the visible viewport (not the full scrolling
  page), shown as a thumbnail with a checkbox to leave it out

Edit anything and click Save — it lands in your Inbox as a task, same as any
other unfiled capture, ready to be processed from there (filed into a
project, moved to the Knowledge Library, etc.).

## Notes

- Deliberately Inbox-only: no folder/project picker at capture time. Life OS
  capture is GTD-style — capture first, decide where it goes later, from the
  Inbox.
- Screenshot capture is viewport-only, not full-page scroll-and-stitch —
  restricted pages (`chrome://`, the Web Store, PDF viewer) can't be
  captured or have text extracted; the extension just skips those parts
  silently and still saves title + URL.
- `vendor/readability.js` is Mozilla's Readability library, vendored
  verbatim (Apache 2.0, see `vendor/READABILITY-LICENSE.md`) rather than
  installed via npm, to keep the no-build-step setup. To update it: `npm
  pack @mozilla/readability`, extract, and replace the file.
- Not published to the Chrome Web Store — it's a personal, unpacked
  extension. Reloading it after any file changes: `chrome://extensions` →
  the refresh icon on the Life OS Clipper card.
- If you ever move to a different domain (custom domain, etc.), update
  `host_permissions` in `manifest.json` to include it, and the default URL
  in `popup.js`/`options.js`, then reload the unpacked extension.
