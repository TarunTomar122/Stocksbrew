import fs from "fs";
import path from "path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { localFirestoreFromEnv } from "@/lib/local-firestore";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) {
      continue;
    }

    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadTraceMoneyEnv(): void {
  const rootDir = process.cwd();
  loadEnvFile(path.join(rootDir, ".env.local"));
  loadEnvFile(path.join(rootDir, ".env.vps.local"));
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, "backend", ".env"));
}

function resolveServiceAccountPath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(process.cwd(), "backend", value);
}

loadTraceMoneyEnv();

if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (!serviceAccountJson && !serviceAccountPath) {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH");
  }

  const serviceAccount = serviceAccountJson
    ? JSON.parse(serviceAccountJson)
    : JSON.parse(fs.readFileSync(resolveServiceAccountPath(serviceAccountPath || ""), "utf-8"));

  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const localFirestore = localFirestoreFromEnv();
const firestoreBackend = process.env.FIRESTORE_BACKEND?.trim().toLowerCase();
if (!localFirestore && firestoreBackend !== "firebase") {
  throw new Error("Set LOCALDB_URL and LOCALDB_API_TOKEN for the database, or FIRESTORE_BACKEND=firebase for an explicit rollback");
}

const _fs = localFirestore || getFirestore();
if (!localFirestore) {
  try {
    getFirestore().settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() throws if already called - safe to ignore on HMR re-evaluation
  }
}
export const adminFirestore = _fs as unknown as Firestore;
export const adminAuth = getAuth();
