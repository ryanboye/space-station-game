# Deploying to bmo.ryanboye.com/spacegame/

Pull-and-build setup for the BMO server. The game lives at GitHub Pages as
the immutable release channel; this path is the dev-loop mirror — commits
to `origin/main` land at `bmo.ryanboye.com/spacegame/` within ~5 minutes
with no manual intervention.

## Parts

| File | Role |
| --- | --- |
| `build.sh` | Pull, install, build, rsync. Called by the service. |
| `spacegame-deploy.service` | systemd oneshot that runs `build.sh`. |
| `spacegame-deploy.timer` | Fires the service every 5 min. |
| `Caddyfile.snippet` | Route `/spacegame/*` → `/var/www/spacegame`. |

## One-time server setup

Assumes Debian/Ubuntu-style systemd + Caddy already installed. Adjust paths
if your layout differs — the defaults match `/opt/…` and `/var/www/…`
conventions.

### 1. Create the service user + webroot

```bash
sudo useradd --system --home-dir /opt/spacegame-repo --shell /usr/sbin/nologin spacegame || true
sudo mkdir -p /opt/spacegame-repo /var/www/spacegame
sudo chown -R spacegame:spacegame /opt/spacegame-repo /var/www/spacegame
```

### 2. First clone (as the service user)

```bash
sudo -u spacegame git clone https://github.com/ryanboye/space-station-game.git /opt/spacegame-repo
```

### 3. Install the systemd units

```bash
sudo cp /opt/spacegame-repo/tools/deploy/spacegame-deploy.service /etc/systemd/system/
sudo cp /opt/spacegame-repo/tools/deploy/spacegame-deploy.timer   /etc/systemd/system/
sudo chmod +x /opt/spacegame-repo/tools/deploy/build.sh
sudo systemctl daemon-reload
sudo systemctl enable --now spacegame-deploy.timer
```

### 4. Kick the first build

```bash
sudo systemctl start spacegame-deploy.service
sudo journalctl -u spacegame-deploy.service -f
```

Expect `done — deployed <sha>` within ~45 s on first run; subsequent runs
are ~2 s when there are no new commits.

### 5. Wire Caddy

Paste the contents of `Caddyfile.snippet` inside your existing
`bmo.ryanboye.com { … }` block (or wherever the domain is configured —
adjust the block to your layout). Then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Verify: `curl -sI https://bmo.ryanboye.com/spacegame/` should return `200`.

## Override paths

Drop `/etc/systemd/system/spacegame-deploy.service.d/override.conf`:

```ini
[Service]
Environment=SPACEGAME_REPO=/srv/spacegame
Environment=SPACEGAME_WEBROOT=/srv/www/spacegame
Environment=SPACEGAME_BRANCH=main
```

Then `sudo systemctl daemon-reload && sudo systemctl restart spacegame-deploy.timer`.

## Operational knobs

- **Force a rebuild without new commits** — the service is idempotent, but
  if you want to rebuild after a server-side tweak (dependency bump via
  cached npm, etc.), `rm -rf /opt/spacegame-repo/node_modules && sudo
  systemctl start spacegame-deploy.service`.

- **Pause the timer** — `sudo systemctl stop spacegame-deploy.timer`. The
  webroot keeps serving the last deployed commit.

- **Watch a build** — `sudo journalctl -u spacegame-deploy.service -f`.

- **List pending timer fires** — `systemctl list-timers | grep spacegame`.

## Troubleshooting

- **`ERROR: <webroot> missing or not writable`** — the service user lost
  ownership. Fix with `sudo chown -R spacegame:spacegame /var/www/spacegame`.

- **`npm ci` fails with network error** — usually a transient npm registry
  hiccup. The next timer tick retries automatically. Persistent failures
  show up in `journalctl`.

- **`403` from Caddy** — webroot is empty (first build hasn't completed) or
  ownership blocks the Caddy UID from reading. Check `ls -la /var/www/spacegame/`.

- **Site serves stale content** — check the `Cache-Control` headers from
  `curl -sI`. If `index.html` is showing `immutable`, the Caddyfile snippet
  wasn't applied correctly — the `@html` matcher should override.

## Verify post-deploy

A one-liner for after a deploy tick:

```bash
curl -s https://bmo.ryanboye.com/spacegame/ | grep -oE '<script[^>]*src="[^"]*"' | head -3
```

Should show the latest hashed bundle name. Compare against
`ls /var/www/spacegame/assets/` to confirm the files on disk match.
