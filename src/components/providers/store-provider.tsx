'use client';

import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { AttendanceSession, ScanData } from '@/models/backend';
import { uploadImageAndGetURL } from '@/firebase/storage';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';
export type AttendanceMode = 'class' | 'hostel';

export type AttendanceRecord = {
  student: UserProfile;
  scans: ScanData[];
  finalStatus: AttendanceStatus;
  correctionRequest?: {
      requestedAt: string;
      reason: string;
      status: 'pending' | 'approved' | 'denied';
  };
};

export type AttendanceMap = Map<string, AttendanceRecord>;

type SessionStatus = 'inactive' | 'active' | 'ended';
export type Session = {
  status: SessionStatus;
  qrCodeValue: string;
  readableCode: string;
  startTime: Date | null;
  
  currentScan: number;
  totalScans: number;

  lateAfterMinutes: number;
  secondScanLateAfterMinutes?: number;
  thirdScanLateAfterMinutes?: number;
  radius?: number; // Allowed radius in meters
  isSelfieRequired?: boolean;

  lat?: number;
  lng?: number;
};

type MarkAttendancePayload = {
    studentId: string;
    code: string;
    deviceId: string;
    photoURLs?: string[];
};

type StartSessionPayload = {
  lateAfterMinutes: number;
  subject: string;
  totalScans: number;
  radius: number;
  isSelfieRequired: boolean;
};


type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: (payload: StartSessionPayload) => Promise<void>;
  endSession: () => void;
  markAttendance: (payload: MarkAttendancePayload) => Promise<void>;
  activateNextScan: () => void;
  requestCorrection: (studentId: string, reason: string) => void;
  handleCorrectionRequest: (studentId: string, approved: boolean) => void;
  attendanceMode: AttendanceMode;
  setAttendanceMode: (mode: AttendanceMode) => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function useUsers(attendanceMode: AttendanceMode) {
    const { firestore } = useFirebase();

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        
        const baseQuery = query(collection(firestore, 'users'), where('role', '==', 'viewer'));
        
        if (attendanceMode === 'class') {
            return query(baseQuery, where('userType', 'in', ['student', 'both']));
        } else { // hostel mode
            return query(baseQuery, where('userType', 'in', ['resident', 'both']));
        }

    }, [firestore, attendanceMode]);

    const { data: users, isLoading } = useCollection<UserProfile>(usersQuery);

    return { users: users || [], isLoading };
}


export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { firestore } = useFirebase();
  const { userProfile } = useAuth();
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('class');
  const { users: students, isLoading: areStudentsLoading } = useUsers(attendanceMode);


  const sessionDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'sessions', `${attendanceMode}-current`);
  }, [firestore, attendanceMode]);

  const { data: dbSession } = useDoc<AttendanceSession>(sessionDocRef);

  // Live attendance records from Firestore
  const liveRecordsQuery = useMemoFirebase(() => {
    if (!firestore || !dbSession) return null;
    return collection(firestore, 'sessions', `${attendanceMode}-current`, 'records');
  }, [firestore, dbSession, attendanceMode]);

  const { data: liveRecords } = useCollection<any>(liveRecordsQuery);
  
  const [session, setSession] = useState<Session>({
    status: 'inactive',
    qrCodeValue: '',
    readableCode: '',
    startTime: null,
    currentScan: 0,
    totalScans: 0,
    lateAfterMinutes: 0,
    radius: 100,
    isSelfieRequired: false,
  });

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [devicesInUse, setDevicesInUse] = useState<Map<number, Set<string>>>(new Map());
  
  const usersForSession = useMemo(() => {
    if(userProfile?.role === 'admin') return students;
    if(userProfile?.role === 'viewer') return [userProfile];
    return [];
  }, [userProfile, students]);


  // Effect to sync local session state from the main session document
  useEffect(() => {
    if (dbSession) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      
      let qrCodeValue = '';
      let readableCode = '';

      switch(dbSession.currentScan) {
        case 1:
            qrCodeValue = dbSession.key;
            break;
        case 2:
            qrCodeValue = dbSession.secondKey || '';
            break;
        case 3:
            qrCodeValue = dbSession.thirdKey || '';
            break;
      }
       if(qrCodeValue) {
          readableCode = parseQrCodeValue(qrCodeValue).readableCode;
       }


      setSession({ 
          status: 'active',
          qrCodeValue,
          readableCode,
          startTime,
          lat: dbSession.lat,
          lng: dbSession.lng,
          currentScan: dbSession.currentScan,
          totalScans: dbSession.totalScans,
          lateAfterMinutes: dbSession.lateAfterMinutes,
          secondScanLateAfterMinutes: dbSession.secondScanLateAfterMinutes,
          thirdScanLateAfterMinutes: dbSession.thirdScanLateAfterMinutes,
          radius: dbSession.radius,
          isSelfieRequired: dbSession.isSelfieRequired,
      });
    } else if (session.status === 'active') {
        setSession({
          status: 'ended', 
          qrCodeValue: '',
          readableCode: '',
          startTime: null,
          currentScan: 0,
          totalScans: 0,
          lateAfterMinutes: 0,
          radius: 100,
          isSelfieRequired: false,
        });
        setAttendance(new Map());
    } else {
        // Ensure session is reset if dbSession becomes null and session was already inactive
         setSession({
          status: 'inactive', 
          qrCodeValue: '',
          readableCode: '',
          startTime: null,
          currentScan: 0,
          totalScans: 0,
          lateAfterMinutes: 0,
          radius: 100,
          isSelfieRequired: false,
        });
        setAttendance(new Map());
    }
  }, [dbSession, session.status]);

  // Effect to sync local attendance map from live Firestore records
  useEffect(() => {
    if (session.status !== 'active') return;

    const usersToProcess = userProfile?.role === 'admin' ? students : (userProfile ? [userProfile] : []);

    if (usersToProcess.length > 0) {
      const newAttendance = new Map<string, AttendanceRecord>();
      const newDevices = new Map<number, Set<string>>();
      
      for (let i = 1; i <= (session.totalScans || 3); i++) {
          newDevices.set(i, new Set());
      }

      usersToProcess.forEach(student => {
          const liveRecordData = liveRecords?.find(r => r.id === student.uid);
          if (liveRecordData) {
               const hydratedRecord: AttendanceRecord = {
                  student: liveRecordData.student,
                  scans: liveRecordData.scans.map((scan: any) => ({
                      ...scan,
                      timestamp: scan.timestamp ? new Date(scan.timestamp.seconds ? scan.timestamp.seconds * 1000 : scan.timestamp) : null
                  })),
                  finalStatus: liveRecordData.finalStatus,
                  correctionRequest: liveRecordData.correctionRequest
              };
              newAttendance.set(student.uid, hydratedRecord);

              hydratedRecord.scans.forEach((scan, index) => {
                  if (scan.status !== 'absent' && scan.deviceId) {
                      newDevices.get(index + 1)?.add(scan.deviceId);
                  }
              });

          } else {
               const defaultRecord: AttendanceRecord = {
                  student,
                  scans: Array.from({ length: session.totalScans || 2 }, () => ({
                      status: 'absent',
                      timestamp: null,
                      minutesLate: 0,
                  })),
                  finalStatus: 'absent'
              };
              newAttendance.set(student.uid, defaultRecord);
          }
      });
      setAttendance(newAttendance);
      setDevicesInUse(newDevices);
    }
  }, [liveRecords, students, session.totalScans, session.status, userProfile]);


  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0] || '', readableCode: parts[1] || '', timestamp: parts[2] || '' };
  };

  const startSession = useCallback(async (payload: StartSessionPayload) => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Location Error', description: 'Geolocation is not supported by your browser.' });
      return;
    }
    if (!firestore || !userProfile || !sessionDocRef || students.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not start session. Ensure residents are loaded and you have permissions.' });
        return;
    }

    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const { qrCodeValue } = generateNewCode('scan1');
          
          const sessionData: Partial<AttendanceSession> = {
            key: qrCodeValue,
            adminUid: userProfile.uid,
            createdAt: new Date().toISOString(),
            lat: latitude,
            lng: longitude,
            subject: payload.subject,
            totalScans: payload.totalScans,
            currentScan: 1,
            radius: payload.radius,
            isSelfieRequired: payload.isSelfieRequired,
          };
          
          if (attendanceMode === 'class') {
            sessionData.lateAfterMinutes = payload.lateAfterMinutes;
          }
    
          if (payload.totalScans >= 2) {
              sessionData.secondScanLateAfterMinutes = payload.lateAfterMinutes;
          }
          if (payload.totalScans === 3) {
            sessionData.thirdScanLateAfterMinutes = payload.lateAfterMinutes;
          }
          
          const batch = writeBatch(firestore);
          batch.set(sessionDocRef, sessionData);
    
          students.forEach(student => {
              const recordRef = doc(firestore, 'sessions', `${attendanceMode}-current`, 'records', student.uid);
              const initialRecord = {
                  student: {
                    uid: student.uid,
                    name: student.name,
                    email: student.email,
                    role: student.role,
                    roll: student.roll,
                    userType: student.userType
                  }, 
                  scans: Array.from({ length: payload.totalScans }, () => ({
                      status: 'absent',
                      timestamp: null,
                      minutesLate: 0,
                  })),
                  finalStatus: 'absent',
              };
              batch.set(recordRef, initialRecord);
          });
          
          await batch.commit();
          
          toast({ title: 'Session Started', description: `Residents can now perform the first scan.` });
          resolve();
        } catch (error) {
          toast({ variant: 'destructive', title: 'Session Start Failed', description: (error as Error).message });
          reject(error);
        }
      }, (error) => {
          toast({ variant: 'destructive', title: 'Location Error', description: `Could not get location: ${error.message}` });
          reject(error);
      });
    });
  }, [toast, firestore, userProfile, sessionDocRef, students, attendanceMode]);
  
 const endSession = useCallback(async () => {
    if (!sessionDocRef || !dbSession || !firestore) return;

    try {
        const currentRecordsPath = `sessions/${attendanceMode}-current/records`;
        const recordsSnapshot = await getDocs(collection(firestore, currentRecordsPath));
        
        // Use a single batch to update finalStatus for live records
        const updateBatch = writeBatch(firestore);
        recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const scansCompleted = recordData.scans.filter((s: ScanData) => s.status !== 'absent').length;
            let finalStatus: AttendanceStatus = 'absent';
            
            if (scansCompleted > 0 && scansCompleted < recordData.scans.length) {
              finalStatus = 'left_early';
            } else if (scansCompleted === recordData.scans.length) {
                const isLate = recordData.scans.some((s: ScanData) => s.status === 'late');
                finalStatus = isLate ? 'late' : 'present';
            }

            updateBatch.update(recordDoc.ref, { finalStatus });
        });
        await updateBatch.commit();


        // Now, perform the archival in a second step
        const archiveBatch = writeBatch(firestore);
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        
        const sessionToArchive: Partial<AttendanceSession> = {
          ...dbSession
        };

        // Clean up undefined optional fields before archiving
        if (sessionToArchive.secondKey === undefined) delete sessionToArchive.secondKey;
        if (sessionToArchive.thirdKey === undefined) delete sessionToArchive.thirdKey;


        archiveBatch.set(archiveSessionRef, sessionToArchive);
        
        // Re-fetch records that now have the finalStatus updated
        const finalRecordsSnapshot = await getDocs(collection(firestore, currentRecordsPath));

        finalRecordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const archiveRecordRef = doc(firestore, 'sessions', archiveSessionRef.id, 'records', recordDoc.id);
            const dataToArchive = {
                ...recordData,
                scans: recordData.scans.map((scan: any) => {
                    let timestamp = null;
                    // Handle both Firestore Timestamps and ISO strings
                    if (scan.timestamp) {
                        if (scan.timestamp.toDate) { // It's a Firestore Timestamp
                            timestamp = scan.timestamp.toDate().toISOString();
                        } else if (typeof scan.timestamp === 'string') { // It's already an ISO string
                            timestamp = scan.timestamp;
                        }
                    }
                    return {
                        ...scan,
                        timestamp,
                    };
                }),
                correctionRequest: recordData.correctionRequest || null,
            };
            archiveBatch.set(archiveRecordRef, dataToArchive);
            archiveBatch.delete(recordDoc.ref); // Delete from live collection
        });

        archiveBatch.delete(sessionDocRef); // Delete the live session doc

        await archiveBatch.commit();

        toast({ title: 'Session Ended', description: 'Attendance has been archived.' });

    } catch (error: any) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: error.message || 'Could not archive records.' });
    }
}, [sessionDocRef, dbSession, firestore, toast, attendanceMode]);


const markAttendance = useCallback(async (payload: MarkAttendancePayload) => {
    const { studentId, code, deviceId, photoURLs } = payload;
    
    if (!firestore || session.status !== 'active' || !session.startTime) {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return;
    }
    
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);
    const studentRecordSnap = await getDoc(studentDocRef);
    if (!studentRecordSnap.exists()) {
        toast({ variant: 'destructive', title: 'Record not found', description: 'Your attendance record could not be found.' });
        return;
    }
    const studentRecord = studentRecordSnap.data();
    const currentScanIndex = session.currentScan - 1;

    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== session.readableCode.toUpperCase()) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect for the current scan.' });
        return;
    }
    
    if (devicesInUse.get(session.currentScan)?.has(deviceId)) {
        toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for this scan.' });
        return;
    }

    if (studentRecord.scans[currentScanIndex]?.status !== 'absent') {
        toast({ title: 'Already Scanned', description: `You have already completed Scan ${session.currentScan}.` });
        return;
    }

    const now = new Date();
    let status: 'present' | 'late' = 'present';
    let minutesLate = 0;
    
    const latePolicies = [session.lateAfterMinutes, session.secondScanLateAfterMinutes, session.thirdScanLateAfterMinutes];
    const latePolicyForCurrentScan = latePolicies[currentScanIndex];
    
    if (attendanceMode === 'class' && latePolicyForCurrentScan !== undefined && session.startTime) {
        const cutoffTime = new Date(session.startTime.getTime() + latePolicyForCurrentScan * 60000);
        if (now > cutoffTime) {
            status = 'late';
            minutesLate = Math.round((now.getTime() - cutoffTime.getTime()) / 60000);
        }
    }
    
    const updatedScans = [...studentRecord.scans];
    const scanUpdate: Partial<ScanData> = {
        status,
        minutesLate,
        timestamp: now.toISOString(),
        deviceId: deviceId,
    };

    if (session.isSelfieRequired && photoURLs && photoURLs.length > 0) {
      try {
        const uploadedURLs = await Promise.all(
          photoURLs.map(dataUrl => uploadImageAndGetURL(dataUrl, studentId))
        );
        // Correctly use photoURLs as per the schema
        scanUpdate.photoURLs = uploadedURLs;
      } catch (error) {
        toast({ variant: 'destructive', title: 'Image Upload Failed', description: (error as Error).message });
        return; // Stop if upload fails
      }
    }
    
    updatedScans[currentScanIndex] = scanUpdate;
    
    updateDocumentNonBlocking(studentDocRef, { scans: updatedScans });
    toast({ title: `Scan ${session.currentScan} Completed!`, description: `You are marked as ${status.toUpperCase()}${minutesLate > 0 ? ` (${minutesLate} min late)` : ''}.` });

}, [session, firestore, devicesInUse, toast, attendanceMode]);
  
  
  const activateNextScan = useCallback(async () => {
    if(!firestore || !sessionDocRef || !dbSession) return;
    
    const nextScanNumber = dbSession.currentScan + 1;
    if (nextScanNumber > dbSession.totalScans) {
        toast({ variant: 'destructive', title: 'No More Scans', description: 'This was the final scan of the session.' });
        return;
    }

    try {
        const { qrCodeValue } = generateNewCode(`scan${nextScanNumber}`);
        
        let keyFieldToUpdate: 'secondKey' | 'thirdKey';
        if (nextScanNumber === 2) keyFieldToUpdate = 'secondKey';
        else if (nextScanNumber === 3) keyFieldToUpdate = 'thirdKey';
        else return;
        
        const updatePayload = { 
            currentScan: nextScanNumber,
            [keyFieldToUpdate]: qrCodeValue
        };
        
        await updateDocumentNonBlocking(sessionDocRef, updatePayload);
        
        toast({ title: `Scan ${nextScanNumber} Activated`, description: 'Residents must scan again to continue.' });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Activation Failed', description: 'Could not activate the next scan.' });
        console.error("Failed to activate next scan:", error);
    }
  }, [firestore, dbSession, toast, sessionDocRef]);

  const requestCorrection = useCallback(async(studentId: string, reason: string) => {
    if (!firestore || session.status !== 'active') {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'Cannot submit request for an inactive session.' });
        return;
    }
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);
    
    const correctionRequest = {
        requestedAt: new Date().toISOString(),
        reason: reason,
        status: 'pending',
    };

    updateDocumentNonBlocking(studentDocRef, { correctionRequest });
    toast({ title: 'Request Submitted', description: 'Your attendance correction request has been sent to the admin.' });

  }, [firestore, session.status, toast, attendanceMode]);

  const handleCorrectionRequest = useCallback(async(studentId: string, approved: boolean) => {
    if (!firestore) return;
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);

    const studentRecordSnap = await getDoc(studentDocRef);
    if (!studentRecordSnap.exists()) return;
    
    const studentRecord = studentRecordSnap.data();

    const updateData: any = {
      'correctionRequest.status': approved ? 'approved' : 'denied'
    };

    if (approved) {
        const updatedScans = [...studentRecord.scans];
        updatedScans[0] = {
            status: 'present',
            minutesLate: 0,
            timestamp: new Date().toISOString(),
            deviceId: 'manual_admin_override',
        };
        updateData.scans = updatedScans;
        toast({ title: 'Request Approved', description: `${studentRecord.student.name} marked as present for scan 1.` });
    } else {
        toast({ title: 'Request Denied', description: `Correction request for ${studentRecord.student.name} has been denied.` });
    }

    updateDocumentNonBlocking(studentDocRef, updateData);

  }, [firestore, toast, attendanceMode]);


  const value = useMemo(() => ({
    session,
    students: usersForSession, 
    attendance,
    startSession,
    endSession,
    markAttendance,
    activateNextScan,
    requestCorrection,
    handleCorrectionRequest,
    attendanceMode,
    setAttendanceMode,
  }), [session, usersForSession, attendance, startSession, endSession, markAttendance, activateNextScan, requestCorrection, handleCorrectionRequest, attendanceMode, setAttendanceMode]);


  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
