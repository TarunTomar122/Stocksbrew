# GitHub on this VPS

## DO NOT run `gh auth login`

It is interactive and will always fail for agents.

## Git (clone / push / pull) — works via SSH

```bash
git clone git@github.com:TarunTomar122/<repo>.git
git push origin main
ssh -T git@github.com
```

## GitHub CLI (`gh`) — needs a token once

Owner runs from `mosh vps`:

```bash
setup-gh-token github_pat_xxxxxxxx
```

Then agents can use:

```bash
gh pr list
gh pr create
gh issue list
```

## Paths

- SSH key: `~/.ssh/id_ed25519_github`
- Account: TarunTomar122
- Tikrr deploy: `/opt/tikrr`
- Dev clones: `~/projects/`
