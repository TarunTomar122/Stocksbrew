# T3 Code + SSH access (VPS)

How to reach the **one** always-on T3 server on the VPS without spawning duplicates or losing projects.

## VPS endpoints

| What | Value |
|------|--------|
| Public IPv4 | `144.217.6.112` |
| SSH user | `ubuntu` |
| SSH host alias (Mac) | `vps` |
| Tailscale IP (VPS) | `100.127.22.69` |
| T3 port | `3773` |
| Tikrr project path | `/opt/tikrr` |
| T3 state dir | `~/.t3` on VPS |
| systemd unit | `t3code.service` (user) |

T3 is started by systemd and binds to the **Tailscale IP** (`100.127.22.69:3773`). It keeps running when you close SSH or sleep your Mac.

## Pairing (first time or after T3 restart)

Tokens are **one-time** and reset when `t3code.service` restarts.

On the VPS:

```bash
journalctl --user -u t3code.service -n 25 | rg -i 'Pairing URL|Token:'
```

Example:

```text
http://100.127.22.69:3773/pair#token=XXXXXXXXXXXX
```

Paste the token in the T3 app or open the full pairing URL in a browser.

## Phone (Tailscale)

1. Tailscale app on — **same account** as the VPS.
2. Open `http://100.127.22.69:3773` (or the pairing URL above).
3. Add project `/opt/tikrr`.

No SSH tunnel needed.

## Mac without Tailscale (SSH tunnel) — use this at the office

Office WiFi often breaks **Tailscale** (UDP / WireGuard blocked or flaky). **SSH over TCP (port 22) usually still works.** You do not need Tailscale on the laptop for this path.

Your Mac cannot reach `100.127.22.69` without Tailscale. Use an SSH port forward to the systemd T3 instance instead.

### One command (recommended)

After setup below, in a new terminal:

```bash
t3vps
# or: ssh-vps
```

Starts a background tunnel if needed and opens `http://localhost:3773`. Re-run anytime WiFi drops the tunnel — T3 on the VPS keeps running.

Optional (flaky WiFi): `brew install autossh` — `t3vps` will use it to auto-reconnect.

### SSH config (`~/.ssh/config`)

```sshconfig
Host vps tikrr-vps
  HostName 144.217.6.112
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
  LocalForward 3773 100.127.22.69:3773
  ServerAliveInterval 30
  ServerAliveCountMax 4
  TCPKeepAlive yes
  ConnectTimeout 15
```

Then either:

```bash
ssh-vps          # tunnel + open browser
ssh -f -N vps    # tunnel only (background)
ssh vps          # shell + tunnel (forward stays while session is open)
```

### What happens when SSH dies?

- **T3 on the VPS keeps running** (`t3code.service`).
- Projects and threads stay on the server.
- You only lose **access from the Mac** until you run `ssh-vps` or `ssh -f -N vps` again.

### Kill a stuck tunnel (Mac)

```bash
pkill -f 'ssh.*-L 3773.* vps'
```

## Mac with Tailscale (optional)

Install Tailscale on the Mac (same account). No SSH tunnel:

```text
http://100.127.22.69:3773
```

Same experience as the phone.

## Do not use T3 desktop SSH project mode

If you add the VPS as an **SSH remote project** in the T3 desktop app, it spawns a **second** server:

```text
t3 serve --host 127.0.0.1 --port 3773
```

That duplicates the DB under `~/.t3` and causes orchestration errors, disconnects, and ~250 MB extra RAM.

**Use instead:**

- URL / pairing to the systemd server (`localhost:3773` via tunnel, or Tailscale IP), or
- `ssh-vps` on Mac.

## RAM / duplicate cleanup

Heavy consumers on the VPS:

| Service | Notes |
|---------|--------|
| `agent-browser` Chrome | Kill after browser tasks: `agent-browser close` |
| Duplicate `t3 serve` on `127.0.0.1` | From T3 desktop SSH mode — avoid |
| Firecrawl Docker stack | Stop if unused: `docker compose down` in firecrawl dir |
| Camofox | `docker stop camofox-browser` if not using VNC browser |

`backend/vps/t3-dedupe.sh` can kill orphan `127.0.0.1` T3 processes but **do not enable the timer** if you rely on T3 desktop SSH mode — it will disconnect you every few minutes. Prefer URL/tunnel access instead.

## VPS setup scripts

| Script | Purpose |
|--------|---------|
| `setup-t3code.sh` | Install T3 CLI + `t3code.service` (localhost bind) |
| `setup-t3-mobile.sh` | T3 + Tailscale Serve variant |
| `t3vps` | Mac helper: tunnel + open browser |
| `t3-dedupe.sh` | Kill orphan desktop-spawned T3 (use carefully) |

Current production bind (manual override on VPS):

```bash
t3 serve --host 100.127.22.69 --port 3773 --base-dir ~/.t3
```

Check status:

```bash
systemctl --user status t3code.service
ss -tlnp | grep 3773
ps aux | grep 't3 serve'
```

You want **one** `t3 serve` process (the systemd one on `100.127.22.69:3773`).

## Hermes / agents (separate)

Discord Hermes and OpenClaw are separate from T3. Browser automation for Hermes uses `agent-browser` on the VPS (`AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage` in `~/.hermes/.env`).
