'use client';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, StopCircle, ScanLine, Users, UserCheck, UserX, Clock, UserPlus, LogOut, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Progress } from '../ui/progress';
import { RegisterUserDialog } from './register-user-dialog';
import { QrCodeDisplay } from './qr-code-display';
import { StartSessionDialog } from './start-session-dialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScanData } from '@/models/backend';


function AttendanceList({ filter }: { filter: 'all' | 'present' | 'absent' | 'left_early' }) {
  const { attendance, session } = useStore();
  const sortedAttendance = useMemo(() => Array.from(attendance.values()).sort((a, b) => (a.student.roll || '').localeCompare(b.student.roll || '')), [attendance]);
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      if (scansCompleted < session.totalScans) return 'left_early';
      if (record.scans.some(s => s.status === 'late')) return 'late';
      return 'present';
  };

  const filteredAttendance = useMemo(() => {
    if (filter === 'all') {
      return sortedAttendance;
    }
    return sortedAttendance.filter(record => getFinalStatus(record) === filter);
  }, [filter, sortedAttendance]);

  const getStatusBadge = (record: AttendanceRecord) => {
    const finalStatus = getFinalStatus(record);
    const totalMinutesLate = record.scans.reduce((acc, scan) => acc + (scan.minutesLate || 0), 0);

    switch (finalStatus) {
      case 'present':
        return <Badge variant="default" className="bg-green-600">Present</Badge>;
      case 'late':
        return <Badge variant="secondary" className="bg-yellow-500">Late ({totalMinutesLate}m)</Badge>;
      case 'left_early':
        return <Badge variant="secondary" className="bg-orange-500">Left Early</Badge>;
      case 'absent':
        return <Badge variant="destructive">Absent</Badge>;
      default:
        return <Badge variant="outline">N/A</Badge>;
    }
  };
  
  const getMissedScans = (record: AttendanceRecord) => {
    const missed: number[] = [];
    record.scans.forEach((scan, index) => {
        // A scan is missed if it's absent, but a previous scan was present.
        // This avoids calling everyone who missed scan 1 "missed scan 2"
        const hasPreviousScan = index > 0 ? record.scans[index-1].status !== 'absent' : true;
        if(scan.status === 'absent' && record.scans[0].status !== 'absent' && hasPreviousScan) {
            missed.push(index + 1);
        }
    });
    if (missed.length > 0) {
        return <span className="text-xs text-destructive">Missed Scan(s): {missed.join(', ')}</span>
    }
    return null;
  }

  const getTime = (record: AttendanceRecord) => {
    const lastScan = [...record.scans].reverse().find(s => s.timestamp);
    return lastScan?.timestamp ? new Date(lastScan.timestamp).toLocaleTimeString() : '—';
  }
  
  const downloadPdf = () => {
    const doc = new jsPDF();
    const tableColumn = ["Roll Number", "Name", "Status", "Details", "Last Scan"];
    const tableRows: any[] = [];

    filteredAttendance.forEach(record => {
      const missedScans = getMissedScans(record);
      const recordData = [
        record.student.roll || 'N/A',
        record.student.name,
        getFinalStatus(record).replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        missedScans?.props.children || '',
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
            doc.text(`Attendance Report (${filter.toUpperCase()}) - ${format(new Date(), 'yyyy-MM-dd')}`, data.settings.margin.left, 15);
        }
    });
    doc.save(`attendance-report-${filter}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className='flex-row items-center justify-between'>
        <div>
            <CardTitle>Live Attendance Roster</CardTitle>
            <CardDescription>{filteredAttendance.length} student(s) showing</CardDescription>
        </div>
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
            {filteredAttendance.map((record) => (
              <TableRow key={record.student.uid}>
                <TableCell className="font-medium">{record.student.roll || 'N/A'}</TableCell>
                <TableCell>
                    <div>{record.student.name}</div>
                    {getMissedScans(record)}
                </TableCell>
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
  const { session, attendance, students, endSession, activateNextScan } = useStore();
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | 'left_early'>('all');
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      if (scansCompleted < session.totalScans) return 'left_early';
      if (record.scans.some(s => s.status === 'late')) return 'late';
      return 'present';
  };
  
  const { present, absent, leftEarly } = useMemo(() => {
    const counts = { present: 0, absent: 0, leftEarly: 0 };
    attendance.forEach(record => {
      const finalStatus = getFinalStatus(record);
      if(finalStatus === 'present' || finalStatus === 'late') counts.present++;
      else if (finalStatus === 'left_early') counts.leftEarly++;
      else if (finalStatus === 'absent') counts.absent++;
    });
    return counts;
  }, [attendance, session.totalScans]);
  
  const totalStudents = students?.length || 0;
  const attendancePercentage = totalStudents > 0 ? (present / totalStudents) * 100 : 0;

  const cardBaseClasses = "cursor-pointer transition-all duration-200 ease-in-out hover:shadow-md";
  const activeCardClasses = "ring-2 ring-primary shadow-lg";

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
            <Card onClick={() => setFilter('all')} className={cn(cardBaseClasses, filter === 'all' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalStudents}</div>
                </CardContent>
            </Card>
            <Card onClick={() => setFilter('present')} className={cn(cardBaseClasses, filter === 'present' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Present</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{present}</div>
                </CardContent>
            </Card>
             <Card onClick={() => setFilter('left_early')} className={cn(cardBaseClasses, filter === 'left_early' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Left Early</CardTitle>
                    <LogOut className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{leftEarly}</div>
                </CardContent>
            </Card>
            <Card onClick={() => setFilter('absent')} className={cn(cardBaseClasses, filter === 'absent' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Absent</CardTitle>
                    <UserX className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{absent}</div>
                </CardContent>
            </Card>
        </div>

        {session.status === 'active' && (
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
                  {session.currentScan < session.totalScans && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Next Scan</CardTitle>
                            <CardDescription>When you are ready, activate the next scan to continue verifying attendance.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={activateNextScan} className="w-full">
                                <ScanLine className="mr-2 h-4 w-4" /> Activate Scan {session.currentScan + 1}
                            </Button>
                        </CardContent>
                    </Card>
                  )}
                </div>
                <AttendanceList filter={filter} />
            </div>
        )}
    </div>
  );
}

// Helper type
type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';
