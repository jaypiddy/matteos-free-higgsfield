# Matteos Free Higgsfield

A self-hosted front end for the [Higgsfield API](https://docs.higgsfield.ai/docs). The same
composer-driven workflow as Higgsfield's own app, but billed per generation through your own
API key instead of a subscription.

70 models across image and video (16 image, 54 video), each verified against the live API.

## Setup

You need **Node.js 24** (or 22.13+). Check with `node -v`; if it's older, get the current
release from <https://nodejs.org> or `brew install node`. Node 22.12 and earlier crash with a
segmentation fault as soon as the SQLite module opens the database.

```bash
npm install
npm run build
npm start
```

Then open <http://localhost:3000>.

### Add your API key

The app ships without a key — you use your own, and you're billed only for what you generate.

1. Create an account at the **[Higgsfield Console](https://higgsfield.ai/?fpr=zinho-automates)**.
   The home page has a **Grab Your API Keys** link that goes straight there.
2. Create an API key. It comes in **two parts** — a key ID and a key secret. Copy both.
3. In the app, open **Settings** and paste them into the two fields. Save.

That's a one-time step. The key is stored in a local SQLite database on your own machine, and
the secret is never sent to the browser.

If you'd rather keep the key out of the database, copy `.env.example` to `.env.local` and put
it there instead. The app checks the database first and falls back to the environment file.

### Running it day to day

`npm start` serves the production build and is what you want normally. Use `npm run dev` only
if you're changing code — it recompiles on every edit and is slower to load.

The first `npm install` compiles a native SQLite module, so it takes a minute and needs a
working C++ toolchain. On macOS that means Xcode Command Line Tools
(`xcode-select --install`); most Linux distros need `build-essential`.

## Save it to the Dock (macOS)

The app runs as a local web server, so a Dock icon is two pieces: keep the server running in
the background, then save the page as a standalone app window. You don't need a terminal open
once this is set up.

### 1. Keep the server running (LaunchAgent)

A LaunchAgent starts the server when you log in and restarts it if it ever stops. Build the
app first (`npm install && npm run build`), then create
`~/Library/LaunchAgents/com.higgsinator.studio.plist`. Replace both `/path/to/this/repo`
lines with the folder this README is in, and `/opt/homebrew/bin/node` with the output of
`which node` if yours differs (it must be Node 24 — see [Setup](#setup)):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.higgsinator.studio</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>node_modules/next/dist/bin/next</string>
    <string>start</string>
    <string>-H</string>
    <string>127.0.0.1</string>
    <string>-p</string>
    <string>3000</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/this/repo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/tmp/higgsinator.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/higgsinator.log</string>
</dict>
</plist>
```

`WorkingDirectory` matters: the database and downloaded media live in `storage/` relative to
it. `-H 127.0.0.1` keeps the server reachable from this Mac only — the app has no login, so
don't expose it to your network.

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.higgsinator.studio.plist
```

Check <http://127.0.0.1:3000> opens. Useful afterwards:

| To | Run |
|---|---|
| Restart after pulling changes and running `npm run build` | `launchctl kickstart -k gui/$(id -u)/com.higgsinator.studio` |
| Stop it until next login | `launchctl bootout gui/$(id -u)/com.higgsinator.studio` |
| Remove it for good | stop it, then delete the `.plist` |
| See why it isn't working | `tail -50 /tmp/higgsinator.log` |

While the agent is running, don't also run `npm start` — both want port 3000, and the second
one fails with `EADDRINUSE`.

### 2. Add it to the Dock (Safari)

Needs macOS Sonoma (14) or later.

1. Open <http://127.0.0.1:3000> in **Safari**.
2. Choose **File → Add to Dock…** (or the Share button → **Add to Dock**).
3. Keep or change the name and icon, then click **Add**.

You now have a standalone app: its own Dock icon, window and Cmd-Tab entry, with no tabs or
address bar. It's saved in `~/Applications`, so you can also open it from Spotlight or
Launchpad. To remove it, drag it out of the Dock and delete it from `~/Applications`.

**Using Chrome instead:** open <http://127.0.0.1:3000>, then **⋮ → Cast, save, and share →
Install page as app…**. Chrome puts it in `~/Applications/Chrome Apps`; drag it to the Dock
from there.

### If the Dock app shows a blank page or "can't connect"

The window is only a view onto the server, so this almost always means the server isn't
running. Check the log (`tail -50 /tmp/higgsinator.log`), fix what it reports — usually the
wrong Node version or a missing `npm run build` — then restart the agent with the
`kickstart` command above.

If a video won't play in the Safari app but plays in Chrome, reload with **Cmd-R**; if that
doesn't help, quit and reopen the app. Media is cached aggressively, so Safari can hold on to
an old response.

## The model registry

**`lib/catalog.ts` is generated, not hand-written.** Two commands rebuild it:

```bash
HF_API_KEY_ID=... HF_API_KEY_SECRET=... npm run discover
npm run build:registry
```

`discover` reads the live `GET /models` catalogue, then probes each model's `/estimate`
endpoint — which costs nothing — to learn:

- whether your key can reach it (`200` works · `404` not on your plan · `423` blocked ·
  `503` disabled by Higgsfield)
- its price, or that it's token-metered
- which fields are **required**, by submitting an empty body and following the errors
- each optional field's real enum values and type, by submitting deliberately invalid values
  and reading what the validator rejects

`build:registry` turns that into TypeScript, merging each model's text-to-X and image-to-X
endpoints into a single entry, so "Kling V3.0 Pro" is one model that swaps endpoint when you
attach an image rather than two near-identical rows.

Run both after Higgsfield adds models, or if your plan changes.

### Why it's generated

The published OpenAPI spec is wrong and incomplete. It misstates paths (`/veo3.1` is really
`/veo3.1/text-to-video`), enum values (Soul's resolution is `720p`/`1080p`, not `2K`/`4K`) and
types (it declares numeric enums as strings; the live API rejects `"8"` where it wants `8`).
It also omits most of the catalogue outright.

The critical part: **the API ignores unknown fields rather than rejecting them**, so a guessed
parameter name fails *silently* — you get a generation, just not the one you asked for. That's
why every parameter here comes from a live probe rather than documentation.

**13 models are hand-maintained** in `EXTRAS` inside `lib/models.ts`, because `GET /models`
doesn't list them even though they work — Soul Cinema, Popcorn, Soul Reference, Soul
Character, DoP, Veo and a few others. The catalogue is authoritative for what it contains, but
it is not exhaustive.

**Video and audio attachments are supported.** Models can declare `refKind: "video"` or
`"audio"`, and the composer accepts MP4 and WAV alongside images — by picker, drop or paste.
Attaching a clip to a model that wants a still (or vice versa) switches you to one that
matches. Higgsfield's storage only issues upload URLs for images, `video/mp4` and
`audio/wav`, so MOV, WebM and MP3 are rejected up front rather than failing mid-upload.

**Excluded:** six models (`motion-control`, `o3/video-edit`, `omni/video-edit`) return a
**500** from Higgsfield's own estimate endpoint, so they aren't usable by anyone right now.

Models needing **two keyframes** are supported: a model can declare `refKeys`, and successive
attachments fill each key in turn. Kling's First–Last Frame models use this.

## Typography

Two faces, both from Google Fonts and loaded through `next/font` so they are self-hosted at
build time rather than fetched from Google at runtime: **Outfit** for display (headings, the
wordmark, model names, the `.display` and `.overline` classes) and **IBM Plex Sans** for body
text, with **IBM Plex Mono** for figures and costs.

Every size resolves through the scale at the top of `app/globals.css` — there are no
hardcoded pixel sizes left in any component. Adjusting the app's type means editing that one
block: 2xs 11 · xs 13 · sm 15 · base 17 · lg 22 · xl 28 · 2xl 36.

## Layout

Navigation is a **top bar**: wordmark hard left, Home / Library / Settings as underlined
tabs, and Image / Video pulled out to the right as a segmented pair, since those are the two
things people come here to do. Every page is a single scrolling column beneath it with an
overline-plus-title header and a rule under it.

Home is split: the left column is work (the two generate shortcuts, then recent results) and
the right rail is account (the spend ledger, the key link, and anything running now).

The composer is **docked** at the bottom of the studio pages rather than floating over them,
and reads top to bottom: model card and its settings, then the prompt, then attach and the
priced Generate button.

Results are laid out as **justified rows**: items flow left-to-right and wrap, each row
scaled so it spans the full width with every aspect ratio intact and nothing cropped. The
newest result is top-left and the next one sits beside it.

This replaced column masonry, which reads top-to-bottom — in a newest-first library that put
the second-newest *underneath* the newest, which is confusing. No image measuring is needed,
because each tile's ratio comes from the parameters its job was submitted with, falling back
to the model's own default when a job didn't record one.

## Viewing results

Click any result to open it. **←** and **→** step through your library in the order it's laid
out, with a position counter and on-screen arrows; **Esc** closes. The arrows clamp at each
end rather than wrapping, so holding one doesn't silently loop back to the start.

Deleting from the viewer stays put and lets the next result slide into place, rather than
kicking you back to the grid.

## Deleting results

Every result has a delete control on hover, and a Delete button in the lightbox. Deletion is
per-result, not per-job: a batch of four images is one job with four outputs, so removing one
tile keeps the other three. The job row is cleaned up once its last output goes, and the file
is removed from `storage/media` at the same time.

Failed, blocked and cancelled jobs can be cleared in one action from the Library header.
Nothing of value is lost — Higgsfield doesn't charge for `failed` or `nsfw` requests, so they
never contributed to the spend history.

## Choosing a model

The picker is two levels: pick a family (Kling, Seedance, MiniMax…), then a variant. With ~54
models a flat list is unusable, and families match how people actually choose. Each row shows
its live price and a capability summary derived from what the API accepts.

Models your key can't reach are greyed out with the reason rather than failing at generation
time. Availability is detected live, so if Higgsfield enables or disables something the app
reflects it without a code change.

## Attachments

Click **+**, **drop a file anywhere on the page**, or **paste** one. Images upload to
Higgsfield's storage and are passed to the model by URL.

Attaching an image on a model that can't use one switches you to a model that can, and says
so. Video models switch to their image-to-video endpoint automatically. A few models take
several images at once; most take exactly one.

## Metered models

Seedance and a few others bill per token rather than per generation, so there's no price to
quote up front. Those show `metered` instead of a figure, with an explanation, and Higgsfield
reconciles the exact charge afterwards. Metered jobs don't contribute to the dashboard's spend
totals or count against the spend cap, since there's no number to count.

## How it works

- **`lib/models.ts`** — types, helpers, and the hand-maintained `EXTRAS`. Composes with the
  generated `lib/catalog.ts` to form the registry the UI reads.
- **`lib/worker.ts`** — a server-side job engine. All Higgsfield generation is asynchronous,
  so jobs are submitted, polled (2s backing off to 10s, as the docs recommend) and downloaded
  here rather than in the browser. Generations survive closing the tab and, because state
  lives in SQLite, restarting the server.
- **`storage/`** — the database and a local copy of every generated file.

## Why files are downloaded

Higgsfield deletes generated output after about seven days. Every result is copied into
`storage/media/` and served from `/api/media/...`, so the library keeps working indefinitely.

Everything local lives in `storage/` — gitignored, and excluded from any archive of this
project, so it never travels with the code. Back it up if the generations matter; delete it to
start clean.

## Concurrency

Higgsfield applies back-pressure two different ways, and the worker treats both as "wait",
not "fail":

- **Concurrency** — a `400` whose text mentions "maximum number of concurrent requests"
  (4 on most accounts). Adjust the local limit in Settings.
- **Account queue** — a structured `{"code":"account_queue_full","retryable":true,
  "limit":10,"retry_after_seconds":30}`. This counts *all* queued generations on the
  account, including ones started from Higgsfield's own web app, so you can hit it even
  when this app is idle.

The worker keeps the job `pending` and waits out `retry_after_seconds` before trying again.
Genuine errors — a bad duration, a blocked model — still fail immediately rather than
looping.

## Cost

The Generate button shows a live USD estimate from Higgsfield's `/estimate` endpoint, which
prices a request without running it. Spend is tracked on the Home dashboard, and an optional
30-day spend cap in Settings blocks new generations once reached. Only completed jobs count —
Higgsfield doesn't charge for `failed` or `nsfw` requests.

Prices vary by plan, and some keys carry a percentage discount the API applies automatically.

## Branding and the referral link

`lib/brand.ts` holds the product name and the referral link on the home page.

The home-page banner links to `higgsfield.ai/?fpr=zinho-automates`, verified to resolve.

The palette lives at the top of `app/globals.css`. The app is a **light theme**: near-white
warm paper (`--bg` `#faf9f7`, panels pure white) with near-black ink (`--text` `#1a1a1a`),
hairline `--edge` borders and warm-tinted shadows instead of filled panels.

`--accent` is **terracotta** `#b24a24` and is the only action colour — buttons, toggles,
active nav, links and focus rings. It is deliberately the *dark* half of its pair: at 5.4:1
on white it carries small text as a link and takes white ink (`--accent-ink`) as a filled
button, which a bright chip on a light UI cannot do. `--accent-2` is a deep green `#2f6b4f`
and marks video. Disabled controls drop to `--panel-3` with `--faint` text, which still
clears 4.5:1 on the page.

Radii are capped at 10px and nothing is a capsule, so tiles read as trimmed prints.

## Clip length

Where a model accepts a **contiguous** range of durations, the Length control is a slider
covering every second it allows — Kling 3.0 runs 3–15s, Seedance 2.5 goes to 16s, PixVerse
starts at 1s. Where the API only accepts specific values (Kling 2.5 Turbo is 5 or 10, LTX is
6/8/10), it stays a fixed choice, because a slider there would let you pick a duration the
API rejects.

`npm run discover` works this out by probing every value from 1 to 16 and checking whether
the accepted set is contiguous. An earlier version sampled only `[3,4,5,6,8,10,12]`, never
saw 7/9/11/13-16, and so capped several models far below their real limit.

## Keyboard

**Enter** sends the prompt. **Shift+Enter** inserts a line break. **⌘/Ctrl+Enter** also sends,
since that was the previous binding.

Enter is ignored while an IME candidate window is open (`isComposing`), so the composer stays
usable for anyone typing Japanese, Chinese or Korean — there, Enter is confirming a character
rather than submitting.
