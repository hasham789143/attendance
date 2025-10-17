'use client';

import { AuthProvider } from '@/components/providers/auth-provider';
import { ToasterProvider } from '@/hooks/use-toast.tsx';
import { FirebaseClientProvider } from '@/firebase/client-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToasterProvider>
      <FirebaseClientProvider>
        <AuthProvider>{children}</AuthProvider>
      </FirebaseClientProvider>
    </ToasterProvider>
  );
}
