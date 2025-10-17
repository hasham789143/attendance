'use client';

import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getDistance } from '@/lib/utils';
import { AttendanceSession } from '@/models/backend';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';

// This represents the live attendance record in the component's state.
// Timestamps are Date objects for easier manipulation.
export type AttendanceRecord = {
  student: UserProfile;
  scan1_status: 'present' | 'late' | 'absent';
  scan1_timestamp: Date | null;
  scan1_minutesLate: number;
  scan2_status: 'present' | 'late' | 'absent' | 'n/a';
  scan2_timestamp: Date | null;
  scan2_minutesLate: number;
  finalStatus: AttendanceStatus;
};

export type AttendanceMap = Map<string, AttendanceRecord>;

type SessionStatus = 'inactive' | 'active_first' | 'active_second' | 'ended';
export type Session = {
  status: SessionStatus;
  qrCodeValue: string;
  readableCode: string;
  startTime: Date | null;
  firstScanCutoff: Date | null;
  secondScanCutoff: Date | null;
  lat?: number;
  lng?: number;
};

type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: (lateAfterMinutes: number, subject: string) => void;
  endSession: () => void;
  markAttendance: (studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => void;
  activateSecondQr: () => void;
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
    firstScanCutoff: null,
    secondScanCutoff: null,
  });

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [devicesInUse, setDevicesInUse] = useState<Set<string>>(new Set());

  // Effect to sync local session state from the main session document
  useEffect(() => {
    if (dbSession) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      const firstScanCutoff = dbSession.lateAfterMinutes ? new Date(startTime.getTime() + dbSession.lateAfterMinutes * 60 * 1000) : null;
      
      const { readableCode } = parseQrCodeValue(dbSession.key);
      
      setSession(prevSession => {
        const currentStatus = prevSession.status;
        let newStatus = (currentStatus === 'active_first' || currentStatus === 'active_second') ? currentStatus : 'active_first';

        let qrCodeValue = dbSession.key;
        let newReadableCode = readableCode;
        
        // If we are activating the second scan, use the new key from the DB if available
        if (newStatus === 'active_second' && dbSession.secondKey) {
            const { readableCode: secondReadableCode } = parseQrCodeValue(dbSession.secondKey);
            qrCodeValue = dbSession.secondKey;
            newReadableCode = secondReadableCode;
        }


        return { 
          ...prevSession,
          status: newStatus,
          qrCodeValue: qrCodeValue,
          readableCode: newReadableCode,
          startTime,
          firstScanCutoff,
          lat: dbSession.lat,
          lng: dbSession.lng,
        };
      });
    } else if (!dbSession && (session.status === 'active_first' || session.status === 'active_second')) {
        setSession({
          status: 'ended', 
          qrCodeValue: '',
          readableCode: '',
          startTime: null,
          firstScanCutoff: null,
          secondScanCutoff: null
        });
        setAttendance(new Map());
    }
  }, [dbSession]);

  // Effect to sync local attendance map from live Firestore records
  useEffect(() => {
    if (liveRecords && students.length > 0) {
        const newAttendance = new Map<string, AttendanceRecord>();
        const newDevices = new Set<string>();

        // Ensure every student has a record, even if it's just the default
        students.forEach(student => {
            const liveRecordData = liveRecords.find(r => r.id === student.uid);
            if (liveRecordData) {
                 const hydratedRecord: AttendanceRecord = {
                    student: liveRecordData.student,
                    scan1_status: liveRecordData.scan1_status,
                    scan1_timestamp: liveRecordData.scan1_timestamp ? new Date(liveRecordData.scan1_timestamp.seconds * 1000) : null,
                    scan1_minutesLate: liveRecordData.scan1_minutesLate || 0,
                    scan2_status: liveRecordData.scan2_status,
                    scan2_timestamp: liveRecordData.scan2_timestamp ? new Date(liveRecordData.scan2_timestamp.seconds * 1000) : null,
                    scan2_minutesLate: liveRecordData.scan2_minutesLate || 0,
                    finalStatus: liveRecordData.finalStatus,
                };
                newAttendance.set(student.uid, hydratedRecord);

                if(liveRecordData.scan1_status !== 'absent' && liveRecordData.deviceId) {
                    newDevices.add(liveRecordData.deviceId);
                }
            } else {
                 const defaultRecord: AttendanceRecord = {
                    student,
                    scan1_status: 'absent',
                    scan1_timestamp: null,
                    scan1_minutesLate: 0,
                    scan2_status: 'n/a',
                    scan2_timestamp: null,
                    scan2_minutesLate: 0,
                    finalStatus: 'absent'
                };
                newAttendance.set(student.uid, defaultRecord);
            }
        });
        setAttendance(newAttendance);
        setDevicesInUse(newDevices);
    }
  }, [liveRecords, students]);


  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0] || '', readableCode: parts[1] || '', timestamp: parts[2] || '' };
  };

  const startSession = useCallback(async (lateAfterMinutes: number, subject: string) => {
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
      const { readableCode, qrCodeValue } = generateNewCode('first');
      
      const sessionData: Partial<AttendanceSession> = {
        key: qrCodeValue,
        adminUid: userProfile.uid,
        createdAt: new Date().toISOString(),
        lat: latitude,
        lng: longitude,
        lateAfterMinutes: lateAfterMinutes,
        subject: subject,
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
              scan1_status: 'absent',
              scan1_timestamp: null,
              scan1_minutesLate: 0,
              scan2_status: 'n/a',
              scan2_timestamp: null,
              scan2_minutesLate: 0,
              finalStatus: 'absent',
          };
          batch.set(recordRef, initialRecord);
      });
      
      await batch.commit();
      
      toast({ title: 'Session Started', description: `Students can mark attendance. Late after ${lateAfterMinutes} minutes.` });

    }, (error) => {
        toast({ variant: 'destructive', title: 'Location Error', description: `Could not get location: ${error.message}` });
    });
  }, [toast, firestore, userProfile, sessionDocRef, students]);
  
 const endSession = useCallback(async () => {
    if (!sessionDocRef || !dbSession || !firestore) return;

    try {
        const batch = writeBatch(firestore);
        
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        
        const sessionToArchive: Partial<AttendanceSession> = {
          key: dbSession.key,
          adminUid: dbSession.adminUid,
          createdAt: dbSession.createdAt,
          lat: dbSession.lat,
          lng: dbSession.lng,
          lateAfterMinutes: dbSession.lateAfterMinutes,
          subject: dbSession.subject,
          secondKey: dbSession.secondKey || null,
          secondScanLateAfterMinutes: dbSession.secondScanLateAfterMinutes || null
        };
        batch.set(archiveSessionRef, sessionToArchive);
        
        const recordsSnapshot = await getDocs(collection(firestore, 'sessions', 'current', 'records'));

        recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const archiveRecordRef = doc(firestore, 'sessions', archiveSessionRef.id, 'records', recordDoc.id);
            const dataToArchive = {
                ...recordData,
                scan1_timestamp: recordData.scan1_timestamp ? recordData.scan1_timestamp.toDate().toISOString() : null,
                scan2_timestamp: recordData.scan2_timestamp ? recordData.scan2_timestamp.toDate().toISOString() : null
            };
            batch.set(archiveRecordRef, dataToArchive);
        });
        
        recordsSnapshot.forEach(recordDoc => {
            batch.delete(doc(firestore, 'sessions', 'current', 'records', recordDoc.id));
        });

        batch.delete(sessionDocRef);

        await batch.commit();

        toast({ title: 'Session Ended', description: 'Attendance has been archived.' });

    } catch (error: any) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: error.message || 'Could not archive records.' });
    }
}, [sessionDocRef, dbSession, firestore, toast]);


const markAttendance = useCallback(async (studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => {
    if (!firestore || !session.startTime || (session.status !== 'active_first' && session.status !== 'active_second')) {
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

    const { readableCode: expectedCode, prefix: codePrefix } = parseQrCodeValue(session.qrCodeValue);
    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== expectedCode.toUpperCase()) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
        return;
    }
    
    const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
    if (distance > 100) { // 100 meters
        toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
        return;
    }

    const now = new Date();

    // ---- FIRST SCAN LOGIC ----
    if (session.status === 'active_first' && codePrefix === 'first') {
        if (studentRecord.scan1_status !== 'absent') {
            toast({ title: 'Already Scanned', description: 'You have already marked your attendance for this scan.' });
            return;
        }
        if (devicesInUse.has(deviceId)) {
            toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for another student.' });
            return;
        }
        
        let scan1_status: 'present' | 'late' = 'present';
        let scan1_minutesLate = 0;

        if (session.firstScanCutoff && now > session.firstScanCutoff) {
            scan1_status = 'late';
            scan1_minutesLate = Math.round((now.getTime() - session.firstScanCutoff.getTime()) / 60000);
        }

        const updates = {
            scan1_status,
            scan1_minutesLate,
            scan1_timestamp: now,
            finalStatus: 'left_early', // Default to left_early until second scan
            deviceId: deviceId,
        };

        updateDocumentNonBlocking(studentDocRef, updates);
        toast({ title: 'Scan 1 Completed!', description: `You are marked as ${scan1_status.toUpperCase()}${scan1_minutesLate > 0 ? ` (${scan1_minutesLate} min late)` : ''}. Waiting for 2nd scan.` });
        return;
    }

    // ---- SECOND SCAN LOGIC ----
    if (session.status === 'active_second' && codePrefix === 'second') {
        if (studentRecord.scan1_status === 'absent') {
            toast({ variant: 'destructive', title: 'First Scan Missed', description: 'You cannot complete the second scan without the first.' });
            return;
        }
        if (studentRecord.scan2_status !== 'n/a' && studentRecord.scan2_status !== 'absent') {
            toast({ title: 'Already Scanned', description: 'You have already completed the second scan.' });
            return;
        }

        let scan2_status: 'present' | 'late' = 'present';
        let scan2_minutesLate = 0;

        if (session.secondScanCutoff && now > session.secondScanCutoff) {
            scan2_status = 'late';
            scan2_minutesLate = Math.round((now.getTime() - session.secondScanCutoff.getTime()) / 60000);
        }
        
        const finalStatus = studentRecord.scan1_status === 'late' || scan2_status === 'late' ? 'late' : 'present';

        const updates = {
            scan2_status,
            scan2_minutesLate,
            scan2_timestamp: now,
            finalStatus: finalStatus,
        };

        updateDocumentNonBlocking(studentDocRef, updates);
        toast({ title: 'Attendance Marked!', description: 'Verification complete. You are fully marked as present.' });
        return;
    }

    toast({ variant: 'destructive', title: 'Invalid Scan', description: 'This QR code is for a different scanning round.' });

}, [session, firestore, devicesInUse, toast]);
  
  
  const activateSecondQr = useCallback(async () => {
    if(!firestore || !sessionDocRef) return;
    
    try {
        const { readableCode, qrCodeValue } = generateNewCode('second');

        const batch = writeBatch(firestore);
        
        // Update the session doc with the second key
        batch.update(sessionDocRef, { secondKey: qrCodeValue });
        
        // Update all student records to expect the second scan
        attendance.forEach((record, studentId) => {
            if (record.scan1_status !== 'absent') {
                const studentDocRef = doc(firestore, 'sessions/current/records', studentId);
                batch.update(studentDocRef, { scan2_status: 'absent' });
            }
        });
        
        await batch.commit();

        setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
        toast({ title: 'Second Scan Activated', description: 'Students must scan again to be marked fully present.' });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Activation Failed', description: 'Could not update records for the second scan.' });
        console.error("Failed to activate second scan:", error);
    }
  }, [firestore, attendance, toast, sessionDocRef]);


  const value = useMemo(() => ({
    session,
    students: areStudentsLoading ? [] : students, 
    attendance,
    startSession,
    endSession,
    markAttendance,
    activateSecondQr,
  }), [session, students, areStudentsLoading, attendance, startSession, endSession, markAttendance, activateSecondQr]);


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
