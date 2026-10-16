import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyByw2cQQXcWjVl2ESpiPJ32-6VLETvBOx0",
  authDomain: "sibiya-ai.firebaseapp.com",
  projectId: "sibiya-ai",
  storageBucket: "sibiya-ai.firebasestorage.app",
  messagingSenderId: "583063810870",
  appId: "1:583063810870:web:5f0f98ad215c8fe15b7997",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function watchAuth(onUser, onError) {
  return onAuthStateChanged(auth, u => {
    if (u) onUser(u);
    else signInAnonymously(auth).catch(onError);
  });
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export async function getToken() {
  if (!auth.currentUser) throw new Error("not signed in");
  return auth.currentUser.getIdToken();
}
