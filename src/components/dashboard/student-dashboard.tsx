
'use client';
import { useAuth } from '@/components/providers/auth-provider';
import { useStore, AttendanceRecord } from '@/components/providers/store-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, CheckCircle, Send, ShieldAlert, Wifi, WifiOff, Camera, School, Building, KeyRound, Upload } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useToast } from '@/hooks/use-toast.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { getDeviceId, getScanLabel, getDistance, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

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
  const { session, attendance, markAttendance, uploadSelfies, requestCorrection, attendanceMode, setAttendanceMode } = useStore();
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
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);


  useEffect(() => {
    setIsClient(true);
    // If user is not 'both', ensure they are in the correct mode to avoid re-renders.
    if (userProfile?.userType === 'student' && attendanceMode !== 'class') {
        setAttendanceMode('class');
    } else if (userProfile?.userType === 'resident' && attendanceMode !== 'hostel') {
        setAttendanceMode('hostel');
    }
  }, [userProfile, setAttendanceMode, attendanceMode]);

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
    let stream: MediaStream | null = null;
    const getCameraStream = async () => {
      if (showScanner) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          handleError(error as Error);
        }
      }
    };

    getCameraStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [showScanner]);


  const resetScanner = () => {
    setShowScanner(false);
    setScannedData(null);
    setIsLoading(false);
    setCapturedImages([]);
    setIsCapturing(false);
    setCaptureCountdown(null);
  }

  const processClassScan = async (result: string | null) => {
    if (!result || !userProfile) {
      toast({ variant: 'destructive', title: 'Scan Error', description: 'No QR code data was found.' });
      resetScanner();
      return;
    }
    if (isInRange === false) {
      toast({ variant: 'destructive', title: 'Out of Range', description: 'You are not in the allowed area to mark attendance.' });
      return;
    }

    setIsLoading(true);
    
    await markAttendance({
        studentId: userProfile.uid,
        code: result,
        deviceId: getDeviceId(),
    });
    resetScanner();
  };
  
  const handleScanResult = (result: any) => {
    const resultData = Array.isArray(result) ? result[0]?.rawValue : result?.rawValue;
    if (resultData && !scannedData) {
      setScannedData(resultData);
      processClassScan(resultData);
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
              description: error.message || 'Could not start video source.',
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
            <p className="text-muted-foreground">No session is currently active for {attendanceMode}s.</p>
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
    const currentScanData = record.scans[session.currentScan - 1];
    
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
    
    // Selfie check
    if (attendanceMode === 'hostel' && session.isSelfieRequired && currentScanData?.status !== 'absent' && !currentScanData?.photoURLs) {
      return (
        <div className="text-center space-y-4">
            <div className="text-lg">Attendance marked for {getScanLabel(session.currentScan)}.</div>
            <p className="text-muted-foreground">Please complete the selfie verification step.</p>
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
        <p className="text-muted-foreground">
          {attendanceMode === 'class' 
            ? "Scan the QR code to mark your attendance."
            : "Click the button to mark your attendance."
          }
        </p>
        {record.scans[0].status === 'absent' && session.currentScan > 1 && !record.correctionRequest && (
            <Button variant="secondary" onClick={() => setShowCorrectionDialog(true)}>Request Correction</Button>
        )}
      </div>
    );
  };

  const shouldShowScanButton = () => {
    if (!isClient || !myRecord) return false;
    if(myRecord.correctionRequest?.status === 'pending' || myRecord.correctionRequest?.status === 'denied') return false;
    if(isInRange === false) return false;

    const currentScanData = myRecord.scans[session.currentScan - 1];
    
    if(attendanceMode === 'hostel' && session.isSelfieRequired && currentScanData?.status !== 'absent' && !currentScanData?.photoURLs) {
        return false; // Don't show if selfie is pending
    }

    return session.status === 'active' && currentScanData?.status === 'absent';
  }


  const handleClassScanButtonClick = async () => {
      setShowScanner(true);
  }

 const handleHostelCheckIn = async () => {
    if (!userProfile) return;
    setIsLoading(true);

    const success = await markAttendance({
        studentId: userProfile.uid,
        code: '', // Not needed for hostel with unique keys
        deviceId: getDeviceId(),
    });

    if (success && session.isSelfieRequired) {
        setShowScanner(true);
        startCaptureSequence();
    } else {
        setIsLoading(false);
    }
  }


  const handleSubmitSelfies = async () => {
    if (!userProfile || capturedImages.length === 0) return;
    setIsLoading(true);

    await uploadSelfies(userProfile.uid, capturedImages);

    setIsLoading(false);
    toast({ title: 'Selfies Submitted!', description: 'Your identity has been verified for this scan.'});
    resetScanner();
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
    setShowScanner(true);
    setIsCapturing(true);
    const images: string[] = [];

    for (let i = 3; i > 0; i--) {
        setCaptureCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setCaptureCountdown(null);

    for (let i = 0; i < 3; i++) {
        const imageData = takePicture();
        if (imageData) {
            images.push(imageData);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setCapturedImages(images);
    setIsCapturing(false);
    setIsLoading(false); // Finished with the capture part of the process
  };


  const renderScannerContent = () => {
    if (isLoading && !isCapturing) {
      return (
        <div className="flex flex-col items-center justify-center h-48">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-semibold">Processing...</p>
        </div>
      );
    }
    
    // In hostel mode, after selfie capture, show submit button
    if (attendanceMode === 'hostel' && capturedImages.length > 0) {
        return (
            <div className="relative">
                <img src={capturedImages[0]} alt="Captured selfie" className="w-full aspect-video rounded-md" />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                     <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-white mt-2 font-semibold text-lg">Selfies Captured!</p>
                </div>
                 <div className="flex w-full gap-2 mt-4">
                    <Button onClick={resetScanner} className="w-full" variant="outline" disabled={isLoading}>Cancel</Button>
                    <Button onClick={handleSubmitSelfies} className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin" /> : <Upload className="mr-2"/>}
                        Submit Selfies
                    </Button>
                </div>
            </div>
        )
    }

    // This view is for showing the camera feed for selfies.
    if (attendanceMode === 'hostel' && showScanner) {
       return (
         <div className="relative">
            <video ref={videoRef} className="w-full aspect-video rounded-md" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />

            {isCapturing && captureCountdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <p className="text-8xl font-bold text-white">{captureCountdown}</p>
                </div>
            )}
             <div className="flex w-full gap-2 mt-4">
              <Button onClick={resetScanner} className="w-full" variant="outline">Cancel</Button>
            </div>
         </div>
      );
    }
    
    // Logic for QR Scanner (used by class mode)
    if (hasCameraPermission && showScanner && attendanceMode === 'class') {
       return (
          <>
            <p className="text-sm text-green-600 font-semibold mb-2">Point your camera at the QR code.</p>
            <Scanner
              onScan={handleScanResult}
              onError={handleError}
              components={{ audio: false, finder: true }}
              options={{ delayBetweenScanAttempts: 500, delayBetweenScanSuccess: 1000 }}
            />
            <div className="flex w-full gap-2 mt-4">
              <Button onClick={resetScanner} className="w-full" variant="outline" disabled={isLoading}>Cancel</Button>
            </div>
          </>
      );
    }

    const currentScanData = myRecord?.scans[session.currentScan - 1];
    if (attendanceMode === 'hostel' && session.isSelfieRequired && currentScanData?.status !== 'absent' && !currentScanData?.photoURLs) {
      return (
        <div className="w-full max-w-sm mx-auto text-center">
           <Button onClick={() => { setShowScanner(true); startCaptureSequence(); }} size="lg" disabled={isLoading || isCapturing}>
                <Camera className="mr-2 h-5 w-5" />
                Take Selfies for Verification
            </Button>
        </div>
      )
    }
    
    return null;
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold font-headline">{attendanceMode === 'class' ? 'Student' : 'Resident'} Dashboard</h1>
            <p className="text-muted-foreground">Welcome, {userProfile?.name}.</p>
        </div>
        {userProfile?.userType === 'both' && (
             <div className="flex items-center space-x-2">
                <School className={cn("h-6 w-6", attendanceMode === 'hostel' && 'text-muted-foreground')} />
                <Switch
                    id="attendance-mode-student"
                    checked={attendanceMode === 'hostel'}
                    onCheckedChange={(checked) => setAttendanceMode(checked ? 'hostel' : 'class')}
                />
                <Building className={cn("h-6 w-6", attendanceMode === 'class' && 'text-muted-foreground')} />
            </div>
        )}
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
                    ? `There is no active ${attendanceMode} attendance session.`
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
            {showScanner ? (
                <div className="w-full max-w-sm mx-auto text-center">
                    {renderScannerContent()}
                </div>
            ) : (
              <>
                {shouldShowScanButton() && attendanceMode === 'hostel' ? (
                  <Button onClick={handleHostelCheckIn} size="lg" disabled={isLoading || isInRange === false}>
                    <KeyRound className="mr-2 h-5 w-5" />Mark My Attendance
                  </Button>
                ) : shouldShowScanButton() && (
                  <Button onClick={handleClassScanButtonClick} size="lg" disabled={isLoading || isInRange === false}>
                    <QrCode className="mr-2 h-5 w-5" />Scan QR Code for {getScanLabel(session.currentScan)}
                  </Button>
                )}
                {renderScannerContent() /* This will render the selfie button if needed */}
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
