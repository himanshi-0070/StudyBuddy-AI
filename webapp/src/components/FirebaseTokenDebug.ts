import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

export default function FirebaseTokenDebug() {
  useEffect(() => {
    console.log("TOKEN DEBUG COMPONENT MOUNTED");

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log("Firebase user not signed in yet");
        return;
      }

      console.log("Firebase user detected!");

      try {
        const token = await user.getIdToken(true);

        console.log("TOKEN GENERATED SUCCESSFULLY");
        console.log("Firebase ID Token:", token);

      } catch (error) {
        console.error("TOKEN ERROR:", error);
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
}