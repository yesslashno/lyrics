# Spotify Companion — milestone 2

A personal, read-only Now Playing screen. Displays Spotify track, artists, album, original artwork and playback position. Synchronized LRCLIB lyrics highlight and scroll with playback. Plain lyrics appear when timing is unavailable; instrumental and missing-lyrics states are shown explicitly. No playback controls are implemented.

## Run

With Node.js 20 or newer, run `npm start` in this directory, then open http://127.0.0.1:5173. There are no dependencies to install. Run `npm test` to check authentication and playback behavior.

Click **Connect with Spotify**, sign in and approve read access. Play music on your phone or speakers with the same account. Track information updates every five seconds; the progress clock advances between responses. Background tabs poll less often and refresh when brought forward. Network failures retry with backoff and rate limits honor Retry-After.

Client ID: `6f9f689a446f4afb8c9577beb830d3a8`

Redirect URI (must match your Spotify developer dashboard exactly): `http://127.0.0.1:5173/callback`

Uses Authorization Code with PKCE (S256), random state validation, and refresh tokens. No client secret. Tokens stay in this browser’s local storage so reconnecting is not needed after every reload; **Log out** in the header clears tokens and pending sign-in state, stops polling, and returns to the welcome screen. Pending token responses cannot restore a logged-out session. Reconnecting uses Spotify’s `show_dialog=true` authorization parameter so approval is shown again; choose “Not you?” on Spotify to switch accounts. The header shows the connected account name, loaded once per page without interrupting playback if the lookup fails. **Switch account** clears the session and opens Spotify’s approval page directly; choose “Not you?” there to sign in with another account. This signs out of the companion; Spotify manages its own browser session. Use on a trusted device. OAuth transaction state/verifier live only in session storage. Callback query parameters are removed after sign-in.

## If Spotify refuses sign-in

Check the redirect URI in your app’s settings at https://developer.spotify.com/dashboard. If sign-in works but Spotify returns a 403, check the app’s allowed users and account eligibility there. Errors appear on the page; share the message with Codex for troubleshooting.

## Tablet follow-up

This milestone is served on the Mac’s loopback address. `127.0.0.1` on a tablet points to that tablet, so this URL cannot be used from another device. To run on iPad/Fire, next host this static frontend at an HTTPS address and register its `/callback` URI in Spotify, then update REDIRECT_URI in spotify.js. Browser Web Crypto for PKCE requires a secure context (HTTPS, or local loopback). Layout is responsive and framework-free, using native ES modules and CSS, ready to extend with a web manifest and PWA support later. No service worker caches private data.

## Structure

- `spotify.js`: auth, refresh, Spotify API and clock helpers
- `app.js`: screen, polling and browser events
- `style.css`: responsive layout
- `server.js`: local static server bound to 127.0.0.1:5173
- `test/spotify.test.js`: tests with mocked Spotify responses; real account approval remains a manual verification

Spotify reference: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

## Lyrics

Track title, first artist, album and duration are sent to https://lrclib.net/api/get to match the recording. Spotify tokens are never sent to LRCLIB. Up to 50 lyric results are cached in memory. Song changes cancel old requests, and failed requests offer a Retry lyrics button. LRC timestamps drive highlighting, including repeated lines and blank instrumental gaps. Matching and timing depend on LRCLIB coverage.

## GitHub Pages

Hosted at https://yesslashno.github.io/lyrics/. Register that exact URL, including trailing slash, as a Spotify redirect URI. Pages serves the root of main. Local development still uses http://127.0.0.1:5173/callback.

## Add missing lyrics

When lyrics are missing (or the lookup fails), choose **Add missing lyrics** beside the lyrics heading. Paste plain lyrics and optionally timestamped LRC lyrics for this exact recording. The form displays the song, artist and album, and keeps that recording as its target even if playback moves to another song.

**Publish to LRCLIB** contributes publicly to LRCLIB, making the lyrics available to other listeners and devices. LRCLIB requires a proof-of-work challenge; preparation runs in a background worker so the page remains responsive, and may take a few minutes. Close cancels pending preparation/requests. Errors keep the text in the open form for retry. Successful publication updates the current screen immediately. Other open screens may need a reload or **Retry lyrics** to discard a cached missing result. Spotify credentials are never sent to LRCLIB. No real test lyrics were published during validation.

### Publishing relay

The live site uses `https://lyrics-publish.hunkyard-dog.workers.dev/api/lrclib`, configured in `publish-config.js`. `publish-relay.js` is deployed as the `lyrics-publish` Cloudflare Worker. LRCLIB blocks direct browser publishing headers, so the relay forwards only the challenge and publish operations, with validated recording data, body-size limits, request timeouts and an origin allowlist. No Spotify credentials or persistent storage are used. Local development serves the same relay through `server.js`. The Worker does not need a custom domain, a GitHub connection, or API secrets.

The account header includes a circular Spotify profile photo (initial fallback). Versioned application and stylesheet URLs prevent cached files from mixing with a newer header.

## iPad Home Screen
In Safari, use Share → Add to Home Screen, name it Lyrics, and add it. Remove and re-add older shortcuts to pick up the new icon and standalone launch mode. The manifest and Apple web-app metadata provide Home Screen support without offline caching. Spotify may require a fresh sign-in in the installed app.

Synced lyric centering uses viewport geometry to stay aligned on iPad. Manually scrolling the lyric panel pauses automatic following; choose Follow lyrics to resume. A new song resumes following automatically.

## YouTube (published companion)

Open https://yesslashno.github.io/lyrics/youtube.html on the laptop and choose **Get pairing code**. Download the updated Firefox ZIP from the pairing panel. In Firefox `about:debugging#/runtime/this-firefox`, remove the older local add-on, choose **Load Temporary Add-on**, and select the new ZIP. Open a music video, click the extension, paste the **Firefox pairing code**, then **Follow YouTube automatically** or **Follow this tab**. The ZIP is temporarily installed until Firefox restarts; this is not yet a signed Mozilla distribution.

Open the **screen link** from the pairing panel on the iPad. The laptop and iPad can use different networks; no local server is needed. Choose Spotify or YouTube in the header; the app uses the selected source, not automatic source detection. Keep Firefox and the laptop awake. Automatic mode follows YouTube across tabs. It holds the current playing tab; when that video pauses, closes, or leaves YouTube, it switches to another unmuted playing tab. Ads in other tabs and stale playback samples cannot take over. If two videos play at once, it keeps the current one; choose **Follow this tab** to select explicitly. The locked mode follows only the chosen tab across playlists. Stop in the extension clears playback. Disconnect YouTube revokes the pairing for all screens. Pairing expires after 30 days.

YouTube uses the selected recording’s ordinary LRCLIB timings directly. No video-duration matching or automatic offsets are applied. Scroll manually to pause following; **Follow lyrics** resumes it. **Change lyrics** lets you correct the inferred title/artist or choose another recording.

Cloud relay: `https://lyrics-youtube.hunkyard-dog.workers.dev/api`, Cloudflare Worker `lyrics-youtube`, D1 database `lyrics-youtube` (`9a95f75e-8457-4f6a-ba7d-abaad4bda0bb`) bound as `DB`. Schema/source and backend tests are `youtube-schema.sql`, `youtube-relay.js`, and `youtube-relay.test.js` in this repository. Backend tests use Node’s built-in SQLite support; use Node 22.13 or newer. The relay stores only the latest chosen video title/channel/clock plus hashed pairing keys. Viewer links and Firefox codes are separate; never publish actual pairing keys in this repository. Readers cannot write playback. Requests have size limits, pairing creation is rate limited, and expired sessions are cleared. Polling is every two seconds while the screen is open.

## Add missing lyrics on YouTube

When a search finds no lyrics (or fails), **Add missing lyrics** opens the public LRCLIB editor. Correct the song, artist, album and recording length, paste lyrics, and explicitly publish. The video’s length is only a starting estimate; enter the actual song recording length for public matching. The save target is captured on opening, so a different video cannot receive a late result. After publishing, the words appear immediately on this screen and **Add timing** becomes available.

## Add lyric timing (Spotify and YouTube)

For plain lyrics, choose **Add timing**. Play the song and tap **Next line** as each line starts (Space also works). **Undo**, retapping any line, and editable seconds let you correct mistakes. Blank lines and standalone section labels do not require taps. **Use these timings** previews synchronized lyrics and remembers them on this browser/device. **Edit timing** reopens your saved work. Drafts autosave, capped at 30 recordings, and resume after reopening. **Download LRC** exports the timestamps.

**Review & publish** opens the existing LRCLIB submission editor with your words and timestamps filled in. Check the recording, then explicitly choose **Publish to LRCLIB**. If YouTube metadata lacks an album, enter it in the review form. Public timestamps should match the named song recording; videos with intros or edits may differ. Private timings do not sync between devices; publishing makes them discoverable through LRCLIB. Nothing is published automatically.
