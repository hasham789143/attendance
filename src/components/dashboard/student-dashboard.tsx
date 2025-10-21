
'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, CheckCircle, Send, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useToast } from '@/hooks/use-toast.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { getDeviceId, getScanLabel, getDistance } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

function CorrectionRequestDialog({ onSend, onCancel }: { onSend: (reason: string) => void, onCancel: () => void }) {
    const [reason, setReason] = useState('');
    
    const handleSend = () => {
        if (reason.trim()) {
            onSend(reason);
        }
    }
    
    return (
        <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Attendance Correction</DialogTitle>
                    <DialogDescription>
                        Explain to the administrator why you missed the first scan.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="reason">Reason for missing scan:</Label>
                    <Textarea 
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., I had a technical issue with my device."
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSend} disabled={!reason.trim()}>
                        <Send className="mr-2 h-4 w-4"/> Send Request
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function StudentDashboard() {
  const { userProfile } = useAuth();
  const { session, attendance, markAttendance, requestCorrection } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  
  const [isClient, setIsClient] = useState(false);
  const [isInRange, setIsInRange] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const myRecord = userProfile ? attendance.get(userProfile.uid) : undefined;

  useEffect(() => {
    if (session.status === 'active' && session.lat && session.lng && session.radius) {
      setIsInRange(null);
      setDistance(null);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const dist = getDistance({ lat: session.lat!, lng: session.lng! }, { lat: latitude, lng: longitude });
          setDistance(dist);
          setIsInRange(dist <= session.radius!);
          setLocationError(null);
        },
        (error) => {
          const errorMessage = `Could not get location: ${error.message}. Please enable location services.`;
          toast({ variant: 'destructive', title: 'Location Error', description: errorMessage });
          setIsInRange(false);
          setDistance(null);
          setLocationError(errorMessage);
        }
      );
    } else {
      setIsInRange(null);
      setDistance(null);
      setLocationError(null);
    }
  }, [session.status, session.lat, session.lng, session.radius, toast]);


  const resetScanner = () => {
    setShowScanner(false);
    setScannedData(null);
    setIsLoading(false);
  }

  const processScan = (result: string | null) => {
    if (result && userProfile) {
      if (!isInRange) {
        toast({
            variant: 'destructive',
            title: 'Out of Range',
            description: 'You are not in the allowed area to mark attendance.',
        });
        return;
      }
      setIsLoading(true);
      const deviceId = getDeviceId();
      markAttendance(userProfile.uid, result, deviceId);
      resetScanner();
    } else {
        toast({ variant: 'destructive', title: 'Scan Error', description: 'No QR code data was found.' });
        resetScanner();
    }
  };
  
  const handleScanResult = (result: any) => {
    const resultData = Array.isArray(result) ? result[0]?.rawValue : result?.rawValue;
    if (resultData && !scannedData) {
      setScannedData(resultData);
    }
  };

  const handleError = (error: Error) => {
    if (error) {
       console.error('QR Scanner Error:', error);
       if (error.name === 'NotAllowedError') {
            setHasCameraPermission(false);
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
       resetScanner();
    }
  }

  const handleCorrectionRequest = (reason: string) => {
      if (userProfile) {
          requestCorrection(userProfile.uid, reason);
      }
      setShowCorrectionDialog(false);
  }

  const getStatusContent = (record?: AttendanceRecord) => {
    if (session.status === 'inactive' || session.status === 'ended') {
      return (
        <div className="text-center">
            <p className="text-muted-foreground">No session is currently active.</p>
        </div>
      )
    }
    
    if (!record) {
       return (
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto"/>
          <p className="text-muted-foreground mt-2">Loading attendance status...</p>
        </div>
      );
    }

    if (record.correctionRequest?.status === 'pending') {
        return (
            <div className="text-center text-lg text-yellow-600 flex items-center justify-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Correction request is pending admin approval.
            </div>
        );
    }
    
    if (record.correctionRequest?.status === 'denied') {
        return (
            <div className="text-center text-lg text-destructive flex items-center justify-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Your correction request was denied.
            </div>
        );
    }


    const scansCompleted = record.scans.filter(s => s.status !== 'absent').length;

    if (scansCompleted === session.totalScans) {
        const isLate = record.scans.some(s => s.status === 'late');
        const statusBadge = isLate ? <Badge className="bg-yellow-500">Late</Badge> : <Badge className="bg-green-600">Present</Badge>;
        return (
            <div className="text-center">
                <div className="text-lg">Final Status: {statusBadge}</div>
                <p className="text-muted-foreground">All scans completed. Well done!</p>
            </div>
        );
    }

    if (scansCompleted > 0) {
        return (
            <div className="text-center">
              <div className="text-lg">{getScanLabel(scansCompleted + 1)} of {session.totalScans} is next.</div>
              <p className="text-muted-foreground">Please scan the next QR code when it is presented.</p>
            </div>
        );
    }
    
    // Default to absent
    return (
      <div className="text-center space-y-4">
        <div className="text-lg">You are marked <Badge variant="destructive">Absent</Badge></div>
        <p className="text-muted-foreground">Scan the QR code to mark your attendance.</p>
        {record.scans[0].status === 'absent' && session.currentScan > 1 && !record.correctionRequest && (
            <Button variant="secondary" onClick={() => setShowCorrectionDialog(true)}>Request Correction</Button>
        )}
      </div>
    );
  };

  const shouldShowScannerButton = () => {
    if (!isClient || !myRecord) return false;
    if(myRecord.correctionRequest?.status === 'pending' || myRecord.correctionRequest?.status === 'denied') return false;
    const scansCompleted = myRecord.scans.filter(s => s.status !== 'absent').length;
    // Only show if in range
    return session.status === 'active' && isInRange && scansCompleted < session.totalScans && myRecord.scans[session.currentScan - 1]?.status === 'absent';
  }

  const handleScanButtonClick = async () => {
     // Check for camera permission before showing scanner
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Immediately stop the stream
        setHasCameraPermission(true);
        setShowScanner(true);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
      }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-headline">Resident Dashboard</h1>
        <p className="text-muted-foreground">Welcome, {userProfile?.name}.</p>
      </div>

       {hasCameraPermission === false && (
          <Alert variant="destructive">
              <AlertTitle>Camera Access Required</AlertTitle>
              <AlertDescription>
                  Please allow camera access in your browser settings to use the scanner. You may need to reload the page after granting permission.
              </AlertDescription>
          </Alert>
      )}

      {locationError && (
          <Alert variant="destructive">
              <AlertTitle>Location Error</AlertTitle>
              <AlertDescription>
                  {locationError}
              </AlertDescription>
          </Alert>
      )}


      {showCorrectionDialog && (
          <CorrectionRequestDialog 
              onCancel={() => setShowCorrectionDialog(false)}
              onSend={handleCorrectionRequest}
          />
      )}

      <Card>
        <CardHeader className="flex flex-row justify-between items-start">
            <div>
                <CardTitle>Current Session Status</CardTitle>
                <CardDescription>
                    {session.status !== 'active'
                    ? 'There is no active attendance session.'
                    : `Session is active. Current scan: ${getScanLabel(session.currentScan)} of ${session.totalScans}`}
                </CardDescription>
            </div>
            {session.status === 'active' && (
                <Card className="p-3 w-fit">
                    {isInRange === null && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Checking location...</div>}
                    {isInRange === true && <div className="flex items-center gap-2 text-green-600 font-semibold"><Wifi className="h-4 w-4"/> In Range ({distance?.toFixed(0)}m away)</div>}
                    {isInRange === false && <div className="flex items-center gap-2 text-destructive font-semibold"><WifiOff className="h-4 w-4"/> Out of Range ({distance?.toFixed(0)}m away)</div>}
                </Card>
            )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 border rounded-lg bg-secondary/30 min-h-[120px] flex items-center justify-center">
            {getStatusContent(myRecord)}
          </div>

          <div className="flex flex-col items-center gap-4">
            {shouldShowScannerButton() && (
              <>
                {showScanner ? (
                  <div className="w-full max-w-sm mx-auto text-center">
                      {isLoading && (
                          <div className="flex flex-col items-center justify-center h-48">
                              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                              <p className="text-lg font-semibold">Validating...</p>
                          </div>
                      )}

                      {!isLoading && scannedData && (
                           <div className="flex flex-col items-center justify-center h-48">
                              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                              <p className="text-lg font-semibold">QR Code Scanned!</p>
                              <p className="text-muted-foreground">Click Done to confirm.</p>
                          </div>
                      )}
                      
                      {!isLoading && !scannedData && hasCameraPermission && (
                        <>
                          <div className="mb-2">
                                <p className="text-sm text-green-600 font-semibold">Point your camera at the QR code.</p>
                          </div>
                          <Scanner
                              onScan={handleScanResult}
                              onError={handleError}
                              components={{
                                audio: false,
                                finder: true,
                              }}
                              options={{
                                delayBetweenScanAttempts: 500,
                                delayBetweenScanSuccess: 1000,
                              }}
                          />
                        </>
                      )}

                      <div className="flex w-full gap-2 mt-4">
                        <Button onClick={resetScanner} className="w-full" variant="outline" disabled={isLoading}>
                            Cancel
                        </Button>
                         {scannedData && !isLoading && (
                            <Button onClick={() => processScan(scannedData)} className="w-full" disabled={!isInRange}>
                                Done
                            </Button>
                        )}
                      </div>
                  </div>
                ) : (
                  <Button onClick={handleScanButtonClick} size="lg" disabled={isLoading}>
                      <QrCode className="mr-2 h-5 w-5" />
                      Scan QR Code for {getScanLabel(session.currentScan)}
                  </Button>
                )}
              </>
            )}
            {session.status === 'active' && isInRange === false && !locationError &&
             <Alert variant="destructive">
                <AlertTitle>You are out of range</AlertTitle>
                <AlertDescription>
                    Please move closer to the session location to be able to scan the QR code.
                </AlertDescription>
            </Alert>
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    