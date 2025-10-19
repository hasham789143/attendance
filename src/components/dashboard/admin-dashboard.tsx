'use client';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, StopCircle, ScanLine, Users, UserCheck, UserX, Clock, UserPlus, LogOut, Download, MailWarning, MapPin, AlarmClockCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Progress } from '../ui/progress';
import { RegisterUserDialog } from './register-user-dialog';
import { QrCodeDisplay } from './qr-code-display';
import { StartSessionDialog } from './start-session-dialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { cn, getScanLabel } from '@/lib/utils';
import { ScanData } from '@/models/backend';
import { CorrectionRequestDialog } from './correction-request-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"


function AttendanceList({ filter }: { filter: 'all' | 'present' | 'absent' | 'left_early' }) {
  const { attendance, session, handleCorrectionRequest } = useStore();
  const [requestToReview, setRequestToReview] = useState<AttendanceRecord | null>(null);

  const sortedAttendance = useMemo(() => Array.from(attendance.values()).sort((a, b) => (a.student.roll || '').localeCompare(b.student.roll || '')), [attendance]);
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      if (record.correctionRequest?.status === 'pending') return 'absent';
      
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      if (session.totalScans && scansCompleted < session.totalScans) return 'left_early';
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
        return <Badge variant="secondary" className="bg-yellow-500 text-black">Late ({totalMinutesLate}m)</Badge>;
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
        const hasPreviousScan = index > 0 ? record.scans[index-1].status !== 'absent' : true;
        if(scan.status === 'absent' && record.scans[0].status !== 'absent' && hasPreviousScan) {
            missed.push(index + 1);
        }
    });
    if (missed.length > 0) {
        return <span className="text-xs text-destructive">Missed: {missed.map(m => getScanLabel(m, true)).join(', ')}</span>
    }
    return null;
  }

  const getTime = (record: AttendanceRecord) => {
    const lastScan = [...record.scans].reverse().find(s => s.timestamp);
    return lastScan?.timestamp ? new Date(lastScan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  }
  
  const downloadPdf = () => {
    if (filteredAttendance.length === 0) return;
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const totalScans = session.totalScans || 0;

    const tableColumn: string[] = ["Room No", "Name"];
    for (let i = 1; i <= totalScans; i++) {
        tableColumn.push(`${getScanLabel(i)} Status`, `${getScanLabel(i)} Time`);
    }
    tableColumn.push("Final Status");
    
    const tableRows: any[][] = [];

    filteredAttendance.forEach(record => {
      const rowData: (string | number)[] = [
        record.student.roll || 'N/A',
        record.student.name,
      ];

      for (let i = 0; i < totalScans; i++) {
        const scan = record.scans[i] || { status: 'absent', minutesLate: 0, timestamp: null };
        let status = scan.status.charAt(0).toUpperCase() + scan.status.slice(1);
        if (scan.status === 'late' && scan.minutesLate > 0) {
            status += ` (${scan.minutesLate}m)`;
        }
        const time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
        rowData.push(status, time);
      }
      
      const finalStatus = getFinalStatus(record).replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      rowData.push(finalStatus);
      
      tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        didDrawPage: function (data) {
            doc.setFontSize(20);
            doc.text(`Live Attendance Report (${filter}) - ${format(new Date(), 'PPP p')}`, data.settings.margin.left, 15);
        }
    });
    doc.save(`live-attendance-report-${filter}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const onReviewClose = (approved?: boolean) => {
    if (requestToReview && approved !== undefined) {
      handleCorrectionRequest(requestToReview.student.uid, approved);
    }
    setRequestToReview(null);
  };

  return (
    <>
      {requestToReview && (
          <CorrectionRequestDialog 
              record={requestToReview} 
              onClose={onReviewClose} 
          />
      )}
      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <div>
              <CardTitle>Live Attendance Roster</CardTitle>
              <CardDescription>{filteredAttendance.length} resident(s) showing</CardDescription>
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
                <TableHead>Room Number</TableHead>
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
                      <div className='flex items-center gap-2'>
                        {record.student.name}
                        {record.correctionRequest?.status === 'pending' && (
                            <Button variant="secondary" size="sm" onClick={() => setRequestToReview(record)}>
                                <MailWarning className="h-4 w-4 mr-2" />
                                Review Request
                            </Button>
                        )}
                      </div>
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
    </>
  );
}


export function AdminDashboard() {
  const { session, attendance, students, endSession, activateNextScan } = useStore();
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | 'left_early'>('all');
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      if (session.totalScans && scansCompleted < session.totalScans) return 'left_early';
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
  
  const totalResidents = students?.length || 0;
  const attendancePercentage = totalResidents > 0 ? (present / totalResidents) * 100 : 0;

  const cardBaseClasses = "cursor-pointer transition-all duration-200 ease-in-out hover:shadow-md";
  const activeCardClasses = "ring-2 ring-primary shadow-lg";

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-muted-foreground">Manage hostel attendance and monitor residents.</p>
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
                    <CardTitle className="text-sm font-medium">Total Residents</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalResidents}</div>
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
                <p className="text-sm text-muted-foreground text-center">{present} of {totalResidents} residents are fully present.</p>
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
           <Tabs defaultValue="roster" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="roster">Live Roster</TabsTrigger>
                    <TabsTrigger value="qrcode">QR Code</TabsTrigger>
                    <TabsTrigger value="info">Session Info</TabsTrigger>
                </TabsList>
                <TabsContent value="roster">
                    <AttendanceList filter={filter} />
                </TabsContent>
                <TabsContent value="qrcode">
                    <QrCodeDisplay />
                </TabsContent>
                <TabsContent value="info">
                    <Card>
                        <CardHeader>
                            <CardTitle>Session Information</CardTitle>
                            <CardDescription>Details and controls for the active session.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center space-x-4 rounded-md border p-4">
                                <MapPin className="h-6 w-6 text-primary"/>
                                <div className="flex-1 space-y-1">
                                <p className="text-sm font-medium leading-none">Allowed Radius</p>
                                <p className="text-sm text-muted-foreground">
                                    {session.radius ?? 100} meters
                                </p>
                                </div>
                            </div>
                             <div className="flex items-center space-x-4 rounded-md border p-4">
                                <AlarmClockCheck className="h-6 w-6 text-primary"/>
                                <div className="flex-1 space-y-1">
                                <p className="text-sm font-medium leading-none">Late Policy</p>
                                <p className="text-sm text-muted-foreground">
                                    Marked late after {session.lateAfterMinutes} minutes.
                                </p>
                                </div>
                            </div>
                            
                            {session.currentScan < session.totalScans && (
                                <div className="pt-4">
                                     <Button onClick={activateNextScan} className="w-full">
                                        <ScanLine className="mr-2 h-4 w-4" /> Activate {getScanLabel(session.currentScan + 1)}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        )}
    </div>
  );
}

// Helper type
type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';
