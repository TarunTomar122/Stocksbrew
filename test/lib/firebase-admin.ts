import fs from "fs";
import path from "path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

function loadEnv(): void {
  const cwd = process.cwd();
  const rootDir = path.resolve(cwd, "..");

  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));

  loadEnvFile(path.join(rootDir, ".env.local"));
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, "backend", ".env"));
}

function resolveServiceAccountPath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  const cwd = process.cwd();
  const rootDir = path.resolve(cwd, "..");

  const candidates = [
    path.resolve(cwd, value),
    path.resolve(rootDir, value),
    path.resolve(rootDir, "backend", value),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

loadEnv();

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

const _fs = getFirestore();
try {
  _fs.settings({ ignoreUndefinedProperties: true });
} catch {
  // settings() throws if already called.
}

export const adminFirestore = _fs;
