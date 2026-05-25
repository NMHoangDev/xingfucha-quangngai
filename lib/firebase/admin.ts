import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizePrivateKey(value?: string) {
  return value?.replace(/\\n/g, "\n");
}

function getServiceAccountFromPath() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!configuredPath) return null;

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_PATH_NOT_FOUND:${absolutePath}`,
    );
  }

  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_INVALID");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

function getAdminApp() {
  if (getApps().length) {
    return getApps()[0]!;
  }

  const serviceAccount = getServiceAccountFromPath();
  const projectId =
    serviceAccount?.projectId ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail =
    serviceAccount?.clientEmail ?? process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey =
    serviceAccount?.privateKey ??
    normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_ADMIN_NOT_CONFIGURED:Provide FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY",
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getFirebaseAdminDb() {
  return getFirestore(getAdminApp());
}
