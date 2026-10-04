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
