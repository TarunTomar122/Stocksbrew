import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function toQuery(searchParams: Props["searchParams"]): string {
  if (!searchParams) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      query.set(key, value);
    }
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export default function LegacyProfileSubscribePage({ searchParams }: Props) {
  redirect(`/subscribe${toQuery(searchParams)}`);
}

