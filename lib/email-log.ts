import { adminFirestore } from "@/lib/firebase-admin";

export async function logEmailSend(params: {
  uid: string;
  email: string;
  emailType: string;
  subject: string;
  dedupeKey?: string;
  triggerType?: string | null;
  triggerId?: string | null;
  meta?: Record<string, unknown>;
}) {
  await adminFirestore.collection("tm_email_sends").add({
    uid: params.uid,
    email: params.email,
    email_type: params.emailType,
    dedupe_key: params.dedupeKey ?? params.emailType,
    subject: params.subject,
    status: "sent",
    trigger_type: params.triggerType ?? null,
    trigger_id: params.triggerId ?? null,
    meta: params.meta ?? {},
    sent_at: new Date().toISOString(),
  });
}
