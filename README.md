# Axşam işıqları · Nar Çiçəyi küçəsi

Azerbaijani pixel-art virtual street: walk from the head of a cozy evening street, collect three neighborhood memories, and bring its lamps back to life. The browser game also includes a local guest mode and an optional Supabase layer for accounts, shared posts, online presence, emotes, friends, likes, reports, and blocks.

## Play locally

Serve this folder over HTTP or HTTPS, then open `index.html`. Use WASD, arrow keys, or the on-screen touch pad to walk. Press E near a memory, neighbor, or the public wall. The sound is synthesized in the browser. The guest mode stores the nickname, progress, and posts on the current device only.

## Turn on the shared world

The game is usable without a backend. To turn on shared accounts and multiplayer:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. Copy the project's Project URL and anon/publishable key into [`src/runtime-config.js`](src/runtime-config.js).
3. Set the Supabase Auth site's URL and allowed redirect URLs to the deployed HTTPS address. Enable email confirmation and configure outbound email before inviting players.
4. Deploy again. Never put a `service_role` key in this static site.

The schema uses row-level security on posts, accounts, reports, blocks, friendships, and likes. The community still needs an active moderation process and account deletion flow before a broad public social launch. Image posts are public content; do not post private photos or personal information.

## Deploy to GitHub Pages

The repository includes `.github/workflows/pages.yml`. On GitHub, open **Settings → Pages** and choose **GitHub Actions** as the build and deployment source. Pushes to `main` then publish the static PWA. The action does not need secrets while the Supabase settings are empty. For a live shared world, configure the browser-safe URL and anon key before publishing.

## Mobile

The responsive site is installable as a PWA over HTTPS and includes Capacitor configuration for a future Android/iOS wrapper. Creating signed native builds and submitting to Google Play or the App Store still requires store developer accounts, signing credentials, store disclosures, tested native projects, and completed privacy/moderation policies.
