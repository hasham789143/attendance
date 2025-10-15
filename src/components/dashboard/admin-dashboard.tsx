'use client';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, StopCircle, Bot, ScanLine, Users, UserCheck, UserX, Clock, UserPlus } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';
import { Progress } from '../ui/progress';
import { RegisterUserDialog } from './register-user-dialog';
import { QrCodeDisplay } from './qr-code-display';

function AiVerifier() {
    const { session, generateSecondQrCode, activateSecondQr, attendance } = useStore();
    const presentCount = useMemo(() => Array.from(attendance.values()).filter(r => r.status !== 'absent').length, [attendance]);
    
    if (session.status !== 'active_first' || presentCount === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot /> AI Mid-Class Verifier</CardTitle>
                <CardDescription>Use AI to find the best time for a second QR scan to catch students who leave early.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {session.secondScanTime ? (
                    <div>
                        <p className="text-sm font-semibold">AI Recommendation:</p>
                        <p className="text-lg text-primary">{`Display 2nd QR at ${session.secondScanTime} minutes.`}</p>
                        <p className="text-xs text-muted-foreground">{session.secondScanReason}</p>
                         <Button onClick={activateSecondQr} className="mt-4 w-full">
                            <ScanLine className="mr-2 h-4 w-4" /> Activate Second Scan Now
                        </Button>
                    </div>
                ) : (
                    <Button onClick={generateSecondQrCode} className="w-full">
                        Get Optimal Time
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}

function AttendanceList() {
  const { attendance } = useStore();
  const sortedAttendance = useMemo(() => Array.from(attendance.values()).sort((a, b) => (a.student.roll || '').localeCompare(b.student.roll || '')), [attendance]);

  const getStatusBadge = (status: AttendanceRecord['status']) => {
    switch (status) {
      case 'present': return <Badge variant="default" className="bg-green-600">Present</Badge>;
      case 'late': return <Badge variant="secondary" className="bg-yellow-500">Late</Badge>;
      case 'absent': return <Badge variant="destructive">Absent</Badge>;
      default: return <Badge variant="outline">N/A</Badge>;
    }
  };

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Live Attendance Roster</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Roll Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAttendance.map(({ student, status, timestamp, minutesLate }) => (
              <TableRow key={student.uid}>
                <TableCell className="font-medium">{student.roll || 'N/A'}</TableCell>
                <TableCell>{student.name}</TableCell>
                <TableCell>{getStatusBadge(status)}</TableCell>
                <TableCell className="text-right">
                    {timestamp ? timestamp.toLocaleTimeString() : '—'}
                    {status === 'late' && <span className="text-xs text-destructive ml-2">({minutesLate}m late)</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


export function AdminDashboard() {
  const { session, startSession, endSession, attendance, students } = useStore();
  const { present, late, absent } = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0 };
    attendance.forEach(record => {
        if(record.status === 'present') counts.present++;
        else if (record.status === 'late') counts.late++;
        else counts.absent++;
    });
    return counts;
  }, [attendance]);
  
  const totalStudents = students?.length || 0;
  const attended = present + late;
  const attendancePercentage = totalStudents > 0 ? (attended / totalStudents) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-muted-foreground">Manage attendance sessions and monitor students.</p>
            </div>
            <div className="flex items-center gap-2">
                 <RegisterUserDialog>
                    <Button size="lg" variant="outline">
                        <UserPlus className="mr-2 h-5 w-5" /> Register New User
                    </Button>
                </RegisterUserDialog>
                {session.status === 'inactive' || session.status === 'ended' ? (
                    <Button size="lg" onClick={startSession}>
                        <PlayCircle className="mr-2 h-5 w-5" /> Start New Session
                    </Button>
                ) : (
                    <Button size="lg" variant="destructive" onClick={endSession}>
                        <StopCircle className="mr-2 h-5 w-5" /> End Session
                    </Button>
                )}
            </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalStudents}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Present</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{present}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Late</CardTitle>
                    <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{late}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Absent</CardTitle>
                    <UserX className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{absent}</div>
                </CardContent>
            </Card>
        </div>

        {session.status !== 'inactive' && session.status !== 'ended' && (
            <div className="space-y-2">
                <Progress value={attendancePercentage} />
                <p className="text-sm text-muted-foreground text-center">{attended} of {totalStudents} students have marked attendance.</p>
            </div>
        )}

        {session.status === 'inactive' || session.status === 'ended' ? (
            <Card className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <CardContent>
                    <h2 className="text-xl font-semibold">Session Inactive</h2>
                    <p className="text-muted-foreground">Click "Start New Session" to begin taking attendance.</p>
                </CardContent>
            </Card>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <QrCodeDisplay />
                  <AiVerifier />
                </div>
                <AttendanceList />
            </div>
        )}
    </div>
  );
}
