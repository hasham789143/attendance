'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, CheckCircle, MapPin } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useToast } from '@/hooks/use-toast.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { getDeviceId, getDistance } from '@/lib/utils';

export function StudentDashboard() {
  const { userProfile } = useAuth();
  const { session, attendance, markAttendance } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const myRecord = userProfile ? attendance.get(userProfile.uid) : undefined;

  useEffect(() => {
    let stream: MediaStream | null = null;
    const getCameraPermission = async () => {
      if (showScanner) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasCameraPermission(false);
          setShowScanner(false); // Hide scanner if permission is denied
        }
      }
    };
    getCameraPermission();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [showScanner]);

  const resetScanner = () => {
    setShowScanner(false);
    setScannedData(null);
    setIsLoading(false);
  }

  const processScan = (result: string | null) => {
    if (result && userProfile) {
      setIsLoading(true);
      const deviceId = getDeviceId();

      // Simulate a 2-second delay for user feedback
      setTimeout(() => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            markAttendance(userProfile.uid, result, { lat: latitude, lng: longitude }, deviceId);
            resetScanner();
          },
          (error) => {
            toast({
              variant: 'destructive',
              title: 'Location Error',
              description: `Could not get location: ${error.message}. Please enable location services.`,
            });
            resetScanner();
          }
        );
      }, 2000);
    } else {
        toast({ variant: 'destructive', title: 'Scan Error', description: 'No QR code data was found.' });
        resetScanner();
    }
  };
  
  const handleCheckRange = () => {
    if (!session.lat || !session.lng) {
      toast({ variant: 'destructive', title: 'Session Error', description: 'Session location is not set.' });
      return;
    }
    
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const distance = getDistance({lat: session.lat!, lng: session.lng!}, {lat: latitude, lng: longitude});
        if (distance <= 100) { // 100 meters
             toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });
        } else {
             toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
        }
        setIsLoading(false);
      },
      (error) => {
        toast({
          variant: 'destructive',
          title: 'Location Error',
          description: `Could not get location: ${error.message}. Please enable location services.`,
        });
        setIsLoading(false);
      }
    );
  };
  
  const handleScanResult = (result: any) => {
    // The result from the scanner can be an array or a single object
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
          <p className="text-muted-foreground">Loading attendance status...</p>
        </div>
      );
    }

    const { finalStatus, firstScanStatus, secondScanStatus, minutesLate, firstScanTimestamp } = record;
    
    switch (finalStatus) {
      case 'present':
        return (
          <div className="text-center">
            <div className="text-lg">You are marked <Badge className="bg-green-600">Present</Badge></div>
            <p className="text-muted-foreground">Both scans completed. Well done!</p>
          </div>
        );
      case 'left_early':
        return (
          <div className="text-center">
            <div className="text-lg">Your status is <Badge className="bg-orange-500">Left Early</Badge></div>
            <p className="text-muted-foreground">You missed the second verification scan.</p>
          </div>
        );
      case 'absent':
        return (
          <div className="text-center">
            <div className="text-lg">You are marked <Badge variant="destructive">Absent</Badge></div>
            <p className="text-muted-foreground">Scan the QR code from the screen to mark your attendance.</p>
          </div>
        );
      default:
         if (firstScanStatus === 'late') {
          return (
            <div className="text-center">
              <div className="text-lg">You are marked <Badge className="bg-yellow-500">Late</Badge></div>
              <p className="text-muted-foreground">Recorded at {firstScanTimestamp?.toLocaleTimeString()} ({minutesLate} minutes late).</p>
            </div>
          );
        }
        if (firstScanStatus === 'present') {
           return (
            <div className="text-center">
              <div className="text-lg">You are marked <Badge className="bg-green-600">Present</Badge> (Scan 1)</div>
              <p className="text-muted-foreground">Waiting for the second verification scan.</p>
            </div>
          );
        }
        // Fallback for any other state
        return (
          <div className="text-center">
            <div className="text-lg">You are marked <Badge variant="destructive">Absent</Badge></div>
            <p className="text-muted-foreground">Scan the QR code to begin.</p>
          </div>
        );
    }
  };

  const shouldShowScannerButton = () => {
    if (!isClient || !myRecord) return false;

    if (session.status === 'active_first' && myRecord.firstScanStatus === 'absent') {
      return true;
    }
    if (session.status === 'active_second' && myRecord.firstScanStatus !== 'absent' && myRecord.secondScanStatus === 'absent') {
      return true;
    }
    return false;
  }


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-headline">Student Dashboard</h1>
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

      <Card>
        <CardHeader>
          <CardTitle>Current Session Status</CardTitle>
          <CardDescription>
            {session.status === 'inactive' || session.status === 'ended'
              ? 'There is no active attendance session.'
              : `An attendance session is active. Scan round: ${session.status === 'active_first' ? '1' : '2'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 border rounded-lg bg-secondary/30 min-h-[120px] flex items-center justify-center">
            {getStatusContent(myRecord)}
          </div>

          <div className="flex flex-col items-center gap-4">
            {session.status !== 'inactive' && session.status !== 'ended' && (
              <Button onClick={handleCheckRange} variant="outline" disabled={isLoading}>
                <MapPin className="mr-2 h-5 w-5" />
                Check Range
              </Button>
            )}

            {shouldShowScannerButton() && (
              <>
                {showScanner ? (
                  <div className="w-full max-w-sm mx-auto text-center">
                      <video ref={videoRef} className="w-full aspect-video rounded-md hidden" autoPlay muted />

                      {isLoading && (
                          <div className="flex flex-col items-center justify-center h-48">
                              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                              <p className="text-lg font-semibold">Marking present...</p>
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
                        <Scanner
                            onScan={handleScanResult}
                            onError={handleError}
                            components={{
                              audio: true,
                              finder: true,
                            }}
                            options={{
                              delayBetweenScanAttempts: 500,
                              delayBetweenScanSuccess: 1000,
                            }}
                        />
                      )}

                      <div className="flex w-full gap-2 mt-4">
                        <Button onClick={resetScanner} className="w-full" variant="outline" disabled={isLoading}>
                            Cancel
                        </Button>
                         {scannedData && !isLoading && (
                            <Button onClick={() => processScan(scannedData)} className="w-full">
                                Done
                            </Button>
                        )}
                      </div>
                  </div>
                ) : (
                  <Button onClick={() => setShowScanner(true)} size="lg" disabled={isLoading}>
                      <QrCode className="mr-2 h-5 w-5" />
                      Scan QR Code
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
