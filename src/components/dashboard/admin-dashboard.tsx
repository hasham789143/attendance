'use client';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, StopCircle, Bot, ScanLine, Users, UserCheck, UserX, Clock, UserPlus, LogOut, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Progress } from '../ui/progress';
import { RegisterUserDialog } from './register-user-dialog';
import { QrCodeDisplay } from './qr-code-display';
import { StartSessionDialog } from './start-session-dialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';


function AiVerifier() {
    const { session, generateSecondQrCode, activateSecondQr, attendance } = useStore();
    const presentCount = useMemo(() => Array.from(attendance.values()).filter(r => r.firstScanStatus !== 'absent').length, [attendance]);
    
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

  const getStatusBadge = (record: AttendanceRecord) => {
    const { finalStatus, firstScanStatus, minutesLate } = record;

    switch (finalStatus) {
      case 'present': 
        return <Badge variant="default" className="bg-green-600">Present</Badge>;
      case 'left_early': 
        return <Badge variant="secondary" className="bg-orange-500">Left Early</Badge>;
      case 'absent': 
        return <Badge variant="destructive">Absent</Badge>;
      case 'late': // This case might not be hit if finalStatus logic is tight
        return <Badge variant="secondary" className="bg-yellow-500">Late ({minutesLate}m)</Badge>;
      default: 
        if (firstScanStatus === 'late') {
            return <Badge variant="secondary" className="bg-yellow-500">Late ({minutesLate}m)</Badge>;
        }
        return <Badge variant="outline">N/A</Badge>;
    }
  };

  const getTime = (record: AttendanceRecord) => {
    if (record.secondScanTimestamp) {
      return record.secondScanTimestamp.toLocaleTimeString();
    }
    if (record.firstScanTimestamp) {
      return record.firstScanTimestamp.toLocaleTimeString();
    }
    return '—';
  }
  
  const downloadPdf = () => {
    const doc = new jsPDF();
    const tableColumn = ["Roll Number", "Name", "Status", "Last Scan"];
    const tableRows: any[] = [];

    sortedAttendance.forEach(record => {
      const recordData = [
        record.student.roll || 'N/A',
        record.student.name,
        record.finalStatus.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        getTime(record)
      ];
      tableRows.push(recordData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        didDrawPage: function (data) {
            doc.setFontSize(20);
            doc.text("Attendance Report", data.settings.margin.left, 15);
        }
    });
    doc.save(`attendance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle>Live Attendance Roster</CardTitle>
         <Button onClick={downloadPdf} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
        </Button>
      </CardHeader>
      <CardContent className="max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Roll Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Last Scan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAttendance.map((record) => (
              <TableRow key={record.student.uid}>
                <TableCell className="font-medium">{record.student.roll || 'N/A'}</TableCell>
                <TableCell>{record.student.name}</TableCell>
                <TableCell>{getStatusBadge(record)}</TableCell>
                <TableCell className="text-right">
                    {getTime(record)}
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
  
  const { present, absent, leftEarly } = useMemo(() => {
    const counts = { present: 0, absent: 0, leftEarly: 0 };
    attendance.forEach(record => {
        if(record.finalStatus === 'present') counts.present++;
        else if (record.finalStatus === 'left_early') counts.leftEarly++;
        else if (record.finalStatus === 'absent') counts.absent++;
    });
    return counts;
  }, [attendance]);
  
  const totalStudents = students?.length || 0;
  const attendancePercentage = totalStudents > 0 ? (present / totalStudents) * 100 : 0;

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
                    <StartSessionDialog>
                        <Button size="lg">
                            <PlayCircle className="mr-2 h-5 w-5" /> Start New Session
                        </Button>
                    </StartSessionDialog>
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
                    <CardTitle className="text-sm font-medium">Left Early</CardTitle>
                    <LogOut className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{leftEarly}</div>
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
                <p className="text-sm text-muted-foreground text-center">{present} of {totalStudents} students are fully present.</p>
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
