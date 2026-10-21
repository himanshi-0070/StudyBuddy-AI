import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA17whl027INAFkMEDosL93otq_OK66J1s",
  authDomain: "appnova-212c4.firebaseapp.com",
  projectId: "appnova-212c4",
  storageBucket: "appnova-212c4.firebasestorage.app",
  messagingSenderId: "809727697894",
  appId: "1:809727697894:web:e13384905a3000e4922c27",
  measurementId: "G-VCK4SE5PB7",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "asia-south1");

// Lazy load analytics to not block auth
let analytics: any = null;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  }).catch(() => {});
}

export { app, analytics, auth, db, storage, functions };
