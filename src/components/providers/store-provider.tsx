'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-optimization.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getDistance } from '@/lib/utils';
import { AttendanceSession } from '@/models/backend';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';

// Student is now UserProfile
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

    // Query for all students (for admin)
    const studentsQuery = useMemoFirebase(() => {
        if (userProfile?.role !== 'admin' || !firestore) return null;
        return query(collection(firestore, 'users'), where('role', '==', 'viewer'));
    }, [userProfile, firestore]);

    const { data: allStudents, isLoading: areStudentsLoading } = useCollection<UserProfile>(studentsQuery);

    // Memoize the final list of students
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

  // Effect to sync local state with Firestore session
  useEffect(() => {
    if (dbSession && students.length > 0) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      const lateCutoff = dbSession.lateAfterMinutes ? new Date(startTime.getTime() + dbSession.lateAfterMinutes * 60 * 1000) : null;
      const { readableCode, timestamp: dbSessionTimestamp } = parseQrCodeValue(dbSession.key);
      
      const currentSessionTimestamp = parseQrCodeValue(session.qrCodeValue).timestamp;

      // Only re-initialize attendance if it's a completely new session
      if (attendance.size === 0 || dbSessionTimestamp !== currentSessionTimestamp) {
        const newAttendance = new Map<string, AttendanceRecord>();
        students.forEach(student => {
            newAttendance.set(student.uid, { 
              student, 
              firstScanStatus: 'absent',
              secondScanStatus: 'n/a',
              finalStatus: 'absent',
              firstScanTimestamp: null,
              secondScanTimestamp: null,
              minutesLate: 0 
            });
        });
        setAttendance(newAttendance);
        setDevicesInUse(new Set()); // Reset devices for new session
        
        setSession(prevSession => {
             return { // Return new session state
                ...prevSession,
                status: 'active_first', 
                qrCodeValue: dbSession.key,
                readableCode,
                startTime,
                lateCutoff,
                lat: dbSession.lat,
                lng: dbSession.lng,
                secondScanTime: null, // Reset AI suggestion for new session
                secondScanReason: null
            };
        });
      } else if (session.status === 'inactive' || session.status === 'ended') {
        // If the session was inactive but now we have a dbSession, it means we are joining an active session.
         setSession(prevSession => ({
            ...prevSession,
            status: 'active_first',
            qrCodeValue: dbSession.key,
            readableCode,
            startTime,
            lateCutoff,
            lat: dbSession.lat,
            lng: dbSession.lng,
        }));
      }

    } else if (!dbSession) { 
      if (session.status !== 'inactive' && session.status !== 'ended') {
          setSession({
            status: 'ended', 
            qrCodeValue: '',
            readableCode: '',
            startTime: null,
            lateCutoff: null,
            secondScanTime: null,
            secondScanReason: null,
          });
      }
    }
  }, [dbSession, students]);

  
  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0] || '', readableCode: parts[1] || '', timestamp: parts[2] || '' };
  };

  const startSession = useCallback((lateAfterMinutes: number) => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Location Error', description: 'Geolocation is not supported by your browser.' });
      return;
    }
    if (!firestore || !userProfile || !sessionDocRef) return;

    navigator.geolocation.getCurrentPosition((position) => {
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

      setDocumentNonBlocking(sessionDocRef, sessionData, {});
      
      toast({ title: 'Session Started', description: `Students can mark attendance. Late after ${lateAfterMinutes} minutes.` });
    }, (error) => {
        toast({ variant: 'destructive', title: 'Location Error', description: `Could not get location: ${error.message}` });
    });
  }, [toast, firestore, userProfile, sessionDocRef]);
  
  const endSession = useCallback(async () => {
    if (!sessionDocRef || !dbSession || !firestore) return;

    try {
        const batch = writeBatch(firestore);

        // Archive the current session doc by moving it to the main `sessions` collection
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        batch.set(archiveSessionRef, dbSession);

        // Iterate over the definitive list of all `students` to create a complete archive.
        students.forEach((student) => {
            const liveRecord = attendance.get(student.uid);

            const recordToSave = liveRecord || {
                student: student,
                firstScanStatus: 'absent',
                secondScanStatus: 'n/a',
                finalStatus: 'absent',
                firstScanTimestamp: null,
                secondScanTimestamp: null,
                minutesLate: 0,
            };
            
            // Convert Dates to strings for Firestore serialization.
            const serializableRecord = {
                ...recordToSave,
                firstScanTimestamp: recordToSave.firstScanTimestamp ? recordToSave.firstScanTimestamp.toISOString() : null,
                secondScanTimestamp: recordToSave.secondScanTimestamp ? recordToSave.secondScanTimestamp.toISOString() : null,
            };

            const recordRef = doc(collection(firestore, 'sessions', archiveSessionRef.id, 'records'));
            batch.set(recordRef, serializableRecord);
        });

        // Delete the current "live" session document
        batch.delete(sessionDocRef);

        await batch.commit();

        // Reset local state completely
        setAttendance(new Map());
        setDevicesInUse(new Set());
        setSession({
            status: 'ended',
            qrCodeValue: '',
            readableCode: '',
            startTime: null,
            lateCutoff: null,
            secondScanTime: null,
            secondScanReason: null,
        });

        toast({ title: 'Session Ended', description: 'Attendance has been archived and is now closed.' });

    } catch (error) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: 'Could not archive records. Please try again.' });
    }
}, [sessionDocRef, dbSession, firestore, attendance, students, toast]);


const markAttendance = useCallback((studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => {
  setAttendance(currentAttendance => {
    const newAttendance = new Map(currentAttendance);
    const studentRecord = newAttendance.get(studentId);
    
    if (!session.startTime || !studentRecord || (session.status !== 'active_first' && session.status !== 'active_second')) {
      toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
      return currentAttendance;
    }

    const { readableCode: expectedCode, prefix: codePrefix } = parseQrCodeValue(session.qrCodeValue);
    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== expectedCode.toUpperCase()) {
      toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
      return currentAttendance;
    }

    const now = new Date();

    // ---- FIRST SCAN LOGIC ----
    if (session.status === 'active_first' && codePrefix === 'first') {
      if (studentRecord.firstScanStatus !== 'absent') {
        toast({ title: 'Already Scanned', description: 'You have already marked your attendance for this scan.' });
        return currentAttendance;
      }
      if (devicesInUse.has(deviceId)) {
        toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for another student.' });
        return currentAttendance;
      }
      
      const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
      if (distance > 100) { // 100 meters
        toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
        return currentAttendance;
      }
      toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });

      let firstScanStatus: 'present' | 'late' = 'present';
      let minutesLate = 0;

      if (session.lateCutoff && now > session.lateCutoff) {
        firstScanStatus = 'late';
        minutesLate = Math.round((now.getTime() - session.lateCutoff.getTime()) / 60000);
      }

      const updatedRecord: AttendanceRecord = {
        ...studentRecord,
        firstScanStatus,
        minutesLate,
        firstScanTimestamp: now,
        finalStatus: 'left_early', // Default to left_early until second scan
      };

      newAttendance.set(studentId, updatedRecord);
      setDevicesInUse(prev => new Set(prev).add(deviceId));
      toast({ title: 'Attendance Marked!', description: `You are marked as ${firstScanStatus.toUpperCase()}${minutesLate > 0 ? ` (${minutesLate} min late)` : ''}. Waiting for 2nd scan.` });
      return newAttendance;
    
    // ---- SECOND SCAN LOGIC ----
    } else if (session.status === 'active_second' && codePrefix === 'second') {
      if (studentRecord.firstScanStatus === 'absent') {
        toast({ variant: 'destructive', title: 'First Scan Missed', description: 'You cannot complete the second scan without the first.' });
        return currentAttendance;
      }
      if (studentRecord.secondScanStatus === 'present') {
        toast({ title: 'Already Scanned', description: 'You have already completed the second scan.' });
        return currentAttendance;
      }
      
      const distance = getDistance({ lat: session.lat!, lng: session.lng! }, location);
      if (distance > 100) { // 100 meters
        toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
        return currentAttendance;
      }
      toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });

      const updatedRecord: AttendanceRecord = {
        ...studentRecord,
        secondScanStatus: 'present',
        secondScanTimestamp: now,
        finalStatus: studentRecord.firstScanStatus, // Final status is 'present' or 'late' from the first scan
      };
      newAttendance.set(studentId, updatedRecord);
      toast({ title: 'Verification Complete!', description: 'You are now fully marked as present.' });
      return newAttendance;
    
    // ---- INVALID SCAN ROUND ----
    } else {
      toast({ variant: 'destructive', title: 'Invalid Scan', description: 'This QR code is for a different scanning round.' });
      return currentAttendance;
    }
  });
}, [session, devicesInUse, toast]);
  
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
  
  const activateSecondQr = useCallback(() => {
    const { readableCode, qrCodeValue } = generateNewCode('second');
    
    setAttendance(prevAttendance => {
        const newAttendance = new Map(prevAttendance);
        newAttendance.forEach((record, studentId) => {
            // Only update students who were present for the first scan
            if (record.firstScanStatus !== 'absent') {
                const updatedRecord: AttendanceRecord = { 
                    ...record,
                    secondScanStatus: 'absent', // Prepare for the second scan
                    // The finalStatus is already 'left_early' from the first scan
                };
                newAttendance.set(studentId, updatedRecord);
            }
        });
        return newAttendance;
    });

    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    // We don't reset devices here, allowing same device for second scan.
    toast({ title: 'Second Scan Activated', description: 'Students must scan again to be marked fully present.' });
  }, [toast]);


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
