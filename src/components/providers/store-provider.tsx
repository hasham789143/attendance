'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-optimization.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, updateDoc } from 'firebase/firestore';
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
  generateSecondQrCode: () => Promise<void>;
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

  const { data: liveRecords } = useCollection<AttendanceRecord>(liveRecordsQuery);
  
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
  }, [dbSession]);

  // Effect to sync local attendance map from live Firestore records
  useEffect(() => {
    if (liveRecords) {
        const newAttendance = new Map<string, AttendanceRecord>();
        const newDevices = new Set<string>();
        liveRecords.forEach(record => {
            // Firestore timestamps are converted to JS Date objects
            const hydratedRecord = {
                ...record,
                firstScanTimestamp: record.firstScanTimestamp ? new Date(record.firstScanTimestamp) : null,
                secondScanTimestamp: record.secondScanTimestamp ? new Date(record.secondScanTimestamp) : null,
            };
            newAttendance.set(record.student.uid, hydratedRecord);

            // Re-populate devices in use to prevent duplicates on reload
            if(record.firstScanStatus !== 'absent' && (record as any).deviceId) {
              newDevices.add((record as any).deviceId);
            }
        });
        setAttendance(newAttendance);
        setDevicesInUse(newDevices);
    }
  }, [liveRecords]);


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
              student: student, 
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

        // 1. Create a reference for the new document in the main 'sessions' collection (for archiving)
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        
        // 2. Set the data for the archived session document
        batch.set(archiveSessionRef, dbSession);

        // 3. Iterate over the LIVE attendance map to create the final record
        attendance.forEach((liveRecord, studentId) => {
            // 4. Convert Date objects to ISO strings for Firestore compatibility
            const serializableRecord = {
                ...liveRecord,
                firstScanTimestamp: liveRecord.firstScanTimestamp ? liveRecord.firstScanTimestamp.toISOString() : null,
                secondScanTimestamp: liveRecord.secondScanTimestamp ? liveRecord.secondScanTimestamp.toISOString() : null,
            };

            // 5. Create a reference for this student's record within the archived session's 'records' sub-collection
            const recordRef = doc(collection(firestore, 'sessions', archiveSessionRef.id, 'records'));
            
            // 6. Set the data for the student's attendance record
            batch.set(recordRef, serializableRecord);
        });

        // 7. Delete the 'current' session document and its subcollection (requires separate calls for subcollections if not using functions)
        // For now, we just delete the main doc. Subcollection needs manual cleanup or a cloud function.
        batch.delete(sessionDocRef);

        // 8. Commit all the batched writes to Firestore
        await batch.commit();

        toast({ title: 'Session Ended', description: 'Attendance has been archived and is now closed.' });

    } catch (error) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: 'Could not archive records. Please try again.' });
    }
}, [sessionDocRef, dbSession, firestore, attendance, toast]);


const markAttendance = useCallback(async (studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => {
    const studentRecord = attendance.get(studentId);
    
    if (!firestore || !session.startTime || !studentRecord || (session.status !== 'active_first' && session.status !== 'active_second')) {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return;
    }

    const { readableCode: expectedCode, prefix: codePrefix } = parseQrCodeValue(session.qrCodeValue);
    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== expectedCode.toUpperCase()) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
        return;
    }
    
    const studentDocRef = doc(firestore, 'sessions/current/records', studentId);

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
        toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });

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
            firstScanTimestamp: now.toISOString(),
            finalStatus: 'left_early', // Default to left_early until second scan
            deviceId: deviceId, // Store device ID
        };

        updateDocumentNonBlocking(studentDocRef, updates);
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
        toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });
        
        const now = new Date();
        const updates = {
            secondScanStatus: 'present',
            secondScanTimestamp: now.toISOString(),
            finalStatus: studentRecord.firstScanStatus, // Final status is 'present' or 'late' from the first scan
        };

        updateDocumentNonBlocking(studentDocRef, updates);
        toast({ title: 'Attendance Marked!', description: 'Verification complete. You are fully marked as present.' });
        return;
    }

    // ---- INVALID SCAN ROUND ----
    toast({ variant: 'destructive', title: 'Invalid Scan', description: 'This QR code is for a different scanning round.' });

}, [session, attendance, firestore, devicesInUse, toast]);
  
  const generateSecondQrCode = useCallback(async () => {
    const presentCount = Array.from(attendance.values()).filter(r => r.firstScanStatus !== 'absent').length;
    const totalStudents = students.length;
    if (totalStudents === 0) {
        toast({variant: 'destructive', title: 'No students found', description: 'Cannot generate second QR code without students.'});
        return;
    }
    const absenceRateAfterBreak = totalStudents > 0 ? ((totalStudents - presentCount) / totalStudents) * 100 : 0;
    
    const remainingClassLengthMinutes = 60; 
    const breakLengthMinutes = 10;

    try {
      const result = await getOptimalQrDisplayTime({ 
        absenceRateAfterBreak, 
        remainingClassLengthMinutes,
        breakLengthMinutes
      });
      setSession(prev => ({
        ...prev,
        secondScanTime: result.displayTimeMinutesFromBreakEnd,
        secondScanReason: result.reasoning
      }));
       toast({ title: 'AI Recommendation Ready', description: `AI suggests the 2nd scan at ${result.displayTimeMinutesFromBreakEnd} minutes after the break.` });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'AI Error', description: 'Could not get recommendation.' });
    }
  }, [attendance, toast, students]);
  
  const activateSecondQr = useCallback(async () => {
    if(!firestore) return;
    const { readableCode, qrCodeValue } = generateNewCode('second');

    // Batch update all students who completed the first scan
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
    generateSecondQrCode,
    activateSecondQr,
  }), [session, students, areStudentsLoading, attendance, startSession, endSession, markAttendance, generateSecondQrCode, activateSecondQr]);


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
