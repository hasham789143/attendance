'use client';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, StopCircle, ScanLine, Users, UserCheck, UserX, Clock, UserPlus, LogOut, Download, MailWarning, MapPin, AlarmClockCheck, Building, School } from 'lucide-react';
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
import { useTranslation } from '../providers/translation-provider';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';


function AttendanceList({ filter }: { filter: 'all' | 'present' | 'absent' | 'left_early' }) {
  const { attendance, session, handleCorrectionRequest } = useStore();
  const [requestToReview, setRequestToReview] = useState<AttendanceRecord | null>(null);
  const { t, language } = useTranslation();


  const sortedAttendance = useMemo(() => Array.from(attendance.values()).sort((a, b) => (a.student.roll || '').localeCompare(b.student.roll || '')), [attendance]);
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      if (record.correctionRequest?.status === 'pending') return 'absent';
      
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      // If any scan is still 'absent' but at least one is present, they left early
      if (record.scans.some(s => s.status === 'absent')) return 'left_early';
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
        return <Badge variant="default" className="bg-green-600">{t('dashboard.status.present')}</Badge>;
      case 'late':
        return <Badge variant="secondary" className="bg-yellow-500 text-black">{t('dashboard.status.late')} ({totalMinutesLate}m)</Badge>;
      case 'left_early':
        return <Badge variant="secondary" className="bg-orange-500">{t('dashboard.status.leftEarly')}</Badge>;
      case 'absent':
        return <Badge variant="destructive">{t('dashboard.status.absent')}</Badge>;
      default:
        return <Badge variant="outline">N/A</Badge>;
    }
  };
  
  const getMissedScans = (record: AttendanceRecord) => {
    if (!session || session.totalScans < 2) return null;

    const missed: number[] = [];
    const hasAnyScan = record.scans.some(s => s.status !== 'absent');
    
    if (hasAnyScan) {
        for (let i = 0; i < session.totalScans; i++) {
            if (record.scans[i]?.status === 'absent') {
                missed.push(i + 1);
            }
        }
    }
    
    if (missed.length > 0 && missed.length < session.totalScans) {
        return <span className="text-xs text-destructive">{t('dashboard.missedScans')}: {missed.map(m => getScanLabel(m, true, t)).join(', ')}</span>
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

    const tableColumn: string[] = [t('pdf.rollNo'), t('pdf.name')];
    for (let i = 1; i <= totalScans; i++) {
        tableColumn.push(`${getScanLabel(i, false, t)} ${t('pdf.status')}`, `${getScanLabel(i, false, t)} ${t('pdf.time')}`);
    }
    tableColumn.push(t('pdf.finalStatus'));
    
    const tableRows: any[][] = [];

    filteredAttendance.forEach(record => {
      const rowData: (string | number)[] = [
        record.student.roll || 'N/A',
        record.student.name,
      ];

      for (let i = 0; i < totalScans; i++) {
        const scan = record.scans[i] || { status: 'absent', minutesLate: 0, timestamp: null };
        let statusKey = `dashboard.status.${scan.status}`;
        let status = t(statusKey as any);
        if (scan.status === 'late' && scan.minutesLate > 0) {
            status += ` (${scan.minutesLate}m)`;
        }
        const time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
        rowData.push(status, time);
      }
      
      const finalStatusKey = `dashboard.status.${getFinalStatus(record).replace('_', '')}`;
      const finalStatus = t(finalStatusKey as any);

      rowData.push(finalStatus);
      
      tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        didDrawPage: function (data) {
            doc.setFontSize(20);
            doc.text(`${t('pdf.liveReportTitle')} (${t('dashboard.filters.'+filter)}) - ${format(new Date(), 'PPP p')}`, data.settings.margin.left, 15);
        }
    });
    doc.save(`${t('pdf.liveReportFilename')}-${filter}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
              <CardTitle>{t('dashboard.rosterTitle')}</CardTitle>
              <CardDescription>{t('dashboard.rosterDescription', { count: filteredAttendance.length })}</CardDescription>
          </div>
          <Button onClick={downloadPdf} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              {t('common.downloadPdf')}
          </Button>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>{t('dashboard.table.rollNumber')}</TableHead>
                <TableHead>{t('dashboard.table.name')}</TableHead>
                <TableHead>{t('dashboard.table.status')}</TableHead>
                <TableHead className="text-right">{t('dashboard.table.lastScan')}</TableHead>
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
                                {t('dashboard.reviewRequest')}
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
  const { session, attendance, usersForSession, endSession, activateNextScan, attendanceMode, setAttendanceMode } = useStore();
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | 'left_early'>('all');
  const { t } = useTranslation();
  
  const getFinalStatus = (record: AttendanceRecord): AttendanceStatus => {
      const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;
      if (scansCompleted === 0) return 'absent';
      if (attendanceMode === 'class' && record.scans.some(s => s.status === 'absent')) return 'left_early';
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
  }, [attendance, session.totalScans, attendanceMode]);
  
  const totalUsers = usersForSession?.length || 0;
  const attendancePercentage = totalUsers > 0 ? (present / totalUsers) * 100 : 0;

  const cardBaseClasses = "cursor-pointer transition-all duration-200 ease-in-out hover:shadow-md";
  const activeCardClasses = "ring-2 ring-primary shadow-lg";

  const totalUsersLabel = attendanceMode === 'class' ? t('dashboard.filters.totalStudents') : t('dashboard.filters.totalResidents');

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold font-headline">{t('dashboard.adminTitle')}</h1>
                <p className="text-muted-foreground">{attendanceMode === 'class' ? 'Class Attendance Mode' : 'Hostel Attendance Mode'}</p>
            </div>
            <div className="flex items-center gap-4">
                 <div className="flex items-center space-x-2">
                    <School className={cn("h-6 w-6", attendanceMode === 'hostel' && 'text-muted-foreground')} />
                    <Switch
                        id="attendance-mode"
                        checked={attendanceMode === 'hostel'}
                        onCheckedChange={(checked) => setAttendanceMode(checked ? 'hostel' : 'class')}
                        disabled={session.status === 'active'}
                    />
                    <Building className={cn("h-6 w-6", attendanceMode === 'class' && 'text-muted-foreground')} />
                </div>
                 <RegisterUserDialog>
                    <Button size="lg" variant="outline">
                        <UserPlus className="mr-2 h-5 w-5" /> {t('dashboard.registerUser')}
                    </Button>
                </RegisterUserDialog>
                {session.status === 'inactive' || session.status === 'ended' ? (
                    <StartSessionDialog>
                        <Button size="lg">
                            <PlayCircle className="mr-2 h-5 w-5" /> {t('dashboard.startSession')}
                        </Button>
                    </StartSessionDialog>
                ) : (
                    <Button size="lg" variant="destructive" onClick={endSession}>
                        <StopCircle className="mr-2 h-5 w-5" /> {t('dashboard.endSession')}
                    </Button>
                )}
            </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card onClick={() => setFilter('all')} className={cn(cardBaseClasses, filter === 'all' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{totalUsersLabel}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalUsers}</div>
                </CardContent>
            </Card>
            <Card onClick={() => setFilter('present')} className={cn(cardBaseClasses, filter === 'present' && activeCardClasses)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('dashboard.filters.present')}</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{present}</div>
                </CardContent>
            </Card>
             {attendanceMode === 'class' && (
                <Card onClick={() => setFilter('left_early')} className={cn(cardBaseClasses, filter === 'left_early' && activeCardClasses)}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('dashboard.filters.left_early')}</CardTitle>
                        <LogOut className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{leftEarly}</div>
                    </CardContent>
                </Card>
             )}
            <Card onClick={() => setFilter('absent')} className={cn(cardBaseClasses, filter === 'absent' && activeCardClasses, attendanceMode === 'hostel' && 'col-start-4')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('dashboard.filters.absent')}</CardTitle>
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
                <p className="text-sm text-muted-foreground text-center">{t('dashboard.progressText', { present, total: totalUsers })}</p>
            </div>
        )}

        {session.status === 'inactive' || session.status === 'ended' ? (
            <Card className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <CardContent>
                    <h2 className="text-xl font-semibold">{t('dashboard.inactive.title')}</h2>
                    <p className="text-muted-foreground">{t('dashboard.inactive.description')}</p>
                </CardContent>
            </Card>
        ) : (
           <Tabs defaultValue="roster" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="roster">{t('dashboard.tabs.roster')}</TabsTrigger>
                    <TabsTrigger value="qrcode">{attendanceMode === 'class' ? t('dashboard.tabs.qrCode') : 'Session PIN'}</TabsTrigger>
                    <TabsTrigger value="info">{t('dashboard.tabs.info')}</TabsTrigger>
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
                            <CardTitle>{t('dashboard.sessionInfo.title')}</CardTitle>
                            <CardDescription>{t('dashboard.sessionInfo.description')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center space-x-4 rounded-md border p-4">
                                <MapPin className="h-6 w-6 text-primary"/>
                                <div className="flex-1 space-y-1">
                                <p className="text-sm font-medium leading-none">{t('dashboard.sessionInfo.radius')}</p>
                                <p className="text-sm text-muted-foreground">
                                    {session.radius ?? 100} {t('common.meters')}
                                </p>
                                </div>
                            </div>
                             <div className="flex items-center space-x-4 rounded-md border p-4">
                                <AlarmClockCheck className="h-6 w-6 text-primary"/>
                                <div className="flex-1 space-y-1">
                                <p className="text-sm font-medium leading-none">{t('dashboard.sessionInfo.latePolicy')}</p>
                                <p className="text-sm text-muted-foreground">
                                    {t('dashboard.sessionInfo.latePolicyDescription', { minutes: session.lateAfterMinutes })}
                                </p>
                                </div>
                            </div>
                            
                            {session.currentScan < session.totalScans && (
                                <div className="pt-4">
                                     <Button onClick={activateNextScan} className="w-full">
                                        <ScanLine className="mr-2 h-4 w-4" /> {t('dashboard.activateScan', { scan: getScanLabel(session.currentScan + 1, false, t) })}
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
