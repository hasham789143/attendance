'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirebase, setDocumentNonBlocking } from '@/firebase';
import { createUserWithEmailAndPassword, getIdToken } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast.tsx';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setAdminClaim } from '@/ai/flows/set-admin-claim.flow';
import { useAuth } from '../providers/auth-provider';

export function RegisterUserDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'viewer' | 'admin'>('viewer');
  const [userType, setUserType] = useState<'student' | 'resident' | 'both'>('student');
  const [loading, setLoading] = useState(false);
  
  const { firestore, auth } = useFirebase();
  const { userProfile: currentAdmin } = useAuth();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password || !role || !userType) {
      toast({
        variant: 'destructive',
        title: 'Missing Fields',
        description: 'Please fill out all required fields.',
      });
      return;
    }

    if (!auth || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Firebase Error',
        description: 'Firebase services are not initialized properly.',
      });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const userProfileData = {
        uid: newUser.uid,
        name,
        roll,
        email,
        role,
        userType,
      };

      // Step 2: If the user is an admin, set the admin custom claim securely
      if (role === 'admin') {
        const result = await setAdminClaim({ uid: newUser.uid });
        if (!result.success) {
          throw new Error('Failed to assign admin privileges. Please try again.');
        }
      }

      // Step 3: Save user profile in Firestore
      await setDocumentNonBlocking(doc(firestore, 'users', newUser.uid), userProfileData, { merge: false });

      // Step 4: Refresh token for the current admin (optional)
      try {
        await auth.currentUser?.getIdToken(true);
      } catch (tokenError) {
        console.warn('Token refresh failed (non-critical):', tokenError);
      }

      // Step 5: Success toast message
      toast({
        title: 'User Registered Successfully',
        description:
          role === 'admin'
            ? `${name} has been created as an administrator. They must log out and back in to activate permissions.`
            : `${name} has been created successfully.`,
      });

      // Step 6: Reset form and close dialog
      setName('');
      setRoll('');
      setEmail('');
      setPassword('');
      setRole('viewer');
      setUserType('student');
      setOpen(false);
    } catch (error: any) {
      console.error('Registration Error:', error);
      toast({
        variant: 'destructive',
        title: 'Registration Failed',
        description:
          error.code === 'auth/email-already-in-use'
            ? 'This email is already registered.'
            : error.message || 'An unexpected error occurred.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleRegister}>
          <DialogHeader>
            <DialogTitle>Register New User</DialogTitle>
            <DialogDescription>
              Create a new student, resident, or administrator account.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Full Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                required
              />
            </div>

            {/* Roll / Room */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="roll" className="text-right">ID / Room No.</Label>
              <Input
                id="roll"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                className="col-span-3"
              />
            </div>

            {/* Email */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="col-span-3"
                required
              />
            </div>

            {/* Password */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="col-span-3"
                required
                placeholder="Temporary password"
              />
            </div>

            {/* System Role */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="role" className="text-right pt-2">System Role</Label>
              <div className="col-span-3 space-y-2">
                <Select onValueChange={(value) => setRole(value as 'viewer' | 'admin')} value={role}>
                    <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="viewer">User (Student/Resident)</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Accounts created here are active immediately.</p>
              </div>
            </div>

            {/* User Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="userType" className="text-right">User Type</Label>
              <Select onValueChange={(value) => setUserType(value as any)} value={userType}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="resident">Resident</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
