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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

export function StartSessionDialog({ children }: { children: React.ReactNode }) {
  const { startSession, attendanceMode } = useStore();

  const [open, setOpen] = useState(false);
  const [lateAfterMinutes, setLateAfterMinutes] = useState('10');
  const [subject, setSubject] = useState('');
  const [totalScans, setTotalScans] = useState('2');
  const [radius, setRadius] = useState('100');
  const [isSelfieRequired, setIsSelfieRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const minutes = parseInt(lateAfterMinutes, 10);
    const scans = parseInt(totalScans, 10);
    const radiusMeters = parseInt(radius, 10);

    if (isNaN(minutes) || minutes < 0 || isNaN(scans) || scans < 1 || scans > 3 || isNaN(radiusMeters) || radiusMeters <= 0) {
        setLoading(false);
        return;
    }
    
    await startSession({
      lateAfterMinutes: minutes, 
      subject, 
      totalScans: scans, 
      radius: radiusMeters,
      isSelfieRequired: attendanceMode === 'hostel' ? isSelfieRequired : false
    });

    setLoading(false);
    setOpen(false);
    setSubject('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleStart}>
          <DialogHeader>
            <DialogTitle>Start New Session</DialogTitle>
            <DialogDescription>
              Configure the settings for this {attendanceMode} attendance session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Title
              </Label>
              <Input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="col-span-3"
                placeholder={attendanceMode === 'class' ? "e.g. Physics 101" : "e.g. Evening Roll Call"}
                required
              />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="totalScans" className="text-right">
                Total Scans
              </Label>
               <Select onValueChange={setTotalScans} value={totalScans}>
                  <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select number of scans" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="1">1 Scan</SelectItem>
                      <SelectItem value="2">2 Scans (Default)</SelectItem>
                      <SelectItem value="3">3 Scans</SelectItem>
                  </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lateAfter" className="text-right col-span-2">
                Late After (minutes)
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="radius" className="text-right col-span-2">
                Radius (meters)
              </Label>
              <Input
                id="radius"
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="col-span-2"
                required
                min="1"
              />
            </div>
            {attendanceMode === 'hostel' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="selfie-required" className="text-right col-span-2">
                  Require Selfie
                </Label>
                <div className="col-span-2 flex items-center">
                  <Switch
                    id="selfie-required"
                    checked={isSelfieRequired}
                    onCheckedChange={setIsSelfieRequired}
                  />
                </div>
              </div>
            )}
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
