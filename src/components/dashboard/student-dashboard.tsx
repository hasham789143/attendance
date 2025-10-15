'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function StudentDashboard() {
  const { user } = useAuth();
  const { session, attendance, markAttendance } = useStore();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const myRecord = user?.studentProfile ? attendance.get(user.studentProfile.id) : undefined;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.studentProfile) {
        setIsLoading(true);
        setTimeout(() => {
            markAttendance(user.studentProfile!.id, code);
            setIsLoading(false);
            setCode('');
        }, 500);
    }
  };

  const getStatusContent = (record?: AttendanceRecord) => {
    if (!record || record.status === 'absent') {
      return (
        <div className="text-center">
            <p className="text-lg">You are marked <Badge variant="destructive">Absent</Badge></p>
            <p className="text-muted-foreground">Enter the code from the screen to mark your attendance.</p>
        </div>
      );
    }
    if (record.status === 'present') {
        return (
            <div className="text-center">
                <p className="text-lg">You are marked <Badge className="bg-green-600">Present</Badge></p>
                <p className="text-muted-foreground">Attendance recorded at {record.timestamp?.toLocaleTimeString()}.</p>
            </div>
        );
    }
    if (record.status === 'late') {
        return (
            <div className="text-center">
                <p className="text-lg">You are marked <Badge className="bg-yellow-500">Late</Badge></p>
                <p className="text-muted-foreground">Recorded at {record.timestamp?.toLocaleTimeString()} ({record.minutesLate} minutes late).</p>
            </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-headline">Student Dashboard</h1>
        <p className="text-muted-foreground">Welcome, {user?.name}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Session Status</CardTitle>
          <CardDescription>
            {session.status === 'inactive' || session.status === 'ended'
              ? 'There is no active attendance session.'
              : `An attendance session is active. Session round: ${session.status === 'active_first' ? '1' : '2'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="p-6 border rounded-lg bg-secondary/30 min-h-[120px] flex items-center justify-center">
              {getStatusContent(myRecord)}
            </div>

            {(session.status === 'active_first' || session.status === 'active_second') && myRecord?.status === 'absent' && (
            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
              <div className="w-full max-w-xs">
                <Label htmlFor="code-input" className="sr-only">Attendance Code</Label>
                <Input
                  id="code-input"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE"
                  className="text-center font-mono text-2xl h-14 tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" size="lg" disabled={isLoading || code.length < 6}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark My Attendance
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
