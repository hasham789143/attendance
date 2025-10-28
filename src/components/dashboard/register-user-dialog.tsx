
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
import { useToast } from '@/hooks/use-toast.tsx';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from '../providers/auth-provider';
import { createUser } from '@/ai/flows/create-user.flow';

export function RegisterUserDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'student' | 'resident' | 'both'>('student');
  const [loading, setLoading] = useState(false);
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const resetForm = () => {
    setName('');
    setRoll('');
    setEmail('');
    setPassword('');
    setUserType('student');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password || !userType) {
      toast({
        variant: 'destructive',
        title: 'Missing Fields',
        description: 'Please fill out all required fields.',
      });
      return;
    }
    
    if (!userProfile) return;

    setLoading(true);

    try {
      const result = await createUser({
        email,
        password,
        displayName: name,
        roll,
        userType,
        adminUid: userProfile.uid,
      });

      if (result.uid) {
         toast({
          title: 'User Registered Successfully',
          description: `${name} has been created and can now log in.`,
        });
        resetForm();
        setOpen(false);
      } else {
        throw new Error(result.error || "An unknown error occurred.");
      }

    } catch (error: any) {
      console.error('Registration Error:', error);
      toast({
        variant: 'destructive',
        title: 'Registration Failed',
        description: error.message || 'An unexpected error occurred.',
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
              Create a new user account. The user will be able to log in immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="roll" className="text-right">ID / Room No.</Label>
              <Input
                id="roll"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                className="col-span-3"
              />
            </div>

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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="col-span-3"
                required
                placeholder="Set initial password"
              />
            </div>

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
