'use client';
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../../../lib/firebase";

export default function JoinGroup() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code;
  const [status, setStatus] = useState("Checking invite...");

  useEffect(() => {
    if (!code) return;
    const cleanCode = String(code).toLowerCase().trim();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus("Please sign in to join");
        localStorage.setItem("pending_join_code", cleanCode);
        router.push(`/?join=${cleanCode}`);
        return;
      }

      try {
        setStatus(`Joining ${cleanCode}...`);
        const groupRef = doc(db, "groups", cleanCode);
        const snap = await getDoc(groupRef);

        if (!snap.exists()) {
          setStatus("Group not found - invalid code");
          return;
        }

        await updateDoc(groupRef, {
          members: arrayUnion(user.uid),
          memberEmails: arrayUnion(user.email || ""),
        });

        setStatus("Joined! Redirecting...");
        router.push(`/?room=${cleanCode}`);
      } catch (err) {
        console.error(err);
        setStatus("Failed to join: " + err.message);
      }
    });

    return () => unsub();
  }, [code, router]);

  return (
    <div style={{ padding: 40, textAlign: "center", background: "#0a0a0a", color: "white", minHeight: "100vh" }}>
      <h2>SIBIYA AI</h2>
      <p>{status}</p>
      <p style={{ opacity: 0.7 }}>Code: {code}</p>
    </div>
  );
}
