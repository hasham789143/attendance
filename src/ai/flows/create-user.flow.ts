
'use server';
/**
 * @fileOverview A secure flow for an existing admin to create a new user.
 * This flow uses the Firebase Admin SDK to create a user and their corresponding Firestore document.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, App, applicationDefault } from 'firebase-admin/app';

const CreateUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string(),
  roll: z.string().optional(),
  userType: z.enum(['student', 'resident', 'both']),
  adminUid: z.string().describe("The UID of the user performing this action."),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

const CreateUserOutputSchema = z.object({
    uid: z.string().optional(),
    error: z.string().optional(),
});
export type CreateUserOutput = z.infer<typeof CreateUserOutputSchema>;


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
        return userRecord.customClaims?.['role'] === 'admin';
    } catch (error) {
        console.error("Error verifying admin status:", error);
        return false;
    }
}

export async function createUser(
  input: CreateUserInput
): Promise<CreateUserOutput> {
  return createUserFlow(input);
}

const createUserFlow = ai.defineFlow(
  {
    name: 'createUserFlow',
    inputSchema: CreateUserInputSchema,
    outputSchema: CreateUserOutputSchema,
  },
  async (input) => {

    const isVerifiedAdmin = await verifyAdmin(input.adminUid);
    if (!isVerifiedAdmin) {
        return { error: 'Permission denied. User is not an administrator.' };
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const firestore = getFirestore(app);

    try {
        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email: input.email,
            password: input.password,
            displayName: input.displayName,
        });
        
        // Set the default role to 'viewer' using custom claims
        await auth.setCustomUserClaims(userRecord.uid, { role: 'viewer' });

        // Create the user profile document in Firestore
        const userProfile = {
            uid: userRecord.uid,
            name: input.displayName,
            email: input.email,
            roll: input.roll || '',
            role: 'viewer', // Also store role in Firestore for client-side access
            userType: input.userType,
        };

        await firestore.collection('users').doc(userRecord.uid).set(userProfile);

        return { uid: userRecord.uid };

    } catch (error: any) {
        console.error("Error in createUserFlow:", error.message);
        // Provide a more user-friendly error message
        if (error.code === 'auth/email-already-exists') {
            return { error: 'This email address is already in use by another account.' };
        }
        return { error: `Failed to create user: ${error.message}` };
    }
  }
);

    