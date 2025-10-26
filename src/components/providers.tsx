
'use client';

import { AuthProvider, useAuth } from '@/components/providers/auth-provider';
import { ToasterProvider } from '@/hooks/use-toast.tsx';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { StoreProvider } from './providers/store-provider';
import { ChatProvider } from './providers/chat-provider';

function AppProviders({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();

  return (
    <StoreProvider userProfile={userProfile}>
      <ChatProvider>
        {children}
      </ChatProvider>
    </StoreProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToasterProvider>
      <FirebaseClientProvider>
        <AuthProvider>
          <AppProviders>{children}</AppProviders>
        </AuthProvider>
      </FirebaseClientProvider>
    </ToasterProvider>
  );
}
