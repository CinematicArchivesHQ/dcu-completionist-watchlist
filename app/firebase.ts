import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD7GFSk6jJZ2dyPgwZJH9gbKv6aPZ7UMZ4",
  authDomain: "cinematic-archives-hq.firebaseapp.com",
  projectId: "cinematic-archives-hq",
  storageBucket: "cinematic-archives-hq.firebasestorage.app",
  messagingSenderId: "568480330615",
  appId: "1:568480330615:web:e4e24f316e6a8a78912772",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export type AuthUser = User;

export type CloudArchive = {
  schemaVersion: number;
  archiveId: "hall-of-justice";
  appVersion: string;
  catalogVersion: string;
  updatedAt: string;
  activeProfileId: string;
  profiles: unknown[];
  preferences?: {
    hideSpoilers?: boolean;
    hideWatched?: boolean;
  };
  achievementsSeen?: Record<string, string[]>;
};

function archiveDocument(uid: string) {
  return doc(db, "users", uid, "archives", "hall-of-justice");
}

export function observeAuth(callback: (user: AuthUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  await setPersistence(auth, browserLocalPersistence);
  return (await signInWithPopup(auth, provider)).user;
}

export function signOutGoogle() {
  return signOut(auth);
}

export async function readCloudArchive(uid: string): Promise<CloudArchive | null> {
  const snapshot = await getDoc(archiveDocument(uid));
  return snapshot.exists() ? snapshot.data() as CloudArchive : null;
}

export async function writeCloudArchive(uid: string, archive: CloudArchive) {
  // JSON round-tripping removes undefined values, which Firestore rejects.
  const safeArchive = JSON.parse(JSON.stringify(archive)) as CloudArchive;
  await setDoc(archiveDocument(uid), {
    ...safeArchive,
    serverUpdatedAt: serverTimestamp(),
  });
}

export function deleteCloudArchive(uid: string) {
  return deleteDoc(archiveDocument(uid));
}
