'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { QrScanner } from '@yudiel/react-qr-scanner';
import { useToast } from '@/hooks/use-toast.tsx';

export function StudentDashboard() {
  const { userProfile } = useAuth();
  const { session, attendance, markAttendance } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { toast } = useToast();
  
  // This state ensures the scanner component is only mounted on the client
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const myRecord = userProfile ? attendance.get(userProfile.uid) : undefined;

  const handleScan = (result: string) => {
    // The library now returns the raw string, not an object with a 'data' property
    if (result) {
      // The QR data from the admin is in the format "prefix:readableCode:timestamp"
      // We only need the readable code part.
      const code = result.split(':')[1];
      if (code && userProfile) {
        setShowScanner(false);
        setIsLoading(true);
        // Simulate a short delay for UX
        setTimeout(() => {
          markAttendance(userProfile.uid, code);
          setIsLoading(false);
        }, 500);
      }
    }
  };

  const handleError = (error: Error) => {
    // The scanner library can throw errors if camera access is denied or not found.
    if (error) {
       console.error('QR Scanner Error:', error);
       if (error.name === 'NotAllowedError') {
            toast({
              variant: 'destructive',
              title: 'Camera Access Denied',
              description: 'Please allow camera access in your browser settings.',
            });
       } else if (error.name === 'NotFoundError') {
            toast({
              variant: 'destructive',
              title: 'Camera Not Found',
              description: 'No camera was found on your device.',
            });
       } else {
            toast({
              variant: 'destructive',
              title: 'Scanning Error',
              description: 'An unexpected error occurred with the scanner.',
            });
       }
       setShowScanner(false);
    }
  }
  
  useEffect(() => {
    // This effect ensures that the camera stream is stopped when the component unmounts
    // or when the scanner is hidden, preventing the camera light from staying on.
    return () => {
        setShowScanner(false);
    }
  }, []);

  const getStatusContent = (record?: AttendanceRecord) => {
    if (!record || record.status === 'absent') {
      return (
        <div className="text-center">
          <div className="text-lg">You are marked <Badge variant="destructive">Absent</Badge></div>
          <p className="text-muted-foreground">Scan the QR code from the screen to mark your attendance.</p>
        </div>
      );
    }
    if (record.status === 'present') {
      return (
        <div className="text-center">
          <div className="text-lg">You are marked <Badge className="bg-green-600">Present</Badge></div>
          <p className="text-muted-foreground">Attendance recorded at {record.timestamp?.toLocaleTimeString()}.</p>
        </div>
      );
    }
    if (record.status === 'late') {
      return (
        <div className="text-center">
          <div className="text-lg">You are marked <Badge className="bg-yellow-500">Late</Badge></div>
          <p className="text-muted-foreground">Recorded at {record.timestamp?.toLocaleTimeString()} ({record.minutesLate} minutes late).</p>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-headline">Student Dashboard</h1>
        <p className="text-muted-foreground">Welcome, {userProfile?.name}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Session Status</CardTitle>
          <CardDescription>
            {session.status === 'inactive' || session.status === 'ended'
              ? 'There is no active attendance session.'
              : `An attendance session is active. Session round: ${session.status === 'active_first' ? '1' : '2'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 border rounded-lg bg-secondary/30 min-h-[120px] flex items-center justify-center">
            {getStatusContent(myRecord)}
          </div>

          {(session.status === 'active_first' || session.status === 'active_second') && (!myRecord || myRecord.status === 'absent') && isClient && (
            <div className="flex flex-col items-center gap-4">
              {showScanner ? (
                <div className="w-full max-w-sm mx-auto">
                    <QrScanner
                        onDecode={handleScan}
                        onError={handleError}
                        constraints={{ facingMode: 'environment' }}
                        containerStyle={{ width: '100%' }}
                    />
                    <Button onClick={() => setShowScanner(false)} className="mt-4 w-full" variant="outline">
                        Cancel
                    </Button>
                </div>
              ) : (
                <Button onClick={() => setShowScanner(true)} size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 h-5 w-5" />
                  )}
                  Scan QR Code
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
