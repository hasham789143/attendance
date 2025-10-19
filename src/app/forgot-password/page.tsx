'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast.tsx';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { auth } = useFirebase();
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your email address.',
      });
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setEmailSent(true);
    } catch (error: any) {
      console.error('Password Reset Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Could not send password reset email.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-2" />
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>
            {emailSent
              ? 'Check your inbox for a password reset link.'
              : 'Enter your email to receive a password reset link.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailSent ? (
             <div className="text-center">
                <p className="text-muted-foreground mb-4">
                    If an account exists for {email}, you will receive an email with instructions on how to reset your password.
                </p>
                <Button asChild className="w-full">
                    <Link href="/login">Return to Login</Link>
                </Button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send Reset Link
              </Button>
               <div className="text-center text-sm">
                    <Link href="/login" className="underline hover:text-primary">
                        Back to Login
                    </Link>
                </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
