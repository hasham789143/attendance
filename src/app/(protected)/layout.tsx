'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { MainSidebar } from '@/components/layout/main-sidebar';
import { StoreProvider } from '@/components/providers/store-provider';
import { TranslationProvider } from '@/components/providers/translation-provider';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Render layout only if user is authenticated
  // and userProfile is either loaded or we are sure it's not needed immediately
  if (!userProfile && !loading) {
     // This can happen briefly if the user doc is not found or during role changes.
     // You might want to show a specific message or redirect.
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Could not load user profile. Please try again later.</p>
      </div>
    );
  }


  return (
    <TranslationProvider>
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <MainSidebar />
        <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
          <Header />
          <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
            {children}
          </main>
        </div>
      </div>
    </TranslationProvider>
  );
}
