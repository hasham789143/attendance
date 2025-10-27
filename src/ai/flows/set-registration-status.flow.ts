
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
  return initializeApp();
}

async function verifyAdmin(uid: string): Promise<boolean> {
    try {
        const app = getAdminApp();
        const auth = getAuth(app);
        const userRecord = await auth.getUser(uid);
        // Check for custom claim. This is more secure.
        const isAdmin = userRecord.customClaims?.['role'] === 'admin';
        if (!isAdmin) {
            // If the user is not an admin via custom claims, let's set it for them
            // This is a temporary measure to fix the user's state.
            // In a real app, this would be done via a separate admin panel or script.
             if (userRecord.email === 'admin@gmail.com') {
                await auth.setCustomUserClaims(uid, { role: 'admin' });
                return true; // Now they are an admin
             }
        }
        return isAdmin;
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
