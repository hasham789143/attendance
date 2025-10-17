'use client';

import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getDistance } from '@/lib/utils';
import { AttendanceSession, ScanData } from '@/models/backend';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';


// This represents the live attendance record in the component's state.
// Timestamps are Date objects for easier manipulation.
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

  lat?: number;
  lng?: number;
};

type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: (lateAfterMinutes: number, subject: string, totalScans: number) => void;
  endSession: () => void;
  markAttendance: (studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => void;
  activateNextScan: () => void;
  requestCorrection: (studentId: string, reason: string) => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function useStudents() {
    const { firestore } = useFirebase();
    const { userProfile } = useAuth();

    const studentsQuery = useMemoFirebase(() => {
        if (userProfile?.role !== 'admin' || !firestore) return null;
        return query(collection(firestore, 'users'), where('role', '==', 'viewer'));
    }, [userProfile, firestore]);

    const { data: allStudents, isLoading: areStudentsLoading } = useCollection<UserProfile>(studentsQuery);

    const studentsList = useMemo(() => {
        if (userProfile?.role === 'admin') {
            return allStudents || [];
        }
        if (userProfile?.role === 'viewer') {
            return userProfile ? [userProfile] : [];
        }
        return [];
    }, [userProfile, allStudents]);

    return { students: studentsList, isLoading: areStudentsLoading && userProfile?.role === 'admin' };
}


export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { firestore } = useFirebase();
  const { userProfile } = useAuth();
  const { students, isLoading: areStudentsLoading } = useStudents();

  const sessionDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'sessions', 'current');
  }, [firestore]);

  const { data: dbSession } = useDoc<AttendanceSession>(sessionDocRef);

  // Live attendance records from Firestore
  const liveRecordsQuery = useMemoFirebase(() => {
    if (!firestore || !dbSession) return null;
    return collection(firestore, 'sessions', 'current', 'records');
  }, [firestore, dbSession]);

  const { data: liveRecords } = useCollection<any>(liveRecordsQuery);
  
  const [session, setSession] = useState<Session>({
    status: 'inactive',
    qrCodeValue: '',
    readableCode: '',
    startTime: null,
    currentScan: 0,
    totalScans: 0,
    lateAfterMinutes: 0,
  });

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [devicesInUse, setDevicesInUse] = useState<Map<number, Set<string>>>(new Map());

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
        });
        setAttendance(new Map());
    }
  }, [dbSession]);

  // Effect to sync local attendance map from live Firestore records
  useEffect(() => {
    if (liveRecords && students.length > 0) {
        const newAttendance = new Map<string, AttendanceRecord>();
        const newDevices = new Map<number, Set<string>>();
        
        for (let i = 1; i <= (session.totalScans || 3); i++) {
            newDevices.set(i, new Set());
        }

        students.forEach(student => {
            const liveRecordData = liveRecords.find(r => r.id === student.uid);
            if (liveRecordData) {
                 const hydratedRecord: AttendanceRecord = {
                    student: liveRecordData.student,
                    scans: liveRecordData.scans.map((scan: any) => ({
                        ...scan,
                        timestamp: scan.timestamp ? new Date(scan.timestamp.seconds * 1000) : null
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
  }, [liveRecords, students, session.totalScans]);


  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0] || '', readableCode: parts[1] || '', timestamp: parts[2] || '' };
  };

  const startSession = useCallback(async (lateAfterMinutes: number, subject: string, totalScans: number) => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Location Error', description: 'Geolocation is not supported by your browser.' });
      return;
    }
    if (!firestore || !userProfile || !sessionDocRef || students.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not start session. Ensure students are loaded.' });
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const { qrCodeValue } = generateNewCode('scan1');
      
      const sessionData: Partial<AttendanceSession> = {
        key: qrCodeValue,
        adminUid: userProfile.uid,
        createdAt: new Date().toISOString(),
        lat: latitude,
        lng: longitude,
        subject: subject,
        totalScans: totalScans,
        currentScan: 1,
        lateAfterMinutes: lateAfterMinutes,
        // Set all scan policies to the same for simplicity
        secondScanLateAfterMinutes: lateAfterMinutes,
        thirdScanLateAfterMinutes: totalScans === 3 ? lateAfterMinutes : null,
      }
      
      const batch = writeBatch(firestore);
      batch.set(sessionDocRef, sessionData);

      students.forEach(student => {
          const recordRef = doc(firestore, 'sessions', 'current', 'records', student.uid);
          const initialRecord = {
              student: {
                uid: student.uid,
                name: student.name,
                email: student.email,
                role: student.role,
                roll: student.roll,
              }, 
              scans: Array.from({ length: totalScans }, () => ({
                  status: 'absent',
                  timestamp: null,
                  minutesLate: 0,
              })),
              finalStatus: 'absent',
          };
          batch.set(recordRef, initialRecord);
      });
      
      await batch.commit();
      
      toast({ title: 'Session Started', description: `Students can now perform the first scan.` });

    }, (error) => {
        toast({ variant: 'destructive', title: 'Location Error', description: `Could not get location: ${error.message}` });
    });
  }, [toast, firestore, userProfile, sessionDocRef, students]);
  
 const endSession = useCallback(async () => {
    if (!sessionDocRef || !dbSession || !firestore) return;

    try {
        const batch = writeBatch(firestore);
        
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        
        // Finalize attendance before archiving
        const recordsSnapshot = await getDocs(collection(firestore, 'sessions', 'current', 'records'));
        recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const scansCompleted = recordData.scans.filter((s: ScanData) => s.status !== 'absent').length;
            let finalStatus: AttendanceStatus = 'absent';
            
            if (scansCompleted === recordData.scans.length) {
                const isLate = recordData.scans.some((s: ScanData) => s.status === 'late');
                finalStatus = isLate ? 'late' : 'present';
            } else if (scansCompleted > 0) {
                finalStatus = 'left_early';
            }

            batch.update(recordDoc.ref, { finalStatus });
        });
        await batch.commit();

        // Now archive with the finalized statuses
        const archiveBatch = writeBatch(firestore);

        const sessionToArchive: Partial<AttendanceSession> = {
          ...dbSession,
          key: dbSession.key,
          secondKey: dbSession.secondKey || null,
          thirdKey: dbSession.thirdKey || null,
        };
        archiveBatch.set(archiveSessionRef, sessionToArchive);
        
        const finalRecordsSnapshot = await getDocs(collection(firestore, 'sessions', 'current', 'records'));
        finalRecordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const archiveRecordRef = doc(firestore, 'sessions', archiveSessionRef.id, 'records', recordDoc.id);
            const dataToArchive = {
                ...recordData,
                scans: recordData.scans.map((scan: any) => ({
                    ...scan,
                    timestamp: scan.timestamp ? scan.timestamp.toDate().toISOString() : null,
                })),
                correctionRequest: recordData.correctionRequest || null,
            };
            archiveBatch.set(archiveRecordRef, dataToArchive);
            archiveBatch.delete(recordDoc.ref); // Delete live record
        });

        archiveBatch.delete(sessionDocRef); // Delete live session

        await archiveBatch.commit();

        toast({ title: 'Session Ended', description: 'Attendance has been archived.' });

    } catch (error: any) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: error.message || 'Could not archive records.' });
    }
}, [sessionDocRef, dbSession, firestore, toast]);


const markAttendance = useCallback(async (studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => {
    if (!firestore || session.status !== 'active' || !session.startTime) {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return;
    }
    
    const studentDocRef = doc(firestore, 'sessions/current/records', studentId);
    const studentRecordSnap = await getDoc(studentDocRef);
    if (!studentRecordSnap.exists()) {
        toast({ variant: 'destructive', title: 'Record not found', description: 'Your attendance record could not be found.' });
        return;
    }
    const studentRecord = studentRecordSnap.data();
    const currentScanIndex = session.currentScan - 1;

    const { readableCode: expectedCode, prefix: codePrefix } = parseQrCodeValue(session.qrCodeValue);
    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== expectedCode.toUpperCase()) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
        return;
    }

    if (codePrefix !== `scan${session.currentScan}`) {
        toast({ variant: 'destructive', title: 'Wrong Session QR', description: `This QR is for Scan ${codePrefix.replace('scan', '')}, but Scan ${session.currentScan} is active.` });
        return;
    }
    
    const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
    if (distance > 100) { // 100 meters
        toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
        return;
    }
    
    // Check if device has already been used for this scan
    if (devicesInUse.get(session.currentScan)?.has(deviceId)) {
        toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for this scan.' });
        return;
    }

    if (studentRecord.scans[currentScanIndex].status !== 'absent') {
        toast({ title: 'Already Scanned', description: `You have already completed Scan ${session.currentScan}.` });
        return;
    }

    // For scans > 1, check if previous was completed
    if(session.currentScan > 1 && studentRecord.scans[currentScanIndex - 1].status === 'absent') {
        toast({ variant: 'destructive', title: `Scan ${session.currentScan -1} Missed`, description: `You must complete the previous scan before this one.` });
        return;
    }


    const now = new Date();
    let status: 'present' | 'late' = 'present';
    let minutesLate = 0;
    
    const latePolicies = [session.lateAfterMinutes, session.secondScanLateAfterMinutes, session.thirdScanLateAfterMinutes];
    const latePolicyForCurrentScan = latePolicies[currentScanIndex];
    
    if (latePolicyForCurrentScan !== undefined && session.startTime) {
        const cutoffTime = new Date(session.startTime.getTime() + latePolicyForCurrentScan * 60000);
        if (now > cutoffTime) {
            status = 'late';
            minutesLate = Math.round((now.getTime() - cutoffTime.getTime()) / 60000);
        }
    }
    
    const updatedScans = [...studentRecord.scans];
    updatedScans[currentScanIndex] = {
        status,
        minutesLate,
        timestamp: now.toISOString(),
        deviceId: deviceId,
    };
    
    updateDocumentNonBlocking(studentDocRef, { scans: updatedScans });
    toast({ title: `Scan ${session.currentScan} Completed!`, description: `You are marked as ${status.toUpperCase()}${minutesLate > 0 ? ` (${minutesLate} min late)` : ''}.` });

}, [session, firestore, devicesInUse, toast]);
  
  
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
        
        await updateDocumentNonBlocking(sessionDocRef, { 
            currentScan: nextScanNumber,
            [keyFieldToUpdate]: qrCodeValue
        });
        
        toast({ title: `Scan ${nextScanNumber} Activated`, description: 'Students must scan again to continue.' });

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
    const studentDocRef = doc(firestore, 'sessions/current/records', studentId);
    
    const correctionRequest = {
        requestedAt: new Date().toISOString(),
        reason: reason,
        status: 'pending',
    };

    updateDocumentNonBlocking(studentDocRef, { correctionRequest });
    toast({ title: 'Request Submitted', description: 'Your attendance correction request has been sent to the admin.' });

  }, [firestore, session.status, toast]);


  const value = useMemo(() => ({
    session,
    students: areStudentsLoading ? [] : students, 
    attendance,
    startSession,
    endSession,
    markAttendance,
    activateNextScan,
    requestCorrection,
  }), [session, students, areStudentsLoading, attendance, startSession, endSession, markAttendance, activateNextScan, requestCorrection]);


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
