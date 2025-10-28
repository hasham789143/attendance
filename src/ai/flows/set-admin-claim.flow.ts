
'use server';
/**
 * @fileOverview A secure flow for an existing admin to grant another user the 'admin' custom claim.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, App, applicationDefault } from 'firebase-admin/app';

const SetAdminClaimInputSchema = z.object({
  uid: z.string().describe("The UID of the user to grant admin privileges."),
  adminUid: z.string().describe("The UID of the user performing this action. This is for verification."),
});
export type SetAdminClaimInput = z.infer<typeof SetAdminClaimInputSchema>;

const SetAdminClaimOutputSchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
});
export type SetAdminClaimOutput = z.infer<typeof SetAdminClaimOutputSchema>;


// Initialize Firebase Admin SDK if it hasn't been already.
function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }
  return initializeApp({
    credential: applicationDefault(),
  });
}

/**
 * Verifies if a user has the 'admin' role via custom claims.
 */
async function verifyAdmin(uid: string): Promise<boolean> {
    try {
        const app = getAdminApp();
        const auth = getAuth(app);
        const userRecord = await auth.getUser(uid);
        
        // This is the special case for the very first admin user to self-elevate.
        if (userRecord.email === 'admin@gmail.com') {
          return true;
        }
        
        return userRecord.customClaims?.['role'] === 'admin';
    } catch (error) {
        console.error("Error verifying admin status:", error);
        return false;
    }
}


export async function setAdminClaim(
  input: SetAdminClaimInput
): Promise<SetAdminClaimOutput> {
  return setAdminClaimFlow(input);
}

const setAdminClaimFlow = ai.defineFlow(
  {
    name: 'setAdminClaimFlow',
    inputSchema: SetAdminClaimInputSchema,
    outputSchema: SetAdminClaimOutputSchema,
  },
  async ({ uid, adminUid }) => {
    
    // An admin must perform this action.
    const isVerifiedAdmin = await verifyAdmin(adminUid);
    if (!isVerifiedAdmin) {
        return { success: false, error: 'Permission denied. User is not an administrator.' };
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const firestore = getFirestore(app);

    try {
        const userRecord = await auth.getUser(uid);
        const currentClaims = userRecord.customClaims || {};

        if (currentClaims['role'] === 'admin') {
            return { success: true }; // Role is already set
        }

        // Set the custom claim
        await auth.setCustomUserClaims(uid, { ...currentClaims, role: 'admin' });
        
        // Also update the role in the user's Firestore document for client-side UI.
        await firestore.collection('users').doc(uid).update({ role: 'admin' });

        return { success: true };

    } catch (error: any) {
        console.error("Error in setAdminClaimFlow:", error.message);
        return { success: false, error: `Failed to set admin claim: ${error.message}` };
    }
  }
);
