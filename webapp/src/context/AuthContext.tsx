import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase";

// ── Types ──────────────────────────────────────────────────────────────────────

export type UserProfile = {
  uid: string;
  type: "user" | "admin";
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  /** Preferred language for voice coaching sessions (e.g. "English", "Hindi", "Hinglish") */
  coachLanguage?: string;
  createdAt: unknown; // Firestore FieldValue / Timestamp
  lastLoginAt: unknown;
};

type AuthContextValue = {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (changes: Partial<UserProfile>) => Promise<void>;
};

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const prof = await fetchOrCreateProfile(firebaseUser);
        setProfile(prof);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Fetch profile in the background without blocking navigation
    fetchOrCreateProfile(result.user).then(setProfile).catch(console.error);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
  };

  const updateProfile = async (changes: Partial<UserProfile>) => {
    if (!user) return;
    const ref = doc(db, "user_profile", user.uid);
    await setDoc(ref, changes, { merge: true });
    setProfile((prev) => (prev ? { ...prev, ...changes } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchOrCreateProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const ref = doc(db, "user_profile", firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Update last login time
    await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
    return snap.data() as UserProfile;
  }

  const newProfile: UserProfile = {
    uid: firebaseUser.uid,
    type: "user",
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    photoURL: firebaseUser.photoURL,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(ref, newProfile);
  return newProfile;
}
