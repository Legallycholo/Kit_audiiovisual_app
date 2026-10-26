import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
} from "firebase/auth";

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

function auth() {
  const app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
// KIT keeps its own server session, so the Firebase session is only used once.
async function exchange(user: { getIdToken: () => Promise<string> }) {
  const idToken = await user.getIdToken();
  await signOut(auth());
  return idToken;
}
export async function firebaseEmailSignIn(email: string, password: string) {
  const { user } = await signInWithEmailAndPassword(auth(), email, password);
  return exchange(user);
}
export async function firebaseGoogleSignIn() {
  const { user } = await signInWithPopup(auth(), new GoogleAuthProvider());
  return exchange(user);
}
export async function firebasePhoneStart(
  phone: string,
  container: HTMLElement,
) {
  const verifier = new RecaptchaVerifier(auth(), container, {
    size: "invisible",
  });
  try {
    return await signInWithPhoneNumber(auth(), phone, verifier);
  } finally {
    verifier.clear();
  }
}
export async function firebasePhoneConfirm(
  result: ConfirmationResult,
  code: string,
) {
  const { user } = await result.confirm(code);
  return exchange(user);
}
export type { ConfirmationResult };
