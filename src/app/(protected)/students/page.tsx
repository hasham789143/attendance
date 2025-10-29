'use client';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, Pen, Trash2, CheckCircle, Ban, ShieldCheck } from 'lucide-react';
import { UserProfile, useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast.tsx';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setAdminClaim } from '@/ai/flows/set-admin-claim.flow';

function EditUserDialog({ user, onSave, onCancel }: { user: UserProfile, onSave: (updatedUser: Partial<UserProfile>) => void, onCancel: () => void }) {
    const [name, setName] = useState(user.name);
    const [roll, setRoll] = useState(user.roll || '');
    const [userType, setUserType] = useState(user.userType || 'student');

    const handleSave = () => {
        onSave({ name, roll, userType });
    }

    return (
        <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit User: {user.name}</DialogTitle>
                    <DialogDescription>Update the user's details below.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="roll" className="text-right">ID / Room Number</Label>
                        <Input id="roll" value={roll} onChange={(e) => setRoll(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="userType" className="text-right">User Type</Label>
                        <Select onValueChange={(v) => setUserType(v as any)} value={userType}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select user type" />
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
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function UserTable({ users, onEdit, onToggleStatus, onDelete, onPromote }: { users: UserProfile[], onEdit: (user: UserProfile) => void, onToggleStatus: (user: UserProfile) => void, onDelete: (user: UserProfile) => void, onPromote: (user: UserProfile) => void }) {
    
    const getUserTypeBadge = (userType: UserProfile['userType']) => {
        switch(userType) {
            case 'student': return <Badge variant="secondary">Student</Badge>;
            case 'resident': return <Badge variant="secondary" className="bg-blue-200 text-blue-800">Resident</Badge>;
            case 'both': return <Badge variant="secondary" className="bg-purple-200 text-purple-800">Both</Badge>;
            default: return <Badge variant="outline">N/A</Badge>;
        }
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>ID / Room Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {users.map(user => (
                    <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.roll || 'N/A'}</TableCell>
                        <TableCell>{getUserTypeBadge(user.userType)}</TableCell>
                        <TableCell>
                            {user.role === 'admin' ? (
                                <Badge variant="default" className="bg-purple-600">Admin</Badge>
                            ) : user.role === 'disabled' ? (
                                <Badge variant="destructive">Disabled</Badge>
                            ) : (
                                <Badge variant="default" className="bg-green-600">Active</Badge>
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => onEdit(user)}>
                                        <Pen className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    {user.role !== 'admin' && (
                                        <DropdownMenuItem onClick={() => onToggleStatus(user)}>
                                            {user.role === 'disabled' ? <CheckCircle className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                                            {user.role === 'disabled' ? 'Enable' : 'Disable'}
                                        </DropdownMenuItem>
                                    )}
                                     {user.role === 'viewer' && (
                                        <DropdownMenuItem onClick={() => onPromote(user)}>
                                            <ShieldCheck className="mr-2 h-4 w-4" />
                                            Promote to Admin
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(user)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

export default function ResidentsPage() {
  const { firestore } = useFirebase();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [userToEdit, setUserToEdit] = useState<UserProfile | null>(null);
  const [userToToggleStatus, setUserToToggleStatus] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [userToPromote, setUserToPromote] = useState<UserProfile | null>(null);
  

  const allUsersQuery = useMemoFirebase(() => {
    if (!firestore || userProfile?.role !== 'admin') return null;
    return collection(firestore, "users");
  }, [firestore, userProfile]);

  const { data: allUsers, isLoading } = useCollection<UserProfile>(allUsersQuery);
  
  const activeUsers = allUsers?.sort((a, b) => (a.roll || '').localeCompare(b.roll || '')) || [];

  useEffect(() => {
      if (userProfile && userProfile.role !== 'admin') {
          router.replace('/dashboard');
      }
  }, [userProfile, router]);

  const handleUpdateUser = async (userId: string, data: Partial<UserProfile>) => {
    if (!firestore) return;
    const userRef = doc(firestore, 'users', userId);
    await updateDoc(userRef, data);
    toast({ title: "User Updated", description: "The user's details have been saved." });
    setUserToEdit(null);
  }

  const handleToggleStatus = async () => {
    if (!firestore || !userToToggleStatus) return;
    const userRef = doc(firestore, 'users', userToToggleStatus.uid);
    const newRole = userToToggleStatus.role === 'disabled' ? 'viewer' : 'disabled';
    await updateDoc(userRef, { role: newRole });
    toast({ title: `User ${newRole === 'viewer' ? 'Enabled' : 'Disabled'}`, description: `${userToToggleStatus.name}'s account has been updated.` });
    setUserToToggleStatus(null);
  }
  
  const handleDeleteUser = async (userToDelete: UserProfile) => {
    if (!firestore || !userToDelete) return;
    // This action is destructive and not recommended.
    // We only delete the Firestore document, not the auth user.
    // A more robust solution would use a Cloud Function to delete both.
    const userRef = doc(firestore, 'users', userToDelete.uid);
    await deleteDoc(userRef);
    toast({ title: "User Profile Deleted", description: `${userToDelete.name} has been removed from Firestore.` });
    setUserToDelete(null);
  }

  const handlePromote = async () => {
    if (!userToPromote || !userProfile) return;
    try {
        const result = await setAdminClaim({ uid: userToPromote.uid, adminUid: userProfile.uid });
        if (result.success) {
            toast({ title: "User Promoted", description: `${userToPromote.name} is now an administrator.` });
            // The user document itself is updated by the flow. The local state will refresh on next render.
        } else {
            throw new Error(result.error || "Failed to set admin claim.");
        }
    } catch(e: any) {
        toast({
            variant: 'destructive',
            title: 'Promotion Failed',
            description: e.message || 'Could not promote user to admin.'
        });
    } finally {
        setUserToPromote(null);
    }
  }

  if (userProfile?.role !== 'admin') {
     return (
       <div className="flex h-screen w-full items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
  }

  return (
    <div>
        <div className="flex items-center justify-between mb-4">
             <h1 className="text-2xl font-bold font-headline">User Management</h1>
        </div>
        
        {isLoading ? (
            <div className="flex justify-center items-center h-60">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
          <Card>
              <CardHeader>
                  <CardTitle>All Users</CardTitle>
                  <CardDescription>View, edit, and manage all user accounts.</CardDescription>
              </CardHeader>
              <CardContent>
                    <UserTable 
                      users={activeUsers}
                      onEdit={(user) => setUserToEdit(user)}
                      onToggleStatus={(user) => setUserToToggleStatus(user)}
                      onDelete={(user) => setUserToDelete(user)}
                      onPromote={(user) => setUserToPromote(user)}
                    />
              </CardContent>
          </Card>
        )}
        
        {userToEdit && (
            <EditUserDialog 
                user={userToEdit}
                onCancel={() => setUserToEdit(null)}
                onSave={(data) => handleUpdateUser(userToEdit.uid, data)}
            />
        )}

        {userToToggleStatus && (
             <AlertDialog open={true} onOpenChange={(isOpen) => !isOpen && setUserToToggleStatus(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                       You are about to {userToToggleStatus.role === 'disabled' ? 'enable' : 'disable'} the account for {userToToggleStatus.name}. 
                       A disabled user will not be able to log in.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleToggleStatus}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}

        {userToDelete && (
             <AlertDialog open={true} onOpenChange={(isOpen) => !isOpen && setUserToDelete(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                       This action is permanent and cannot be undone. This will delete the user profile for {userToDelete.name}.
                       It will not delete their authentication record or past attendance data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteUser(userToDelete)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}

        {userToPromote && (
             <AlertDialog open={true} onOpenChange={(isOpen) => !isOpen && setUserToPromote(null)}>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Promote to Administrator?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Are you sure you want to grant administrator privileges to {userToPromote.name}? They will have full access to manage users and sessions. This action requires the user to log out and log back in to take effect.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePromote}>Yes, Promote</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}

    </div>
  );
}
