'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { users } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logo } from '@/components/logo';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleLogin = () => {
    if (selectedUserId) {
      login(selectedUserId);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-2" />
          <CardTitle>Welcome Back</CardTitle>
          <CardDescription>Select a user to simulate login.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-select">Select User</Label>
              <Select onValueChange={setSelectedUserId} disabled={loading}>
                <SelectTrigger id="user-select">
                  <SelectValue placeholder="Select a user profile..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleLogin} className="w-full" disabled={!selectedUserId || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
