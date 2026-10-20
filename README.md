# Jakes Breaks automatic live buttons

Prepared for www.jakesbreaks.co.uk and @jakesbreaksuk on TikTok and Whatnot.

## Current state

Source prepared with local automated checks. NOT deployed, connected to the provider, installed on Shopify, or verified against a real live show. No paid services have been created. Provider behaviour must be tested before installation.

## What it does

A small Node web service checks ScrapeAtlas's TikTok live-room and Whatnot seller-show endpoints. Checks depend on account status, so they work independently of TikTok LIVE Studio, OBS, or phone streaming. The browser requests cached status every 30 seconds while visible. Provider calls happen only when someone visits the site, at most once per platform per 120 seconds per service instance. The first visitor after inactivity initiates a check.

The floating banner shows a separate link for each confirmed live platform. TikTok uses https://www.tiktok.com/@jakesbreaksuk/live. Whatnot uses the playing show's direct URL. Both platforms can appear together. Missing, failed, partial, stale, or unrecognized data hides the affected button. Scheduled shows do not count as live. Provider failures clear live status on the next refresh rather than keeping an old live badge.

This is polling, not an instant start/stop webhook. Expected detection delay is up to about 150 seconds plus provider/network latency with the default settings. Third-party platform changes may interrupt detection. The Whatnot first-page show lookup conservatively returns unknown if pagination means it cannot establish offline; verify the current show is returned during real-account testing.

## Deployment prerequisites

1. Confirm Render workspace: My Workspace, sales@jakesbreaks.co.uk.
2. Create a GitHub repository for this project and grant the connected GitHub app access. The connector currently exposes no repositories. Upload the contents of this directory at the repository root, without credentials.
3. Create a ScrapeAtlas account. Add SCRAPEATLAS_API_KEY only in Render's Environment settings. Never commit it or paste it into chat.

## Render web service configuration

- Runtime: Node, version 22 or newer.
- Build command: npm test
- Start command: npm start
- Health-check path: /healthz
- Port: the service uses Render's PORT environment variable and binds to 0.0.0.0.
- SCRAPEATLAS_API_KEY: secret, required for real detection.
- CHECK_INTERVAL_SECONDS: optional, default 120, minimum 60.
- Single service instance; no database or persistent disk required.
- Choose and approve hosting plan before resource creation. A sleeping free service can cause a slow first check; verify whether that is acceptable before launch.

No render.yaml is included: the intended path is direct creation of a single web service after a repository and workspace are confirmed.

## Usage costs

ScrapeAtlas currently advertises 100 free trial credits, one credit per successful ordinary retrieval, and a $19 USD pack of 10,000 credits (checked 20 October 2026). Confirm current pricing in the provider dashboard before buying. At continuous traffic, two checks every 120 seconds can use about 43,200 credits in 30 days, roughly $82.08 at that pack rate, plus hosting. Actual usage is lower during periods without visitors and may vary with failures or service restarts. At 300 seconds, the same estimate is 17,280 credits, about $32.83, with a longer display delay. No automatic purchases or top-ups are configured.

## Verification before Shopify installation

Run npm test. Then, with the provider key configured, check /healthz and /status. Confirm the account identity and current show URL against both accounts while offline, while live, and after ending. Test TikTok LIVE Studio, Whatnot phone, Whatnot OBS, and simultaneous shows. Confirm private or scheduled shows never show a live button. Confirm depleted credits, timeouts, and provider errors hide buttons. Review the banner on desktop and mobile for overlap with cookie notices, chat, and cart controls.

Once a deployed HTTPS URL is verified, add a deferred script referencing its /widget.js in the theme, just before the closing body tag, using the actual Render hostname. The widget derives its status endpoint from its own script URL; the secret stays on the server. Back up the original theme layout and test in a theme preview before publishing. Removing that one script removes the widget. No Shopify Admin API token is needed by this service.

## Local development

Run npm test for automated checks, or npm start to serve on port 10000. Without a provider key the health endpoint works and both platforms return unknown. Do not expose development credentials or commit local environment files.

## Provider documentation

- https://scrapeatlas.com/docs/platforms/tiktok/user-live/
- https://scrapeatlas.com/docs/platforms/whatnot/user-shows/
- https://scrapeatlas.com/
