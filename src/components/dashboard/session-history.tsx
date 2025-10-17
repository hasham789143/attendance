'use client';

import { useState } from 'react';
import { useCollection, useFirebase, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, query, doc, DocumentReference } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { AttendanceRecord, AttendanceStatus, UserProfile } from '../providers/store-provider';
import { EditAttendanceDialog } from './edit-attendance-dialog';
import { ScanData } from '@/models/backend';
import { useStore } from '../providers/store-provider';
import { getScanLabel } from '@/lib/utils';
import { produce } from 'immer';

// This represents the data as it is stored in Firestore archives.
// Timestamps are stored as ISO strings.
export type StoredAttendanceRecord = { 
  id: string; // id is on the document, not in the data
  student: UserProfile,
  scans: ScanData[],
  finalStatus: AttendanceStatus;
  correctionRequest?: any;
};

export function SessionHistory({ sessionId, sessionDate }: { sessionId: string; sessionDate: Date }) {
  const { firestore } = useFirebase();
  const [recordToEdit, setRecordToEdit] = useState<StoredAttendanceRecord | null>(null);

  const recordsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "sessions", sessionId, "records"));
  }, [firestore, sessionId]);

  const { data: records, isLoading } = useCollection<StoredAttendanceRecord>(recordsQuery);

  const sortedRecords = records?.sort((a, b) => (a.student.roll || '').localeCompare(b.student.roll || '')) || [];
  
  const getStatusBadge = (record: StoredAttendanceRecord) => {
    const totalMinutesLate = record.scans.reduce((acc, scan) => acc + (scan.minutesLate || 0), 0);
    switch (record.finalStatus) {
      case 'present': return <Badge className="bg-green-600">Present</Badge>;
      case 'late': return <Badge className="bg-yellow-500 text-black">Late ({totalMinutesLate}m)</Badge>;
      case 'absent': return <Badge variant="destructive">Absent</Badge>;
      case 'left_early': return <Badge className="bg-orange-500">Left Early</Badge>;
      default: return <Badge variant="outline">N/A</Badge>;
    }
  };

  const getTime = (record: StoredAttendanceRecord) => {
    const lastScan = [...record.scans].reverse().find(s => s.timestamp);
    return lastScan?.timestamp ? new Date(lastScan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  };

  const downloadPdf = () => {
    if (sortedRecords.length === 0) return;
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const totalScans = sortedRecords[0]?.scans.length || 0;

    const tableColumn: string[] = ["Roll No", "Name"];
    for (let i = 1; i <= totalScans; i++) {
        tableColumn.push(`${getScanLabel(i)} Status`, `${getScanLabel(i)} Time`);
    }
    tableColumn.push("Final Status");

    const tableRows: any[][] = [];

    sortedRecords.forEach(record => {
      const rowData: (string | number)[] = [
        record.student.roll || 'N/A',
        record.student.name,
      ];

      record.scans.forEach(scan => {
        let status = scan.status.charAt(0).toUpperCase() + scan.status.slice(1);
        if (scan.status === 'late' && scan.minutesLate > 0) {
            status += ` (${scan.minutesLate}m)`;
        }
        const time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
        rowData.push(status, time);
      });
      
      const finalStatus = record.finalStatus.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      rowData.push(finalStatus);

      tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        didDrawPage: function (data) {
            doc.setFontSize(20);
            doc.text(`Attendance Report - ${format(sessionDate, 'PPP')}`, data.settings.margin.left, 15);
        }
    });
    doc.save(`attendance-report-${format(sessionDate, 'yyyy-MM-dd')}.pdf`);
  };

  const handleEdit = (record: StoredAttendanceRecord) => {
    setRecordToEdit(record);
  };
  
  const handleSaveEdit = (updatedRecord: StoredAttendanceRecord) => {
    if (!recordToEdit || !firestore) return;

    const recordRef = doc(firestore, 'sessions', sessionId, 'records', recordToEdit.id);
    
    // Recalculate finalStatus based on the edited scans
    const scansCompleted = updatedRecord.scans.filter(s => s.status !== 'absent').length;
    let newFinalStatus: AttendanceStatus = 'absent';
    
    if (scansCompleted === updatedRecord.scans.length) {
        const isLate = updatedRecord.scans.some(s => s.status === 'late');
        newFinalStatus = isLate ? 'late' : 'present';
    } else if (scansCompleted > 0) {
        newFinalStatus = 'left_early';
    }

    const dataToUpdate = {
        scans: updatedRecord.scans,
        finalStatus: newFinalStatus
    };

    updateDocumentNonBlocking(recordRef, dataToUpdate);
    setRecordToEdit(null);
  };

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <div>
          <CardTitle>Session: {format(sessionDate, 'PPP')}</CardTitle>
          <CardDescription>{sortedRecords.length} student records</CardDescription>
        </div>
        <Button onClick={downloadPdf} variant="outline" size="sm" disabled={isLoading || sortedRecords.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
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
                <TableHead>Roll Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Scan</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecords.map(record => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.student.roll || 'N/A'}</TableCell>
                  <TableCell>{record.student.name}</TableCell>
                  <TableCell>{getStatusBadge(record)}</TableCell>
                  <TableCell>{getTime(record)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(record)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {recordToEdit && (
        <EditAttendanceDialog
          record={recordToEdit}
          onSave={handleSaveEdit}
          onCancel={() => setRecordToEdit(null)}
        />
      )}
    </Card>
  );
}

    