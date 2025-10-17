
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AttendanceRecord } from '../providers/store-provider';

interface CorrectionRequestDialogProps {
  record: AttendanceRecord;
  onClose: (approved?: boolean) => void;
}

export function CorrectionRequestDialog({ record, onClose }: CorrectionRequestDialogProps) {
  if (!record.correctionRequest) return null;

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Review Request for {record.student.name}</DialogTitle>
          <DialogDescription>
            The student has requested a manual correction for a missed scan.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Alert>
            <AlertTitle>Reason Provided:</AlertTitle>
            <AlertDescription>
                {record.correctionRequest.reason}
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground mt-4">
            Approving this request will mark the first scan as "Present" for this student.
          </p>
        </div>
        <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="destructive" onClick={() => onClose(false)}>
                <ThumbsDown className="mr-2 h-4 w-4" />
                Deny Request
            </Button>
            <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => onClose(true)}>
                <ThumbsUp className="mr-2 h-4 w-4" />
                Approve Request
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
