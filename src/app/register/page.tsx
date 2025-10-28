'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useFirebase, setDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast.tsx';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'student' | 'resident' | 'both'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { auth, firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const settingsDocRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'attendance') : null, [firestore]);
  const { data: settings, isLoading: settingsLoading } = useDoc<{ isRegistrationOpen: boolean }>(settingsDocRef);
  
  // Default to true. Registration is open unless explicitly closed by an admin.
  const isRegistrationOpen = settings?.isRegistrationOpen ?? true;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isRegistrationOpen && email.toLowerCase() !== 'admin@gmail.com') {
        toast({
            variant: 'destructive',
            title: 'Registration Closed',
            description: 'The administrator has disabled new registrations.',
        });
        return;
    }
    if (!name || !email || !password || !userType) {
      toast({
        variant: 'destructive',
        title: 'Missing Fields',
        description: 'Please fill out all required fields.',
      });
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Assign 'admin' role if the email is 'admin@gmail.com', otherwise 'viewer'.
      const role = email.toLowerCase() === 'admin@gmail.com' ? 'admin' : 'viewer';

      const userProfileData = {
        uid: user.uid,
        name,
        roll,
        email,
        role: role, // Assign the correct role
        userType,
      };

      // Create user profile in Firestore using the non-blocking helper
      setDocumentNonBlocking(doc(firestore, 'users', user.uid), userProfileData, { merge: false });
      
      toast({ title: 'Registration Successful', description: 'Redirecting to your dashboard...'});
      router.push('/dashboard');

    } catch (error: any) {
      console.error('Registration Error:', error);
       if (error.code === 'auth/email-already-in-use') {
        setError('This email address is already in use. Please try logging in.');
      } else if (error.code === 'auth/configuration-not-found') {
        setError("Registration is not configured. Please enable Email/Password sign-in in your Firebase project's Authentication settings.");
      } else {
        setError(error.message || 'An unexpected error occurred during registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-2" />
          <CardTitle>Create an Account</CardTitle>
          <CardDescription>Join Class Guardian today.</CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !isRegistrationOpen && email.toLowerCase() !== 'admin@gmail.com' ? (
             <Alert variant="destructive">
                <AlertTitle>Registration Closed</AlertTitle>
                <AlertDescription>
                    Registration is currently closed by the administrator. Please check back later or contact support if you believe this is an error.
                </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
               {error && (
                <Alert variant="destructive">
                    <AlertTitle>Registration Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
               )}
               <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
               <div className="space-y-2">
                <Label htmlFor="roll">ID / Room Number (Optional)</Label>
                <Input
                  id="roll"
                  type="text"
                  placeholder="A-101 or 22-ABC-01"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value)}
                  disabled={loading}
                />
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="6+ characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
               <div className="space-y-2">
                <Label htmlFor="userType">Registering As</Label>
                <Select onValueChange={(v) => setUserType(v as any)} value={userType}>
                    <SelectTrigger id="userType">
                        <SelectValue placeholder="Select user type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="student">Student (for Class)</SelectItem>
                        <SelectItem value="resident">Resident (for Hostel)</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Register
              </Button>
               <div className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="underline hover:text-primary">
                  Login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
