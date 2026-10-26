import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export type FirebaseIdentity = {
  uid: string;
  email?: string;
  emailVerified: boolean;
};
export type FirebaseVerifier = (idToken: string) => Promise<FirebaseIdentity>;

/** Verifies Firebase ID tokens against Google's public keys; needs only the project id. */
export function firebaseVerifier(projectId: string): FirebaseVerifier {
  const app =
    getApps().find((a) => a.name === `kit-${projectId}`) ??
    initializeApp({ projectId }, `kit-${projectId}`);
  return async (idToken) => {
    const token = await getAuth(app).verifyIdToken(idToken);
    return {
      uid: token.uid,
      email: token.email,
      emailVerified: token.email_verified === true,
    };
  };
}
