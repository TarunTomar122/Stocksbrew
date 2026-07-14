#!/usr/bin/env python3
"""Migrate Steve (OpenClaw) knowledge into Hermes and prepare for gateway shutdown."""
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

hermes_mem = Path.home() / ".hermes/memories/MEMORY.md"
hermes_user = Path.home() / ".hermes/memories/USER.md"
archive = Path.home() / ".hermes/archive/steve-openclaw"
steve_ws = Path.home() / ".openclaw/workspace"
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

archive.mkdir(parents=True, exist_ok=True)
for name in [
    "MEMORY.md",
    "USER.md",
    "SOUL.md",
    "IDENTITY.md",
    "AGENTS.md",
    "TOOLS.md",
    "GITHUB.md",
    "sponsor-tracking.json",
    "outreach_config.json",
    "outreach_results.json",
    "influencer-outreach-tracking.json",
    "sponsor-outreach-guide.md",
    "shared-journal-readme.md",
]:
    src = steve_ws / name
    if src.exists():
        shutil.copy2(src, archive / name)

mem_src = steve_ws / "memory"
if mem_src.exists():
    mem_dst = archive / "memory"
    if mem_dst.exists():
        shutil.rmtree(mem_dst)
    shutil.copytree(mem_src, mem_dst)
print(f"Archived Steve files to {archive}")

mem = hermes_mem.read_text()
mem = re.sub(
    r"Shared agent journal at.*?shared-journal-readme\.md\.\n§\n",
    "",
    mem,
    flags=re.S,
)
mem = re.sub(
    r"Shared agent journal at.*?shared-journal-readme\.md\.\n",
    "",
    mem,
    flags=re.S,
)

new_entries = [
    "Steve (OpenClaw agent) retired 2026-07-11. Gateway disabled. Full archive: ~/.hermes/archive/steve-openclaw/ and preserved workspace ~/.openclaw/workspace/. Shared journal history: ~/.hermes/shared/agent-journal.md.",
    "Embedding server is DEAD by Tarun's explicit order (2026-07-10). systemd disabled — DO NOT restart.",
    "SearXNG search: Docker container `searxng` on localhost:8888. If web_search breaks, check port 8888 is not hijacked.",
    "Steve sponsor outreach state: ~/.openclaw/workspace/sponsor-tracking.json, outreach_config.json, outreach_results.json, sponsor-outreach-guide.md. Hermes cron daily-sponsor-outreach + references/tarat-outreach-state.md is the live pipeline.",
    "Steve grants/hackathon scans archived under ~/.hermes/archive/steve-openclaw/memory/grants-hackathons-scan-*.md",
]
for entry in new_entries:
    marker = entry[:50]
    if marker not in mem:
        mem = mem.rstrip() + "\n§\n" + entry + "\n"
hermes_mem.write_text(mem)
print("Updated Hermes MEMORY.md")

user = hermes_user.read_text()
extras = []
if "656484722943328286" not in user:
    extras.append(
        "Discord ID: 656484722943328286 (tarat / tarat3717). Email: tomartarun2001@gmail.com."
    )
if "weakness" not in user.lower():
    extras.append(
        "Self-identified gaps: moves on from projects too fast, implementation > deep research, Bayesian ML depth, no papers yet. Revenue baseline ~$66-76/mo self-funded."
    )
if "llms.txt" not in user:
    extras.append(
        "Machine-readable profile: tarat.space/llms.txt — good source to refresh USER.md."
    )
for e in extras:
    user = user.rstrip() + "\n§\n" + e + "\n"
hermes_user.write_text(user)
print("Updated Hermes USER.md")

jobs_path = Path.home() / ".hermes/cron/jobs.json"
jobs = json.loads(jobs_path.read_text())
for job in jobs.get("jobs", []):
    if job.get("name") == "check-steves-journal":
        job["enabled"] = False
        job["state"] = "disabled"
        job["paused_at"] = datetime.now(timezone.utc).isoformat()
        job["paused_reason"] = "Steve (OpenClaw) retired 2026-07-11"
    elif job.get("name") == "daily-journal-entry":
        job["prompt"] = job["prompt"].replace("especially by Steve).", ").")
        job["prompt"] = job["prompt"].replace(
            "If Steve left any questions or blockers for you in recent entries, address them in your entry.\n",
            "",
        )
        job["prompt"] = job["prompt"].replace(
            "**Shoutout to the other agent (optional):**\n   - ...\n", ""
        )
jobs_path.write_text(json.dumps(jobs, indent=2) + "\n")
print("Updated Hermes cron jobs")

cfg = Path.home() / ".hermes/config.yaml"
text = cfg.read_text()
text = text.replace(
    " You can @steve to coordinate with the OpenClaw agent.",
    " Steve (OpenClaw) was retired 2026-07-11; Margo is the sole agent now.",
)
cfg.write_text(text)
print("Updated Hermes config.yaml")

journal = Path.home() / ".hermes/shared/agent-journal.md"
entry = f"""
### {today}

**Agent:** Margo (migration note)
**What happened:**
- Tarun retired Steve (OpenClaw agent). Gateway stopped and disabled.
- Steve's memory/workspace archived to ~/.hermes/archive/steve-openclaw/ (original preserved at ~/.openclaw/workspace/).
- Key facts merged into Hermes MEMORY.md and USER.md.
- Cron job `check-steves-journal` disabled.

**For future Margo:**
- You are now the sole Discord agent on this VPS.
- Read Steve's archive if you need sponsor outreach history, grants scans, or old operational context.
"""
journal.write_text(journal.read_text().rstrip() + "\n" + entry)
print("Appended journal retirement entry")
