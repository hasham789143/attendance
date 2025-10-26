
'use client';
import { useCollection, useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { Loader2, MoreHorizontal, Pen, Trash2, CheckCircle, Ban } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setRegistrationStatus } from '@/ai/flows/set-registration-status.flow';

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


export default function ResidentsPage() {
  const { firestore } = useFirebase();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [userToEdit, setUserToEdit] = useState<UserProfile | null>(null);
  const [userToToggleStatus, setUserToToggleStatus] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  
  const settingsDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'attendance');
  }, [firestore]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<{ isRegistrationOpen: boolean }>(settingsDocRef);
  
  // The state of the switch is now derived directly from the fetched settings.
  // It defaults to true if settings are not yet loaded or don't exist.
  const isRegistrationOpen = settings?.isRegistrationOpen ?? true;
  const [isUpdating, setIsUpdating] = useState(false);


  const allUsersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "users"), where('role', 'in', ['viewer', 'disabled']));
  }, [firestore]);

  const { data: allUsers, isLoading } = useCollection<UserProfile>(allUsersQuery);
  const sortedUsers = allUsers?.sort((a, b) => (a.roll || '').localeCompare(b.roll || '')) || [];

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
  
  const handleDeleteUser = async () => {
    if (!firestore || !userToDelete) return;
    const userRef = doc(firestore, 'users', userToDelete.uid);
    await deleteDoc(userRef);
    toast({ title: "User Deleted", description: `${userToDelete.name} has been removed.` });
    setUserToDelete(null);
  }

  const handleToggleRegistration = async (isOpen: boolean) => {
    if (!userProfile) return;
    setIsUpdating(true);
    try {
        await setRegistrationStatus({ isOpen, adminUid: userProfile.uid });
        toast({
          title: `Registration ${isOpen ? 'Enabled' : 'Disabled'}`,
          description: `New users can ${isOpen ? '' : 'no longer'} register.`,
        });
    } catch(e: any) {
        toast({
            variant: 'destructive',
            title: 'Permission Denied',
            description: 'You do not have permission to perform this action.'
        });
    } finally {
        setIsUpdating(false);
    }
  }

  const getUserTypeBadge = (userType: UserProfile['userType']) => {
    switch(userType) {
        case 'student': return <Badge variant="secondary">Student</Badge>;
        case 'resident': return <Badge variant="secondary" className="bg-blue-200 text-blue-800">Resident</Badge>;
        case 'both': return <Badge variant="secondary" className="bg-purple-200 text-purple-800">Both</Badge>;
        default: return <Badge variant="outline">N/A</Badge>;
    }
  }


  return (
    <div>
        <div className="flex items-center justify-between mb-4">
             <h1 className="text-2xl font-bold font-headline">User Management</h1>
             <div className="flex items-center space-x-2">
                {isLoadingSettings ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                    <Switch 
                        id="registration-switch" 
                        checked={isRegistrationOpen}
                        onCheckedChange={handleToggleRegistration}
                        disabled={isUpdating}
                    />
                )}
                <Label htmlFor="registration-switch">Allow Registration</Label>
            </div>
        </div>
        <Card>
            <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>View, edit, and manage all user accounts.</CardDescription>
            </CardHeader>
            <CardContent>
                 {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>ID / Room Number</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {sortedUsers.map(user => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>{user.roll || 'N/A'}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>{getUserTypeBadge(user.userType)}</TableCell>
                                <TableCell>
                                    {user.role === 'disabled' ? (
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
                                            <DropdownMenuItem onClick={() => setUserToEdit(user)}>
                                                <Pen className="mr-2 h-4 w-4" /> Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setUserToToggleStatus(user)}>
                                                {user.role === 'disabled' ? <CheckCircle className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                                                {user.role === 'disabled' ? 'Enable' : 'Disable'}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => setUserToDelete(user)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                 )}
            </CardContent>
        </Card>
        
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
                    <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}

    </div>
  );
}

    
