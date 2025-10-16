'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-optimization.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc } from 'firebase/firestore';
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
        setSession(prevSession => {
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
  }, [dbSession, students, session.qrCodeValue, session.status, attendance.size]);

  
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
  
  const endSession = useCallback(() => {
    if (!sessionDocRef) return;
    deleteDocumentNonBlocking(sessionDocRef);
    // Reset local state completely on session end
    setAttendance(new Map());
    setDevicesInUse(new Set());
    setSession({ 
        status: 'ended',
        qrCodeValue: '',
        readableCode: '',
        startTime: null,
        lateCutoff: null,
        secondScanTime: null,
        secondScanReason: null
    });
    toast({ title: 'Session Ended', description: 'Attendance is now closed.' });
  },[toast, sessionDocRef]);

  const markAttendance = useCallback((studentId: string, code: string, location: { lat: number; lng: number }, deviceId: string) => {
    if (!session.startTime || session.status === 'inactive' || session.status === 'ended') {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return;
    }

    const { readableCode: expectedCode, prefix: codePrefix } = parseQrCodeValue(session.qrCodeValue);
    const { readableCode: receivedCode } = parseQrCodeValue(code);

    if (receivedCode.toUpperCase() !== expectedCode.toUpperCase()) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
        return;
    }
    
    if (session.lat && session.lng) {
        const distance = getDistance({lat: session.lat, lng: session.lng}, location);
        if (distance > 100) { // 100 meters
            toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
            return;
        }
        toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });
    } else {
        toast({ variant: 'destructive', title: 'Session Error', description: 'Session location is not set.' });
        return;
    }

    setAttendance(prevAttendance => {
        const newAttendance = new Map(prevAttendance);
        const studentRecord = newAttendance.get(studentId);

        if (!studentRecord) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not find your student profile.' });
            return prevAttendance;
        }

        const now = new Date();
        
        if (session.status === 'active_first' && codePrefix === 'first') {
            if (studentRecord.firstScanStatus !== 'absent') {
                toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance for this scan.' });
                return prevAttendance;
            }
            if (devicesInUse.has(deviceId)) {
                toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for another student.' });
                return prevAttendance;
            }

            let firstScanStatus: 'present' | 'late' = 'present';
            let minutesLate = 0;
            let toastDescription = 'You are marked as PRESENT.';

            if (session.lateCutoff && now > session.lateCutoff) {
                firstScanStatus = 'late';
                minutesLate = Math.round((now.getTime() - session.lateCutoff.getTime()) / 60000);
                toastDescription = `You are marked as LATE (${minutesLate} min).`;
            }

            const updatedRecord: AttendanceRecord = {
                ...studentRecord,
                firstScanStatus,
                minutesLate,
                firstScanTimestamp: now,
                finalStatus: firstScanStatus,
            };
            newAttendance.set(studentId, updatedRecord);
            setDevicesInUse(prev => new Set(prev).add(deviceId));
            toast({ title: "Attendance Marked!", description: toastDescription });
            return newAttendance;
        }

        if (session.status === 'active_second' && codePrefix === 'second') {
            if (studentRecord.firstScanStatus === 'absent') {
                toast({ variant: 'destructive', title: 'First Scan Missed', description: 'You cannot mark the second scan without the first.' });
                return prevAttendance;
            }
            if (studentRecord.secondScanStatus === 'present') {
                toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance for this scan.' });
                return prevAttendance;
            }
            if (devicesInUse.has(deviceId)) {
                toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for another student.' });
                return prevAttendance;
            }

            const updatedRecord: AttendanceRecord = {
                ...studentRecord,
                secondScanStatus: 'present',
                secondScanTimestamp: now,
                finalStatus: studentRecord.firstScanStatus, // 'present' or 'late'
            };
            newAttendance.set(studentId, updatedRecord);
            setDevicesInUse(prev => new Set(prev).add(deviceId));
            toast({ title: "Attendance Marked!", description: 'Your presence has been verified!' });
            return newAttendance;
        }
        
        toast({ variant: 'destructive', title: 'Invalid Scan', description: 'This QR code is for a different scanning session.' });
        return prevAttendance;
    });
}, [session, devicesInUse, toast]);
  
  const generateSecondQrCode = useCallback(async () => {
    // Correctly calculate absence rate based on those who DID NOT complete the first scan.
    const firstScanPresentCount = Array.from(attendance.values()).filter(r => r.firstScanStatus !== 'absent').length;
    const totalStudents = students.length;
    
    // Absence rate is the inverse of presence rate. Let's calculate absence rate based on who is present for first scan.
    const absenceRateAfterBreak = totalStudents > 0 ? ((totalStudents - firstScanPresentCount) / totalStudents) * 100 : 0;
    
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
            if (record.firstScanStatus !== 'absent') {
                const updatedRecord: AttendanceRecord = { 
                    ...record,
                    secondScanStatus: 'absent', // Prepare for the second scan
                    finalStatus: 'left_early', // Default to left_early until they scan again
                };
                newAttendance.set(studentId, updatedRecord);
            }
        });
        return newAttendance;
    });

    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    setDevicesInUse(new Set()); // Reset devices for the second scan
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
