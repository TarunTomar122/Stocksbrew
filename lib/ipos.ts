import { adminFirestore } from "@/lib/firebase-admin";

export interface IpoEvent {
  ticker: string;
  company: string;
  ipo_date: string;
  price_range_low: number | null;
  price_range_high: number | null;
  exchange: string;
  captured_at: string;
}

export async function getIpos(
  startDate?: string,
  endDate?: string,
): Promise<IpoEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const from = startDate || today;
  const to = endDate || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const snap = await adminFirestore
    .collection("tm_ipo_events")
    .where("ipo_date", ">=", from)
    .where("ipo_date", "<=", to)
    .orderBy("ipo_date")
    .get();

  return snap.docs.map((d) => d.data() as IpoEvent);
}
