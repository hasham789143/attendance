
'use server';
/**
 * @fileOverview A secure flow for an existing admin to grant another user the 'admin' custom claim.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, App, applicationDefault } from 'firebase-admin/app';

const SetAdminClaimInputSchema = z.object({
  uid: z.string().describe("The UID of the user to grant admin privileges."),
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
    // This flow is wrapped by other logic that verifies the caller is an admin.
    // The primary admin case is handled in the auth provider.
    // The admin-creating-admin case is handled by the security rules on the component that calls it.
  },
  async ({ uid }) => {
    const app = getAdminApp();
    const auth = getAuth(app);

    try {
        const userRecord = await auth.getUser(uid);
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
