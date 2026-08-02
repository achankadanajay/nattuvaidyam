import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbVJq33hO7zFHAAFePuXZ2YyKFzWqH8-U",
  authDomain: "nattuvaidyam.in",
  projectId: "nattuvaidyamin",
  storageBucket: "nattuvaidyamin.firebasestorage.app",
  messagingSenderId: "200867729800",
  appId: "1:200867729800:web:f558590fec3af22dbdaa3d",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    throw error;
  }
}

export function signOutUser() {
  return signOut(auth);
}
