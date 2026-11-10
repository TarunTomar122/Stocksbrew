"""Ingestion and compute jobs for the agent surfaces (follow, strategies, markets).

Everything here is standard library only, so a job runs the same on the VPS
(direct SQLite through LOCALDB_PATH) and on a laptop (HTTP through
LOCALDB_URL and LOCALDB_API_TOKEN).
"""
