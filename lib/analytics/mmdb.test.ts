import { MmdbReader, parseIp } from "@/lib/analytics/mmdb";

/**
 * A tiny MaxMind DB built here, byte by byte (IPv6 tree, 24-bit records), so
 * the reader is tested on a real file layout without shipping db-ip's 8 MB one.
 */

const enc = new TextEncoder();

function ctrl(type: number, size: number): number[] {
  if (size >= 29) throw new Error("fixture sizes stay small");
  return type <= 7 ? [(type << 5) | size] : [size, type - 7];
}

function uint(type: number, n: number): number[] {
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return [...ctrl(type, bytes.length), ...bytes];
}

type V = string | number | V[] | { [key: string]: V } | { uint16: number } | { pointer: number };

function encode(value: V): number[] {
  if (typeof value === "string") {
    const bytes = Array.from(enc.encode(value));
    return [...ctrl(2, bytes.length), ...bytes];
  }
  if (typeof value === "number") return uint(6, value);
  if (Array.isArray(value)) return [...ctrl(11, value.length), ...value.flatMap(encode)];
  if ("uint16" in value && typeof value.uint16 === "number") return uint(5, value.uint16);
  if ("pointer" in value && typeof value.pointer === "number") return [(1 << 5) | ((value.pointer >> 8) & 0x7), value.pointer & 0xff];
  const entries = Object.entries(value as Record<string, V>);
  return [...ctrl(7, entries.length), ...entries.flatMap(([k, v]) => [...encode(k), ...encode(v)])];
}

function v4(ip: string): number[] {
  return [...new Array(10).fill(0), 0, 0, ...ip.split(".").map(Number)];
}

function v6(bytes: number[]): number[] {
  return [...bytes, ...new Array(16 - bytes.length).fill(0)];
}

type Rec = { kind: "node"; at: number } | { kind: "data"; at: number } | null;

function buildDb(networks: Array<{ bytes: number[]; prefix: number; data: number[] }>): Uint8Array {
  const data: number[] = [];
  const nodes: Array<[Rec, Rec]> = [[null, null]];
  for (const net of networks) {
    const offset = data.length;
    data.push(...net.data);
    let node = 0;
    for (let i = 0; i < net.prefix; i += 1) {
      const bit = (net.bytes[i >> 3]! >> (7 - (i & 7))) & 1;
      if (i === net.prefix - 1) {
        nodes[node]![bit] = { kind: "data", at: offset };
        break;
      }
      const next = nodes[node]![bit];
      if (next?.kind === "node") node = next.at;
      else {
        nodes.push([null, null]);
        nodes[node]![bit] = { kind: "node", at: nodes.length - 1 };
        node = nodes.length - 1;
      }
    }
  }
  const count = nodes.length;
  const value = (rec: Rec) => (rec == null ? count : rec.kind === "node" ? rec.at : count + 16 + rec.at);
  const tree = nodes.flatMap(([l, r]) => {
    const a = value(l);
    const b = value(r);
    return [(a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff, (b >> 16) & 0xff, (b >> 8) & 0xff, b & 0xff];
  });
  const meta = encode({
    node_count: count,
    record_size: { uint16: 24 },
    ip_version: { uint16: 6 },
    database_type: "Fixture-Country",
    binary_format_major_version: { uint16: 2 },
    binary_format_minor_version: { uint16: 0 },
    languages: ["en"],
    description: { en: "test fixture" },
  });
  const marker = [0xab, 0xcd, 0xef, ...Array.from(enc.encode("MaxMind.com"))];
  return new Uint8Array([...tree, ...new Array(16).fill(0), ...data, ...marker, ...meta]);
}

// The first record's "country" key starts at byte 1 of the data section (after the map's control byte);
// the German record points at it instead of repeating it, as real databases do.
const US = encode({ country: { iso_code: "US", names: { en: "United States" } } });
const GB = encode({ country: { iso_code: "GB" } });
const IN = encode({ country: { iso_code: "IN" } });
const DE = [...ctrl(7, 1), ...encode({ pointer: 1 }), ...encode({ iso_code: "DE" })];

const db = buildDb([
  { bytes: v4("8.8.8.0"), prefix: 96 + 24, data: US },
  { bytes: v4("81.2.69.0"), prefix: 96 + 24, data: GB },
  { bytes: v4("49.36.0.0"), prefix: 96 + 16, data: IN },
  { bytes: v6([0x20, 0x01, 0x0d, 0xb8]), prefix: 32, data: DE },
]);

describe("mmdb reader", () => {
  const reader = new MmdbReader(db);

  it("reads the metadata", () => {
    expect(reader.metadata.database_type).toBe("Fixture-Country");
    expect(reader.metadata.ip_version).toBe(6);
    expect(reader.metadata.record_size).toBe(24);
    expect(reader.metadata.languages).toEqual(["en"]);
  });

  it("finds the country of known IPv4 addresses", () => {
    expect(reader.country("8.8.8.8")).toBe("US");
    expect(reader.country("8.8.8.255")).toBe("US");
    expect(reader.country("81.2.69.142")).toBe("GB");
    expect(reader.country("49.36.200.1")).toBe("IN");
  });

  it("reads IPv6, IPv4-mapped addresses and pointers", () => {
    expect(reader.country("2001:db8::1")).toBe("DE");
    expect(reader.country("2001:0db8:ffff::")).toBe("DE");
    expect(reader.country("::ffff:8.8.8.8")).toBe("US");
    expect(reader.get("8.8.8.8")).toEqual({ country: { iso_code: "US", names: { en: "United States" } } });
  });

  it("says null for addresses it has no data for, and for things that are not addresses", () => {
    expect(reader.country("8.8.9.1")).toBeNull();
    expect(reader.country("127.0.0.1")).toBeNull();
    expect(reader.country("2001:db9::1")).toBeNull();
    expect(reader.country("unknown")).toBeNull();
    expect(reader.country("")).toBeNull();
    expect(reader.country("300.1.1.1")).toBeNull();
  });

  it("refuses a file that is not a MaxMind DB", () => {
    expect(() => new MmdbReader(new Uint8Array(64))).toThrow(/metadata/);
  });
});

describe("parseIp", () => {
  it("parses IPv4, IPv6 and their mixed forms", () => {
    expect(Array.from(parseIp("1.2.3.4")!)).toEqual([1, 2, 3, 4]);
    expect(parseIp("::1")!.length).toBe(16);
    expect(Array.from(parseIp("::ffff:1.2.3.4")!)).toEqual([1, 2, 3, 4]);
    expect(Array.from(parseIp("2001:db8::")!).slice(0, 4)).toEqual([0x20, 0x01, 0x0d, 0xb8]);
    expect(parseIp("[2001:db8::1]")!.length).toBe(16);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["1.2.3", "1.2.3.4.5", "a.b.c.d", "1::2::3", "12345::", "1:2:3:4:5:6:7:8:9"]) expect(parseIp(bad)).toBeNull();
  });
});
