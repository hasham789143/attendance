
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Auth, User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, Firestore } from 'firebase/firestore';
import { useDoc, useFirebase, useMemoFirebase } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setAdminClaim } from '@/ai/flows/set-admin-claim.flow';
import { useToast } from '@/hooks/use-toast.tsx';


// The shape of the user profile stored in Firestore
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'disabled' | 'pending';
  userType: 'student' | 'resident' | 'both';
  roll?: string;
}

// The shape of the context value
interface AuthContextType {
  user: User | null; // Firebase Auth user
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, firestore, user: authUser, isUserLoading: isAuthLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfileData, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);
  
  const loading = isAuthLoading || (!!authUser && isProfileLoading);

  useEffect(() => {
    if (!loading && authUser && userProfileData) {
      if (userProfileData.role === 'disabled') {
        toast({ title: 'Account Disabled', description: 'Your account has been disabled by an administrator.', variant: 'destructive'});
        firebaseSignOut(auth);
        router.replace('/login');
      } else if (userProfileData.role === 'pending') {
        toast({ title: 'Account Pending', description: 'Your account is awaiting administrator approval.' });
        firebaseSignOut(auth);
        router.replace('/login');
      }
    }
  }, [loading, authUser, userProfileData, auth, router, toast]);
  
  const logout = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
      router.push('/login');
    }
  }, [auth, router]);
  
  const [profileExists, setProfileExists] = useState(true);

  useEffect(() => {
    if (authUser && !isProfileLoading && !userProfileData) {
      setProfileExists(false);
    } else {
      setProfileExists(true);
    }
  }, [authUser, isProfileLoading, userProfileData]);


  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authUser && !profileExists) {
     return (
       <div className="flex h-screen w-full flex-col items-center justify-center gap-4 text-center">
         <p className="text-xl font-semibold">Could not load user profile.</p>
         <p className="text-muted-foreground">The user document might be missing in Firestore.</p>
         <Button onClick={logout}>Return to Login</Button>
       </div>
     );
  }


  const userProfile = userProfileData ? { ...userProfileData, id: userProfileData.uid } as UserProfile : null;

  return (
    <AuthContext.Provider value={{ user: authUser, userProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
