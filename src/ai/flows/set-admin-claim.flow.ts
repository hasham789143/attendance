
'use server';
/**
 * @fileOverview A secure flow for the primary admin to grant themselves the 'admin' custom claim.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, App, applicationDefault } from 'firebase-admin/app';

const SetAdminClaimInputSchema = z.object({
  uid: z.string().describe('The UID of the user to grant admin privileges.'),
});
export type SetAdminClaimInput = z.infer<typeof SetAdminClaimInputSchema>;

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

export async function setAdminClaim(
  input: SetAdminClaimInput
): Promise<{success: boolean}> {
  return setAdminClaimFlow(input);
}


const setAdminClaimFlow = ai.defineFlow(
  {
    name: 'setAdminClaimFlow',
    inputSchema: SetAdminClaimInputSchema,
    outputSchema: z.object({ success: z.boolean() }),
  },
  async ({ uid }) => {
    const app = getAdminApp();
    const auth = getAuth(app);

    try {
        const userRecord = await auth.getUser(uid);
        
        // CRITICAL: Only allow this for the designated primary admin email.
        if (userRecord.email !== 'admin@gmail.com') {
            throw new Error('This user is not authorized to become an admin.');
        }

        const currentClaims = userRecord.customClaims || {};
        if (currentClaims['role'] === 'admin') {
            return { success: true }; // Role is already set
        }

        await auth.setCustomUserClaims(uid, { ...currentClaims, role: 'admin' });
        return { success: true };

    } catch (error: any) {
        console.error("Error in setAdminClaimFlow:", error.message);
        throw new Error(`Failed to set admin claim: ${error.message}`);
    }
  }
);
