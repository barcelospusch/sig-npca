import "server-only";
import { initializeServerApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Uses the signed-in user's session and Firestore rules, with no service account.
export async function getFirebaseSession(request) {
  const authIdToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!authIdToken) {
    const error = new Error("Autenticação necessária.");
    error.code = "auth/missing-token";
    throw error;
  }
  const app = initializeServerApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }, { authIdToken, releaseOnDeref: request });
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) {
    const error = new Error("Sua sessão expirou. Entre novamente.");
    error.code = "auth/invalid-session";
    throw error;
  }
  return { user: auth.currentUser, db: getFirestore(app) };
}
