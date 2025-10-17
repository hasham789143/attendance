'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from '../ui/input';
import type { StoredAttendanceRecord } from './session-history';
import { AttendanceStatus } from '../providers/store-provider';
import { ScanData } from '@/models/backend';
import { getScanLabel } from '@/lib/utils';
import { produce } from 'immer';


interface EditAttendanceDialogProps {
  record: StoredAttendanceRecord;
  onSave: (newRecord: StoredAttendanceRecord) => void;
  onCancel: () => void;
}

export function EditAttendanceDialog({ record, onSave, onCancel }: EditAttendanceDialogProps) {
  const [editedRecord, setEditedRecord] = useState<StoredAttendanceRecord>(record);

  const handleScanChange = (scanIndex: number, field: keyof ScanData, value: string) => {
    const newRecord = produce(editedRecord, draft => {
        const scan = draft.scans[scanIndex];
        if(field === 'status') {
            scan.status = value as 'present' | 'late' | 'absent';
            // if status is not late, reset minutesLate
            if(scan.status !== 'late') {
                scan.minutesLate = 0;
            }
        }
        if (field === 'minutesLate') {
            scan.minutesLate = parseInt(value, 10) || 0;
        }
    });
    setEditedRecord(newRecord);
  };


  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Attendance for {record.student.name}</DialogTitle>
          <DialogDescription>
            Manually override the attendance status for each scan. The final status will be recalculated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {editedRecord.scans.map((scan, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 items-center gap-4 border-b pb-4 last:border-b-0 last:pb-0">
                <Label className="md:col-span-3 text-base font-semibold">{getScanLabel(index + 1)}</Label>

                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor={`status-${index}`}>Status</Label>
                    <Select onValueChange={(value) => handleScanChange(index, 'status', value)} value={scan.status}>
                      <SelectTrigger id={`status-${index}`}>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                
                <div className="grid w-full items-center gap-1.5">
                     <Label htmlFor={`minutes-${index}`}>Minutes Late</Label>
                     <Input 
                        id={`minutes-${index}`}
                        type="number"
                        value={scan.minutesLate}
                        onChange={(e) => handleScanChange(index, 'minutesLate', e.target.value)}
                        disabled={scan.status !== 'late'}
                     />
                </div>
                 <div className="grid w-full items-center gap-1.5">
                     <Label>Time</Label>
                     <p className="text-sm text-muted-foreground h-10 flex items-center">
                        {scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                     </p>
                </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave(editedRecord)}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    