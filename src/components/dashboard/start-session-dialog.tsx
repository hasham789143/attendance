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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/components/providers/store-provider';
import { Loader2 } from 'lucide-react';

export function StartSessionDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [lateAfterMinutes, setLateAfterMinutes] = useState('10');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const { startSession } = useStore();

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const minutes = parseInt(lateAfterMinutes, 10);
    if (isNaN(minutes) || minutes < 0) {
        // Simple validation, you could add a toast message
        setLoading(false);
        return;
    }
    
    // The startSession function is asynchronous because of geolocation
    // but we don't need to await it here. The UI will update reactively.
    startSession(minutes, subject);

    // We can close the dialog immediately.
    setLoading(false);
    setOpen(false);
    setSubject(''); // Reset subject for next time
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleStart}>
          <DialogHeader>
            <DialogTitle>Start New Session</DialogTitle>
            <DialogDescription>
              Configure the time window and subject for this attendance session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Subject
              </Label>
              <Input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="col-span-3"
                placeholder="e.g. Computer Science 101"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lateAfter" className="text-right col-span-2">
                Mark as Late after (minutes)
              </Label>
              <Input
                id="lateAfter"
                type="number"
                value={lateAfterMinutes}
                onChange={(e) => setLateAfterMinutes(e.target.value)}
                className="col-span-2"
                required
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm & Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
