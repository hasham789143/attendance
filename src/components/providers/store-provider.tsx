'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-optimization.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, updateDoc, getDocs, DocumentReference, getDoc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { getDistance } from '@/lib/utils';
import { AttendanceSession } from '@/models/backend';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';

// This represents the Firestore document
export type AttendanceRecord = {
  student: UserProfile;
  firstScanStatus: 'present' | 'late' | 'absent';
  secondScanStatus: 'present' | 'absent' | 'n/a';
  finalStatus: AttendanceStatus;
  firstScanTimestamp: Date | null;
  secondScanTimestamp: Date | null;
  minutesLate: number;
};
export type AttendanceMap = Map<string, AttendanceRecord>;

type SessionStatus = 'inactive' | 'active_first' | 'active_second' | 'ended';
export type Session = {
  status: SessionStatus;
  qrCodeValue: string;
  readableCode: string;
  startTime: Date | null;
  lateCutoff: Date | null;
  secondScanTime: number | null;
  secondScanReason: string | null;
  lat?: number;
  lng?: number;
};

type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: (lateAfterMinutes: number) => void;
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
    lateCutoff: null,
    secondScanTime: null,
    secondScanReason: null,
  });

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [devicesInUse, setDevicesInUse] = useState<Set<string>>(new Set());

  // Effect to sync local session state from the main session document
  useEffect(() => {
    if (dbSession) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      const lateCutoff = dbSession.lateAfterMinutes ? new Date(startTime.getTime() + dbSession.lateAfterMinutes * 60 * 1000) : null;
      const { readableCode } = parseQrCodeValue(dbSession.key);
      
      setSession(prevSession => {
         // Determine if we should maintain the second scan status
        const newStatus = prevSession.status === 'active_second' ? 'active_second' : 'active_first';
        const qrCodeValue = newStatus === 'active_second' ? prevSession.qrCodeValue : dbSession.key;
        const newReadableCode = newStatus === 'active_second' ? prevSession.readableCode : readableCode;

        return { 
          ...prevSession,
          status: newStatus,
          qrCodeValue: qrCodeValue,
          readableCode: newReadableCode,
          startTime,
          lateCutoff,
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
          lateCutoff: null,
          secondScanTime: null,
          secondScanReason: null,
        });
        setAttendance(new Map());
    }
  }, [dbSession, session.status]);

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
                    firstScanStatus: liveRecordData.firstScanStatus,
                    secondScanStatus: liveRecordData.secondScanStatus,
                    finalStatus: liveRecordData.finalStatus,
                    firstScanTimestamp: liveRecordData.firstScanTimestamp ? new Date(liveRecordData.firstScanTimestamp.seconds * 1000) : null,
                    secondScanTimestamp: liveRecordData.secondScanTimestamp ? new Date(liveRecordData.secondScanTimestamp.seconds * 1000) : null,
                    minutesLate: liveRecordData.minutesLate,
                };
                newAttendance.set(student.uid, hydratedRecord);

                if(liveRecordData.firstScanStatus !== 'absent' && liveRecordData.deviceId) {
                    newDevices.add(liveRecordData.deviceId);
                }
            } else {
                 const defaultRecord: AttendanceRecord = {
                    student,
                    firstScanStatus: 'absent',
                    secondScanStatus: 'n/a',
                    finalStatus: 'absent',
                    firstScanTimestamp: null,
                    secondScanTimestamp: null,
                    minutesLate: 0,
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

  const startSession = useCallback(async (lateAfterMinutes: number) => {
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
      
      const sessionData: AttendanceSession = {
        key: qrCodeValue,
        adminUid: userProfile.uid,
        createdAt: new Date().toISOString(),
        lat: latitude,
        lng: longitude,
        lateAfterMinutes: lateAfterMinutes,
      }
      
      // Batch write: create session doc and initialize all student records
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
              firstScanStatus: 'absent',
              secondScanStatus: 'n/a',
              finalStatus: 'absent',
              firstScanTimestamp: null,
              secondScanTimestamp: null,
              minutesLate: 0,
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
        batch.set(archiveSessionRef, dbSession);
        
        const recordsSnapshot = await getDocs(collection(firestore, 'sessions', 'current', 'records'));

        recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const archiveRecordRef = doc(firestore, 'sessions', archiveSessionRef.id, 'records', recordDoc.id);
            batch.set(archiveRecordRef, recordData);
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

    // ---- FIRST SCAN LOGIC ----
    if (session.status === 'active_first' && codePrefix === 'first') {
        if (studentRecord.firstScanStatus !== 'absent') {
            toast({ title: 'Already Scanned', description: 'You have already marked your attendance for this scan.' });
            return;
        }
        if (devicesInUse.has(deviceId)) {
            toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for another student.' });
            return;
        }

        const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
        if (distance > 100) { // 100 meters
            toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
            return;
        }
        
        let firstScanStatus: 'present' | 'late' = 'present';
        let minutesLate = 0;
        const now = new Date();

        if (session.lateCutoff && now > session.lateCutoff) {
            firstScanStatus = 'late';
            minutesLate = Math.round((now.getTime() - session.lateCutoff.getTime()) / 60000);
        }

        const updates = {
            firstScanStatus,
            minutesLate,
            firstScanTimestamp: now,
            finalStatus: 'left_early', // Default to left_early until second scan
            deviceId: deviceId,
        };

        await updateDoc(studentDocRef, updates);
        toast({ title: 'Scan 1 Completed!', description: `You are marked as ${firstScanStatus.toUpperCase()}${minutesLate > 0 ? ` (${minutesLate} min late)` : ''}. Waiting for 2nd scan.` });
        return;
    }

    // ---- SECOND SCAN LOGIC ----
    if (session.status === 'active_second' && codePrefix === 'second') {
        if (studentRecord.firstScanStatus === 'absent') {
            toast({ variant: 'destructive', title: 'First Scan Missed', description: 'You cannot complete the second scan without the first.' });
            return;
        }
        if (studentRecord.secondScanStatus === 'present') {
            toast({ title: 'Already Scanned', description: 'You have already completed the second scan.' });
            return;
        }

        const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
        if (distance > 100) { // 100 meters
            toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
            return;
        }
        
        const now = new Date();
        const updates = {
            secondScanStatus: 'present',
            secondScanTimestamp: now,
            finalStatus: studentRecord.firstScanStatus, // Final status is 'present' or 'late' from the first scan
        };

        await updateDoc(studentDocRef, updates);
        toast({ title: 'Attendance Marked!', description: 'Verification complete. You are fully marked as present.' });
        return;
    }

    toast({ variant: 'destructive', title: 'Invalid Scan', description: 'This QR code is for a different scanning round.' });

}, [session, firestore, devicesInUse, toast]);
  
  
  const activateSecondQr = useCallback(async () => {
    if(!firestore) return;
    const { readableCode, qrCodeValue } = generateNewCode('second');

    const batch = writeBatch(firestore);
    attendance.forEach((record, studentId) => {
        if (record.firstScanStatus !== 'absent') {
            const studentDocRef = doc(firestore, 'sessions/current/records', studentId);
            batch.update(studentDocRef, { secondScanStatus: 'absent' });
        }
    });
    
    await batch.commit();
    
    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    toast({ title: 'Second Scan Activated', description: 'Students must scan again to be marked fully present.' });
  }, [firestore, attendance, toast]);


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

    
