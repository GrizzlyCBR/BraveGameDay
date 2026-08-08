# AIHL Live Broadcast Desk

This is the online version of the Canberra Brave broadcast dashboard.

## Files

- `index.html` — the dashboard you open during the game.
- `worker.js` — the Cloudflare Worker that fetches/parses the AIHL box score.
- `wrangler.toml` — optional Wrangler configuration.

## 1. Deploy the Worker

The easiest route is Cloudflare Workers.

### Option A — Cloudflare dashboard

1. Create/login to a Cloudflare account.
2. Go to Workers & Pages.
3. Create a Worker.
4. Replace the starter code with the contents of `worker.js`.
5. Deploy.
6. Copy the Worker URL, for example:
   `https://aihl-broadcast-proxy.yourname.workers.dev`

### Option B — Wrangler

Install Wrangler, authenticate, then from this folder run:

```bash
npx wrangler deploy
```

The URL will be shown after deployment.

## 2. Connect the dashboard

Open `index.html` in Chrome/Edge.

In the JavaScript near the top, change:

```js
const WORKER_URL = localStorage.getItem("aihlWorkerUrl") || "PASTE-YOUR-WORKER-URL-HERE";
```

to your Worker URL, e.g.:

```js
const WORKER_URL = localStorage.getItem("aihlWorkerUrl") || "https://aihl-broadcast-proxy.example.workers.dev";
```

Save and reload.

Then paste the AIHL box-score URL into the Live connection box and press Connect.

The dashboard polls every 7 seconds.

## 3. What is live

The Worker currently extracts the stable information exposed by the AIHL/Esportsdesk box score:

- teams
- score
- period/status
- shots on goal
- power-play figures
- penalty minutes
- skater game G/A/PTS/PIM
- scoring events
- penalty events

## Important

AIHL/Esportsdesk page layouts can change. The parser deliberately uses labels such as `SCORING`, `DETAILS`, `SCORING SUMMARY`, `PENALTY SUMMARY`, and the skater-table headers instead of depending on a single CSS class.

The source page does not reliably provide season/career/milestone information in the live box score. Those fields are therefore deliberately left available for a future second data source rather than being fabricated.

## Broadcast workflow

1. Open dashboard.
2. Paste the game's AIHL box-score URL.
3. Connect.
4. Keep the tab open.
5. Click players to inspect their live game statistics.
6. Use the Storyboard text areas for manual commentary notes. They are saved locally in the browser.

## Recommended production setup

For a permanent online version, host `index.html` on Cloudflare Pages or another static host and keep the Worker as the server-side proxy.

The Worker is intentionally restricted to AIHL domains so it cannot become a generic open proxy.
