# The War for Christopia

A framework-free planetary campaign tracker for Warhammer 40,000. Open the tactical map, choose a territory, plan a battle, then record its result. Campaign ownership, resources, Chronicle entries and endgame progression are updated together.

## Run locally

Use Node.js 20 or newer:

```sh
cd campaign
npm install
npm run dev
```

Open **http://localhost:4173/battle-for-christopia.html**. The app needs an HTTP server; opening the HTML with `file://` will block ES modules in browsers.

With the supplied blank `config.js`, the app starts in **local demo mode**, with 12 locations, five historical battles, an active battle, factions, units, scenarios and events. Edits and compressed photographs persist in IndexedDB on this browser and origin. Reloading retains your campaign. Clearing site data removes it. Local mode is intended for trying the app; configure Supabase for shared play across devices.

The initial sample campaign has five territories held by Chris, four by Player Two and three neutral. A new campaign uses the same geographical starting layout without the historical battles. Campaign I and Campaign II have separate ids and retain their own map, photographs and history. Archiving preserves campaign records.

## Project layout

- `battle-for-christopia.html` — application entry point.
- `css/` — responsive tactical interface and map styling.
- `js/app.js`, `map.js`, `views.js`, `ui.js` — screens and interaction.
- `js/engine.js`, `js/services/` — commands, attack legality, results, progression and statistics.
- `js/seed.js` — demonstration and fresh campaign creation.
- `js/store.js` — IndexedDB/cloud persistence, authentication and photo workflow.
- `js/images.js` — browser-side JPEG resizing and compression.
- `supabase/001_schema.sql` — normalized relational schema, membership RLS and transactional persistence.
- `supabase/002_storage.sql` — private image bucket and Storage policies.
- `supabase/functions/campaign-command/` — authenticated server-side command handler.
- `tests/` — domain, database/permissions and storage integration checks.

## Supabase setup

Create a dedicated Supabase project. This application uses names beginning with `christopia_` so its tables and policies do not overlap with another application's names.

1. In **SQL Editor**, run `supabase/001_schema.sql`, then `supabase/002_storage.sql` then `supabase/003_destroy_the_asset.sql` and `supabase/004_simplify_campaign.sql`. These are initial migrations, intended to be applied once to a new installation. Do not repeatedly run the initial migration against an existing campaign.
2. In **Authentication → Providers**, enable email/password authentication. Email confirmation is supported. Configure your **Site URL** and redirect URLs for the deployed site and `http://localhost:4173/battle-for-christopia.html` during development.
3. The storage migration creates a **private** bucket named `christopia-battle-photos`. It accepts JPEG images up to 5 MiB; the client resizes photographs to at most 2,000 pixels on the longest edge. JPEG, PNG and WebP input is supported. Export HEIC photographs as JPEG before uploading.
4. Deploy the command Edge Function as described below. The browser cannot modify campaign tables directly; the command function is required for cloud saves.
5. Set the public project URL and publishable/legacy anon key in `config.js`:

```js
window.CHRISTOPIA_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

Only public configuration belongs in `config.js`. Never put a service-role key or an `sb_secret_` key in the webpage, Netlify public build variables or committed configuration. The build and browser reject recognizable secret/service-role keys.

### Deploy the command function

Install/login to the Supabase CLI, then run from `campaign/`:

```sh
npm run prepare:functions
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy campaign-command
```

`prepare:functions` copies the browser's exact domain modules into `supabase/functions/_shared/`. Run it again and redeploy whenever `engine.js`, `seed.js` or `services/` changes. The supplied `supabase/config.toml` disables the gateway JWT check; the function itself **always verifies the supplied bearer token with `auth.getUser(token)`** before accessing data. This avoids relying on unverified client claims and supports the project's configured Auth signing method. No command is accepted anonymously.

Supabase supplies these server-only environment variables to deployed Edge Functions:

| Variable | Used by |
| --- | --- |
| `SUPABASE_URL` | Edge Function's project connection |
| `SUPABASE_ANON_KEY` | Server verification of the caller's Auth token |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only transactional persistence after membership/command validation |

You do not copy the service key into the browser. It is read only inside the deployed function. The function does not accept arbitrary client state; it loads the authoritative campaign, derives the actor from database membership, applies one validated command and saves the result atomically.

### Create your shared campaign

1. Both friends create an account and confirm their email if confirmation is enabled.
2. The first player signs in and creates the campaign. The first commander is linked to that account and becomes administrator.
3. In the campaign's player editor, the administrator links the second commander's existing account by email. This associates an account with a commander; it does not send an invitation message. Until linked, the second account cannot read the campaign.
4. The second player signs in or refreshes. The campaign becomes available.

Roles are campaign-specific. Administrators manage settings, map locations, connections, players, factions, scenario/event definitions and archives. Players issue commands for their own armies and battles in which they participate. Users belonging to other campaigns cannot read yours. Keep at least one linked administrator account.

## Netlify deployment

For a separate site deployed from this repository, set Netlify's **base directory to `campaign`**. `campaign/netlify.toml` runs `npm run build` and publishes `campaign/dist`. The build also creates `index.html`, so both `/` and `/battle-for-christopia.html` open the app.

Set these build environment variables in Netlify:

| Variable | Required for cloud mode |
| --- | --- |
| `SUPABASE_URL` | Public Supabase project URL |
| `SUPABASE_ANON_KEY` | Public publishable/anon key |

Set both or neither. With neither, the build uses `config.js` (blank configuration launches local demo mode). The build reads only these named variables; it does not load unrelated `.env` files. If deploying as a subdirectory of an existing static site, copy the built contents together and retain the relative `css/`, `js/`, `assets/` and `config.js` paths. Deploying the static website does not deploy the Supabase Edge Function.

## Campaign rules

Attack an adjacent neutral/enemy location, or use a controlled Spaceport or a Strategic Redeployment credit. Every planned/active/completed battle from the current turn consumes an attack opportunity. Counter-offensive adds one. A contested location cannot host a second simultaneous battle. Resolve outstanding battles before advancing the campaign turn.

Completing a battle records its outcome once, changes territory control when applicable, awards enabled resources, adds the Chronicle and history entries, and checks domination. A configurable share of the total territory count unlocks a Final Assault against an enemy headquarters. Reaching the threshold alone does not finish the campaign. Winning a Final Assault completes the campaign; losing neutralises the configured number of eligible attacker territories. The remaining map and history are preserved.

The campaign percentage is territory count divided by total territories. Strategic/domination values are tracked separately; they do not silently change this percentage. Resource and narrative systems are optional. Any event/fortification effects on tabletop play are house rules, to be agreed by both players. Gameplay modifiers are disabled by default.

Administrators can edit battle reports and scores. The most recently created standard battle in the current turn can also have its outcome corrected, with territory control and resource awards reconciled atomically and an audit entry retained. Corrections are rejected after dependent territory changes or resource spending, for earlier turns, and for Final Assaults. Enemy headquarters are reserved for an unlocked Final Assault while that option is enabled. Notable units are no longer shown. Existing historical unit records are preserved.

## Persistence and permissions

Campaign entities are normalized into relational tables with foreign keys and campaign membership. JSON is used to transport a complete validated transaction over the RPC boundary; it is **not** stored as a giant campaign-state blob. The transaction replaces the campaign's normalized rows while preserving ids and relationships. This keeps the implementation simple for a small private campaign; very large campaigns may later benefit from row-level diffs.

The service-only persistence RPC locks the campaign row and compares its revision before changing any table. Two commanders saving the same revision cannot overwrite each other. A stale save produces a refresh message. Invalid references or interrupted transactions roll back all campaign changes. The browser publishes successful state only after storage confirms the commit. When a connection drops after a request was sent, refresh before retrying to see whether it committed.

Photographs live in a private bucket. Membership permits viewing; an administrator or battle participant may upload/delete. Read URLs expire after an hour; refresh to renew them. A failed metadata save attempts to remove its just-uploaded file. If cleanup also fails, the app reports the unlinked Storage path for manual cleanup. Removing a photograph first removes its report reference, then the file; a failed file cleanup is reported. Deleting a storage file directly in the dashboard may leave an unavailable thumbnail until its report reference is removed.

## Checks and verification limits

```sh
npm test
npm run build
npm run prepare:functions
```

Database tests execute both SQL migrations in PGlite's PostgreSQL engine with simulated Supabase Auth identities and a minimal Storage schema. They check member/outsider/anonymous access, rejection of direct writes and privileged RPC calls, revision conflicts, transaction rollback, cross-campaign foreign keys, and private Storage read/write policies. This is stronger than text-matching SQL but is not a hosted Supabase end-to-end test.

The app has not been connected to a real Supabase project by the build agent. After provisioning, verify email confirmation, a second player's account link, simultaneous saves from two browsers, real image upload/view/delete, and denied access from an unrelated account. Supabase Auth email delivery, deployed Edge Function invocation, Storage's API and production Netlify hosting require your configured project.

Official references: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Edge Function deployment](https://supabase.com/docs/guides/functions/deploy).

### Browser checks

With `npm run dev` running in another terminal:

```sh
npx playwright install chromium
npm run test:browser
```

The browser suite uses a fresh, isolated browser profile. It tests all six screens, scenario and battle creation, confirmed territory capture, persistence after reload, photographs/gallery/removal, Chronicle edits, unit registration, settings, map dragging, fresh campaign setup, archives, guarded result correction and the Final Assault. Desktop and 390px mobile views are checked for horizontal overflow. Screenshots go to `/tmp/christopia-browser-artifacts`; override `CHRISTOPIA_SCREENSHOTS` if desired. Set `CHRISTOPIA_TEST_URL` to test another local server. These browser checks run in demo mode; use the hosted verification checklist above for cloud integration.

### Original artwork

The generated planetary backdrop is stored in `assets/christopia-planet.jpg`. Its generation prompt and tool provenance are recorded in `assets/ARTWORK.md`. Markers and connections are separate interactive elements, so the illustration does not restrict editing the campaign map.


## Territory names and “Destroy the asset” update

Existing local campaigns are updated automatically once on opening the app: Fort Penelope becomes Fort Rouse, Hive Ward becomes Hive Ashstomp, and The Hazel Expanse becomes Sam's Smelly Hole. Battle/Chronicle references are renamed without changing identifiers, results or ownership. The new scenario is added to each campaign's library. Subsequent manual edits are preserved.

For an existing **Supabase installation**, run `supabase/003_destroy_the_asset.sql` followed by `supabase/004_simplify_campaign.sql`, then run `npm run prepare:functions` and redeploy `campaign-command`. Do not re-run the initial schema. The migration preserves existing records and adds the per-side army allowances needed by the scenario. It is safe to re-run.

Select **New battle → Scenario library → Destroy the asset**. Choose which commander escorts the Baneblade and enter that army's total allowance, including the Baneblade. The opposing force receives twice that total (for example, 1,000 vs 2,000). Agree eligible escape zones before the game; roll to select the destination only after both armies deploy. The Baneblade player wins by escaping to that zone; the opposing player wins by destroying it first. This explicitly selected asymmetric mission is independent of optional planetary-event modifiers.

Territories now have a fixed scenario, configurable in the administrator territory editor. New battles inherit and enforce that scenario. Existing battle reports stay unchanged. Resource balances and income are retained; boost benefits and costs display **to decide** and spending is unavailable until their rules are defined. Local campaigns receive this update automatically without resetting their history.
