
'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, CheckCircle, Send, ShieldAlert, Wifi, WifiOff, Camera } from 'lucide-react';
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
  const { session, attendance, markAttendance, requestCorrection, attendanceMode } = useStore();
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
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);


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

  useEffect(() => {
    if (showScanner && hasCameraPermission) {
      const getCameraStream = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          handleError(error as Error);
        }
      };
      getCameraStream();
    }
  }, [showScanner, hasCameraPermission]);


  const resetScanner = () => {
    setShowScanner(false);
    setScannedData(null);
    setIsLoading(false);
    setCapturedImage(null);
    if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
    }
  }

  const processScan = async (result: string | null) => {
    if (!result || !userProfile) {
      toast({ variant: 'destructive', title: 'Scan Error', description: 'No QR code data was found.' });
      resetScanner();
      return;
    }
    if (!isInRange) {
      toast({ variant: 'destructive', title: 'Out of Range', description: 'You are not in the allowed area to mark attendance.' });
      return;
    }

    if (attendanceMode === 'hostel' && session.isSelfieRequired) {
        await processHostelCheckin(result);
    } else {
        setIsLoading(true);
        const deviceId = getDeviceId();
        
        await markAttendance({
          studentId: userProfile.uid,
          code: result,
          deviceId,
          photoURLs: capturedImage ? [capturedImage] : undefined,
        });
        
        resetScanner();
    }
  };
  
  const handleScanResult = (result: any) => {
    const resultData = Array.isArray(result) ? result[0]?.rawValue : result?.rawValue;
    if (resultData && !scannedData) {
      setScannedData(resultData);
      if (attendanceMode === 'hostel' && session.isSelfieRequired) {
        processScan(resultData);
      }
    }
  };

  const handleError = (error: Error) => {
    if (error) {
       console.error('QR Scanner/Camera Error:', error);
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

    if (scansCompleted >= session.currentScan) {
         return (
            <div className="text-center">
              <div className="text-lg">{getScanLabel(scansCompleted + 1)} of {session.totalScans} is next.</div>
              <p className="text-muted-foreground">Please wait for the next QR code to be presented.</p>
            </div>
        );
    }
    
    // Default to absent for the current scan
    return (
      <div className="text-center space-y-4">
        <div className="text-lg">You are marked <Badge variant="destructive">Absent</Badge> for {getScanLabel(session.currentScan)}</div>
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
    
    if(isInRange === false) return false;

    return session.status === 'active' && myRecord.scans[session.currentScan - 1]?.status === 'absent';
  }

  const handleScanButtonClick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setHasCameraPermission(true);
        setShowScanner(true);
      } catch (error) {
        handleError(error as Error);
      }
  }

  const processHostelCheckin = async (code: string) => {
    if (!userProfile || !isInRange) return;
    setIsLoading(true);
    
    // The code is valid, now we just need to take pictures.
    // The markAttendance call will happen after picture capture.
    toast({ title: "Check-in confirmed!", description: "Now, please take your selfie."});
    setIsLoading(false);
    // Do not reset the scanner, keep it open for selfie capture.
    // The scannedData state is already set by handleScanResult.
  }
  
  const takePicture = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        return canvas.toDataURL('image/jpeg');
      }
    }
    return null;
  };

  const startCaptureSequence = async () => {
    if (!userProfile || !scannedData) return;
    setIsCapturing(true);
    const capturedImages: string[] = [];

    for (let i = 3; i > 0; i--) {
        setCaptureCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setCaptureCountdown(null);

    for (let i = 0; i < 3; i++) {
        const imageData = takePicture();
        if (imageData) {
            capturedImages.push(imageData);
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between shots
    }
    
    setIsLoading(true);
    const deviceId = getDeviceId();
    
    await markAttendance({
        studentId: userProfile.uid,
        code: scannedData,
        deviceId,
        photoURLs: capturedImages
    });

    setCapturedImage(capturedImages[0]);
    setIsCapturing(false);
    setIsLoading(false);
    toast({ title: 'Selfies Captured!', description: 'Your attendance has been recorded with your photos.'});

    setTimeout(() => {
        resetScanner();
    }, 2000);
  };


  const renderScannerContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-48">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-semibold">Validating...</p>
        </div>
      );
    }

    if (attendanceMode === 'hostel' && session.isSelfieRequired) {
      return renderHostelSelfieContent();
    }
    
    return renderDefaultScannerContent();
  }

  const renderDefaultScannerContent = () => (
    <>
      {scannedData ? (
        <div className="flex flex-col items-center justify-center h-48">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <p className="text-lg font-semibold">QR Code Scanned!</p>
          <p className="text-muted-foreground">Click Done to confirm.</p>
        </div>
      ) : hasCameraPermission && (
        <>
          <p className="text-sm text-green-600 font-semibold mb-2">Point your camera at the QR code.</p>
          <Scanner
            onScan={handleScanResult}
            onError={handleError}
            components={{ audio: false, finder: true }}
            options={{ delayBetweenScanAttempts: 500, delayBetweenScanSuccess: 1000 }}
          />
        </>
      )}
      <div className="flex w-full gap-2 mt-4">
        <Button onClick={resetScanner} className="w-full" variant="outline" disabled={isLoading}>Cancel</Button>
        {scannedData && <Button onClick={() => processScan(scannedData)} className="w-full" disabled={!isInRange}>Done</Button>}
      </div>
    </>
  );

  const renderHostelSelfieContent = () => (
     <div className="relative">
      {!scannedData ? (
         <>
          <p className="text-sm text-green-600 font-semibold mb-2">Scan the QR code to begin check-in.</p>
          <Scanner
            onScan={handleScanResult}
            onError={handleError}
            components={{ audio: false, finder: true }}
            options={{ delayBetweenScanAttempts: 500, delayBetweenScanSuccess: 1000 }}
          />
          <Button onClick={resetScanner} className="w-full mt-4" variant="outline">Cancel</Button>
         </>
      ) : (
        <>
          <video ref={videoRef} className="w-full aspect-video rounded-md" autoPlay muted playsInline />
          <canvas ref={canvasRef} className="hidden" />

          {isCapturing && captureCountdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-8xl font-bold text-white">{captureCountdown}</p>
              </div>
          )}
          
          {capturedImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <img src={capturedImage} alt="Captured selfie" className="h-32 w-auto rounded-lg border-2 border-primary" />
                  <p className="text-white mt-4 font-semibold">Attendance Recorded!</p>
              </div>
          )}

          {!isCapturing && !capturedImage && (
            <div className="mt-4">
              <p className="text-sm text-center text-muted-foreground mb-2">QR Code accepted. Position your face in the camera and take your pictures.</p>
              <Button onClick={startCaptureSequence} className="w-full" size="lg">
                  <Camera className="mr-2" /> Take 3 Pictures
              </Button>
            </div>
          )}
          
          <div className="flex w-full gap-2 mt-4">
              <Button onClick={resetScanner} className="w-full" variant="outline">Cancel</Button>
          </div>
        </>
      )}
     </div>
  );


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
                  Please allow camera access in your browser settings to use this feature. You may need to reload the page.
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
                    {renderScannerContent()}
                  </div>
                ) : (
                  <Button onClick={handleScanButtonClick} size="lg" disabled={isLoading}>
                    {attendanceMode === 'hostel' && session.isSelfieRequired 
                      ? <><QrCode className="mr-2 h-5 w-5" />Scan to Start Check-in</>
                      : <><QrCode className="mr-2 h-5 w-5" />Scan QR Code for {getScanLabel(session.currentScan)}</>
                    }
                  </Button>
                )}
              </>
            )}
            {session.status === 'active' && isInRange === false && !locationError &&
             <Alert variant="destructive">
                <AlertTitle>You are out of range</AlertTitle>
                <AlertDescription>
                    Please move closer to the session location to be able to check in.
                </AlertDescription>
            </Alert>
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
