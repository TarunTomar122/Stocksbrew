/**
 * The box's health for the owner's System tab (/admin/analytics?tab=system).
 *
 * backend/ops/health.py runs every 5 minutes on the VPS (tikrr-ops-health.timer) and writes two documents:
 *
 *   tm_ops_health/latest    the last run in full: checks, system numbers, services, LocalDB read metrics,
 *                           traffic from Caddy's log, a 24 h journal summary per job and per agent data step,
 *                           the last backup, and the alert state
 *   tm_ops_health/history   one compact line per run for the last 24 hours (a letter per check)
 *
 * Nothing in them identifies a visitor: no IP, query string, user id or token (health.py strips them). This
 * module reads both, checks their shape, and folds the history into the strip the page draws. Admin only: the
 * page calls it after verifying the admin cookie.
 */

export type OpsStatus = "ok" | "warn" | "fail" | "unknown";

export type OpsCheck = {
  id: string;
  group: string;
  label: string;
  status: OpsStatus;
  detail: string;
  ms?: number;
  feeds?: string;
  written_at?: string;
};

export type OpsJob = {
  unit: string;
  runs: number;
  failures: number;
  median_s: number | null;
  p95_s: number | null;
  max_s: number | null;
  cpu_s: number;
  mem_peak: number;
  last_at: string | null;
  last_failed_at: string | null;
  last_ok: boolean;
};

export type OpsStep = {
  group: string;
  step: string;
  runs: number;
  failures: number;
  median_s: number | null;
  max_s: number | null;
  last_s: number | null;
  last_ok: boolean;
  last_at: string | null;
};

export type OpsTraffic = {
  requests: number;
  errors_5xx: number;
  error_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  cache_hit_rate: number | null;
  top_5xx: Array<{ path: string; count: number }>;
};

export type OpsCollection = { name: string; count: number | null; docs: number | null; bytes: number | null; p50_ms: number | null; p95_ms: number | null; max_ms: number | null };

export type OpsLatest = {
  generated_at: string;
  overall: OpsStatus;
  checks: OpsCheck[];
  system: {
    mem_total: number;
    mem_available: number;
    swap_total: number;
    swap_used: number;
    load: number[];
    cpus: number;
    disks: Array<{ mount: string; label: string; free: number; total: number }>;
  };
  services: Array<{ name: string; memory: number | null; cpu_pct: number | null }>;
  localdb: { window_s?: number; totals?: Partial<OpsCollection>; collections?: OpsCollection[]; error?: string } | null;
  traffic: { last_5m?: OpsTraffic; last_15m?: OpsTraffic; last_60m?: OpsTraffic };
  jobs: OpsJob[];
  steps: OpsStep[];
  backup: {
    ok: boolean;
    at: string | null;
    error: string | null;
    last_ok_at: string | null;
    compressed_bytes: number | null;
    backup_bytes: number | null;
    documents: number | null;
    timings: Record<string, number> | null;
    dailies: number | null;
    weeklies: number | null;
  } | null;
  alert: { enabled?: boolean; would_send?: { subject: string; at: string } | null; last_sent_at?: string | null } | null;
  took_ms: number | null;
};

export type OpsHistoryEntry = { t: string; o: string; c: Record<string, string>; r?: number | null; e?: number | null; p?: number | null };

export type OpsHealth = { latest: OpsLatest | null; history: OpsHistoryEntry[] };

const STATUSES: readonly OpsStatus[] = ["ok", "warn", "fail", "unknown"];
const LETTER: Record<string, OpsStatus> = { g: "ok", a: "warn", r: "fail", u: "unknown" };
const RANK: Record<OpsStatus, number> = { ok: 0, unknown: 1, warn: 2, fail: 3 };

/** The health job runs every 5 minutes: older than this, the page says the checks themselves stopped. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function status(value: unknown): OpsStatus {
  return STATUSES.includes(value as OpsStatus) ? (value as OpsStatus) : "unknown";
}

function traffic(value: unknown): OpsTraffic | undefined {
  const t = obj(value);
  if (num(t.requests) == null) return undefined;
  return {
    requests: num(t.requests) ?? 0,
    errors_5xx: num(t.errors_5xx) ?? 0,
    error_rate: num(t.error_rate),
    p50_ms: num(t.p50_ms),
    p95_ms: num(t.p95_ms),
    cache_hit_rate: num(t.cache_hit_rate),
    top_5xx: arr(t.top_5xx)
      .map((row) => ({ path: str(obj(row).path) ?? "", count: num(obj(row).count) ?? 0 }))
      .filter((row) => row.path),
  };
}

/** The stored document, shape-checked. Null when it is missing or not ours. */
export function parseLatest(raw: unknown): OpsLatest | null {
  const doc = obj(raw);
  const generated = str(doc.generated_at);
  if (!generated || !Array.isArray(doc.checks)) return null;
  const system = obj(doc.system);
  const backup = doc.backup == null ? null : obj(doc.backup);
  const localdb = doc.localdb == null ? null : obj(doc.localdb);
  const alert = doc.alert == null ? null : obj(doc.alert);
  const wouldSend = alert ? obj(alert.would_send) : {};
  return {
    generated_at: generated,
    overall: status(doc.overall),
    checks: arr(doc.checks)
      .map((row) => {
        const c = obj(row);
        return {
          id: str(c.id) ?? "",
          group: str(c.group) ?? "other",
          label: str(c.label) ?? str(c.id) ?? "",
          status: status(c.status),
          detail: str(c.detail) ?? "",
          ms: num(c.ms) ?? undefined,
          feeds: str(c.feeds) ?? undefined,
          written_at: str(c.written_at) ?? undefined,
        };
      })
      .filter((c) => c.id),
    system: {
      mem_total: num(system.mem_total) ?? 0,
      mem_available: num(system.mem_available) ?? 0,
      swap_total: num(system.swap_total) ?? 0,
      swap_used: num(system.swap_used) ?? 0,
      load: arr(system.load).map((x) => num(x) ?? 0),
      cpus: num(system.cpus) ?? 1,
      disks: arr(system.disks).map((row) => {
        const d = obj(row);
        return { mount: str(d.mount) ?? "", label: str(d.label) ?? str(d.mount) ?? "", free: num(d.free) ?? 0, total: num(d.total) ?? 0 };
      }),
    },
    services: arr(doc.services)
      .map((row) => {
        const s = obj(row);
        return { name: str(s.name) ?? "", memory: num(s.memory), cpu_pct: num(s.cpu_pct) };
      })
      .filter((s) => s.name),
    localdb: localdb
      ? {
          window_s: num(localdb.window_s) ?? undefined,
          error: str(localdb.error) ?? undefined,
          totals: { count: num(obj(localdb.totals).count), docs: num(obj(localdb.totals).docs), bytes: num(obj(localdb.totals).bytes), p95_ms: num(obj(localdb.totals).p95_ms) },
          collections: arr(localdb.collections)
            .map((row) => {
              const c = obj(row);
              return { name: str(c.name) ?? "", count: num(c.count), docs: num(c.docs), bytes: num(c.bytes), p50_ms: num(c.p50_ms), p95_ms: num(c.p95_ms), max_ms: num(c.max_ms) };
            })
            .filter((c) => c.name),
        }
      : null,
    traffic: { last_5m: traffic(obj(doc.traffic).last_5m), last_15m: traffic(obj(doc.traffic).last_15m), last_60m: traffic(obj(doc.traffic).last_60m) },
    jobs: arr(doc.jobs)
      .map((row) => {
        const j = obj(row);
        return {
          unit: str(j.unit) ?? "",
          runs: num(j.runs) ?? 0,
          failures: num(j.failures) ?? 0,
          median_s: num(j.median_s),
          p95_s: num(j.p95_s),
          max_s: num(j.max_s),
          cpu_s: num(j.cpu_s) ?? 0,
          mem_peak: num(j.mem_peak) ?? 0,
          last_at: str(j.last_at),
          last_failed_at: str(j.last_failed_at),
          last_ok: j.last_ok !== false,
        };
      })
      .filter((j) => j.unit),
    steps: arr(doc.steps)
      .map((row) => {
        const s = obj(row);
        return {
          group: str(s.group) ?? "",
          step: str(s.step) ?? "",
          runs: num(s.runs) ?? 0,
          failures: num(s.failures) ?? 0,
          median_s: num(s.median_s),
          max_s: num(s.max_s),
          last_s: num(s.last_s),
          last_ok: s.last_ok !== false,
          last_at: str(s.last_at),
        };
      })
      .filter((s) => s.step),
    backup: backup
      ? {
          ok: backup.ok === true,
          at: str(backup.at),
          error: str(backup.error),
          last_ok_at: str(backup.last_ok_at),
          compressed_bytes: num(backup.compressed_bytes),
          backup_bytes: num(backup.backup_bytes),
          documents: num(backup.documents),
          timings: Object.fromEntries(Object.entries(obj(backup.timings)).filter(([, v]) => num(v) != null)) as Record<string, number>,
          dailies: num(backup.dailies),
          weeklies: num(backup.weeklies),
        }
      : null,
    alert: alert
      ? {
          enabled: alert.enabled === true,
          would_send: str(wouldSend.subject) ? { subject: str(wouldSend.subject)!, at: str(wouldSend.at) ?? "" } : null,
          last_sent_at: str(alert.last_sent_at),
        }
      : null,
    took_ms: num(doc.took_ms),
  };
}

export function parseHistory(raw: unknown): OpsHistoryEntry[] {
  return arr(obj(raw).entries)
    .map((row) => {
      const e = obj(row);
      const c = obj(e.c);
      return {
        t: str(e.t) ?? "",
        o: str(e.o) ?? "u",
        c: Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === "string")) as Record<string, string>,
        r: num(e.r),
        e: num(e.e),
        p: num(e.p),
      };
    })
    .filter((e) => e.t && Number.isFinite(Date.parse(e.t)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function worstOf(statuses: Iterable<OpsStatus>): OpsStatus {
  let out: OpsStatus | null = null;
  for (const s of statuses) if (out == null || RANK[s] > RANK[out]) out = s;
  return out ?? "unknown";
}

/**
 * The last 24 hours as `buckets` slots per row (oldest first): the worst status any run in that slot had, or null
 * where no run landed (the job was not running). Row "overall" first, then each check id in `ids`.
 */
export function stripRows(history: OpsHistoryEntry[], ids: readonly string[], now: number, buckets = 96, hours = 24): Array<{ id: string; cells: Array<OpsStatus | null> }> {
  const span = hours * 3600 * 1000;
  const start = now - span;
  const width = span / buckets;
  const rows = ["overall", ...ids].map((id) => ({ id, cells: new Array<OpsStatus | null>(buckets).fill(null) }));
  for (const entry of history) {
    const at = Date.parse(entry.t);
    if (!(at > start && at <= now)) continue;
    const slot = Math.min(buckets - 1, Math.floor((at - start) / width));
    rows.forEach((row) => {
      const letter = row.id === "overall" ? entry.o : entry.c[row.id];
      if (!letter) return;
      const value = LETTER[letter] ?? "unknown";
      const current = row.cells[slot];
      row.cells[slot] = current == null ? value : worstOf([current, value]);
    });
  }
  return rows;
}

/** Share of the last 24 h's runs that were all green (null without history). */
export function greenShare(history: OpsHistoryEntry[], now: number, hours = 24): number | null {
  const since = now - hours * 3600 * 1000;
  const recent = history.filter((e) => Date.parse(e.t) > since);
  if (!recent.length) return null;
  return recent.filter((e) => e.o === "g").length / recent.length;
}

export const GROUP_LABELS: Record<string, string> = {
  site: "Site",
  services: "Services",
  traffic: "Traffic",
  data: "Data",
  box: "Box",
};

export function groupChecks(checks: OpsCheck[]): Array<{ group: string; label: string; checks: OpsCheck[] }> {
  const order = Object.keys(GROUP_LABELS);
  const groups = new Map<string, OpsCheck[]>();
  for (const check of checks) groups.set(check.group, [...(groups.get(check.group) ?? []), check]);
  return [...groups.entries()]
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(([group, list]) => ({ group, label: GROUP_LABELS[group] ?? group, checks: list }));
}

/** "tikrr-agentdata-frequent.service" -> "agentdata-frequent". */
export function unitName(unit: string): string {
  return unit.replace(/^tikrr-/, "").replace(/\.service$/, "");
}

export async function loadOpsHealth(): Promise<OpsHealth> {
  const { adminFirestore } = await import("@/lib/firebase-admin");
  const collection = adminFirestore.collection("tm_ops_health");
  const [latest, history] = await Promise.all([collection.doc("latest").get(), collection.doc("history").get()]);
  return { latest: parseLatest(latest.exists ? latest.data() : null), history: parseHistory(history.exists ? history.data() : null) };
}
