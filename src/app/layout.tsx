import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { ToasterProvider } from '@/hooks/use-toast.tsx';
import { FirebaseClientProvider } from '@/firebase/client-provider';

const fontBody = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Class Guardian',
  description: 'A modern attendance system to ensure presence and engagement.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn('antialiased', fontBody.variable)}>
        <ToasterProvider>
          <FirebaseClientProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </FirebaseClientProvider>
        </ToasterProvider>
        <Toaster />
      </body>
    </html>
  );
}
