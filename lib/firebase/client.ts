"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyCFdi8ig-G1froW_vU-SJlJEY5OtndAySA",
  authDomain: "hp-task.firebaseapp.com",
  databaseURL: "https://hp-task-default-rtdb.firebaseio.com",
  projectId: "hp-task",
  storageBucket: "hp-task.firebasestorage.app",
  messagingSenderId: "966333030018",
  appId: "1:966333030018:web:c5bab478f33773114e9e9b",
  measurementId: "G-Q0QF5SEES1",
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
  );
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }
  return getApp();
}

export async function initFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;
  if (!firebaseConfig.measurementId) return null;

  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const { isSupported, getAnalytics } = await import("firebase/analytics");
    if (!(await isSupported())) return null;
    return getAnalytics(app);
  } catch {
    return null;
  }
}
