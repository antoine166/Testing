# Voice capture with Siri (zero new code)

Life OS already has an email-capture path (SCOPE.md §3.1a): any email sent to
your Resend receiving address becomes an Inbox task — subject → title, body →
notes. Siri can send email hands-free, so "capture a thought while driving"
is just a Shortcut away. Nothing to deploy; this is pure phone setup.

## One-time setup (~3 minutes, on your iPhone)

1. **Find your capture address** — the receiving address you set up in
   Resend (Resend dashboard → your inbound domain). It's the address you
   already forward emails to.

2. **Check the sender allowlist** — capture only accepts email from
   addresses in the `INBOUND_ALLOWED_SENDER` env var (comma-separated, in
   Vercel). The iPhone Mail app will send from your default account —
   make sure *that* address is on the list, or captures will be silently
   dropped (that's the allowlist doing its job). Add it in Vercel →
   Project Settings → Environment Variables → edit `INBOUND_ALLOWED_SENDER`
   → redeploy.

3. **Create the Shortcut** — open the Shortcuts app:
   - New Shortcut → add action **"Dictate Text"**
     (in "Documents" category; this is what makes it voice-first)
   - Add action **"Send Email"** (Mail category), then configure it:
     - **Recipient**: your capture address from step 1
     - **Subject**: the *Dictated Text* variable (tap the Subject field →
       select the magic variable)
     - **Body**: leave empty, or also the dictated text if you want it in
       the task notes too
     - Tap the arrow on the Send Email action and turn **"Show Compose
       Sheet" OFF** — this is the frictionless part; no confirmation screen
   - Rename the Shortcut to something Siri-friendly: **"Capture"**

4. **Use it**: "Hey Siri, Capture" → speak → done. The thought lands in
   your Life OS Inbox within a few seconds, ready for the next Clarify
   pass. Works from CarPlay, AirPods, and the lock screen.

## Notes

- **Why email instead of a dedicated API?** The email path already exists,
  already dedupes (Message-ID), already survives offline-ish conditions
  (Mail queues and retries), and the allowlist is the auth. A dedicated
  voice endpoint would be new attack surface for zero added capability.
- **Trust check**: dictation mangles words sometimes. That's fine — a
  slightly garbled title in the Inbox still beats a lost thought, and
  Clarify is where titles get rewritten anyway (GTD: capture ≠ clarify).
- Android equivalent: the PWA's share target (§3.1b's sibling) plus
  Google Assistant's "send an email" can approximate this, but the
  Shortcut flow above is iPhone-specific.
