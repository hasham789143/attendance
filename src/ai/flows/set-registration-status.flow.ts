
'use server';
/**
 * @fileOverview A secure flow for administrators to enable or disable user registration.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, App } from 'firebase-admin/app';

const SetRegistrationStatusInputSchema = z.object({
  isOpen: z.boolean().describe('Whether new user registration should be open or closed.'),
  adminUid: z.string().describe('The UID of the user attempting to perform this action.'),
});
export type SetRegistrationStatusInput = z.infer<typeof SetRegistrationStatusInputSchema>;

// Initialize Firebase Admin SDK if it hasn't been already.
function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }
  // This will use the default service account credentials from the environment.
  return initializeApp();
}

/**
 * Verifies if a user has the 'admin' role via custom claims.
 * As a failsafe for the primary admin, it can also assign the claim.
 */
async function verifyAdmin(uid: string): Promise<boolean> {
    try {
        const app = getAdminApp();
        const auth = getAuth(app);
        const userRecord = await auth.getUser(uid);

        // Check for custom claim. This is the secure way to verify an admin.
        if (userRecord.customClaims?.['role'] === 'admin') {
            return true;
        }

        // Failsafe: If the user is the designated admin email and doesn't have the claim, set it.
        // This is a one-time setup for the primary admin account.
        if (userRecord.email === 'admin@gmail.com') {
            await auth.setCustomUserClaims(uid, { role: 'admin' });
            // The new claim will be available on the user's ID token the next time they sign in
            // or after the current token expires (1 hour). For immediate effect, the user would
            // need to re-authenticate, but for this flow, we can proceed.
            return true; 
        }

        return false;
    } catch (error) {
        console.error("Error verifying admin status:", error);
        return false;
    }
}


export async function setRegistrationStatus(
  input: SetRegistrationStatusInput
): Promise<void> {
  return setRegistrationStatusFlow(input);
}


const setRegistrationStatusFlow = ai.defineFlow(
  {
    name: 'setRegistrationStatusFlow',
    inputSchema: SetRegistrationStatusInputSchema,
    outputSchema: z.void(),
    // This flow uses the Admin SDK, so it must not be exposed to the client directly.
    // It should only be called from a trusted server environment.
  },
  async (input) => {

    const isVerifiedAdmin = await verifyAdmin(input.adminUid);

    if (!isVerifiedAdmin) {
        throw new Error('Permission denied. User is not an administrator.');
    }

    const app = getAdminApp();
    const firestore = getFirestore(app);

    await firestore.collection('settings').doc('attendance').set(
        {
          isRegistrationOpen: input.isOpen,
        },
        { merge: true }
      );
  }
);

