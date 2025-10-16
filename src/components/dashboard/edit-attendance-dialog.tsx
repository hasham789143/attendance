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
import type { AttendanceRecord } from '../providers/store-provider';

type StoredAttendanceRecord = Omit<AttendanceRecord, 'student' | 'firstScanTimestamp' | 'secondScanTimestamp'> & { 
  student: { uid: string, name: string, roll?: string, email: string },
  firstScanTimestamp: string | null;
  secondScanTimestamp: string | null;
};


interface EditAttendanceDialogProps {
  record: StoredAttendanceRecord;
  onSave: (newStatus: StoredAttendanceRecord['finalStatus']) => void;
  onCancel: () => void;
}

export function EditAttendanceDialog({ record, onSave, onCancel }: EditAttendanceDialogProps) {
  const [newStatus, setNewStatus] = useState<StoredAttendanceRecord['finalStatus']>(record.finalStatus);

  const handleSave = () => {
    onSave(newStatus);
  };

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Attendance for {record.student.name}</DialogTitle>
          <DialogDescription>
            Manually override the attendance status for this student.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">
              Status
            </Label>
            <Select onValueChange={(value) => setNewStatus(value as StoredAttendanceRecord['finalStatus'])} value={newStatus}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="left_early">Left Early</SelectItem>
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
  );
}
