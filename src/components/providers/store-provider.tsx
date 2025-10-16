'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-display.flow';
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
  markAttendance: (studentId: string, code: string, location: { lat: number; lng: number }) => boolean;
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

  // Effect to sync local state with Firestore session
  useEffect(() => {
    if (dbSession && students.length > 0) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      const lateCutoff = dbSession.lateAfterMinutes ? new Date(startTime.getTime() + dbSession.lateAfterMinutes * 60 * 1000) : null;
      const { readableCode } = parseQrCodeValue(dbSession.key);
      
      setSession(prevSession => {
        const isNewSession = prevSession.qrCodeValue.split(':')[2] !== dbSession.key.split(':')[2];
        const newStatus = prevSession.status === 'active_second' ? 'active_second' : 'active_first';

        // If the session in DB is new (based on timestamp) or attendance is empty, initialize attendance
        if(isNewSession || attendance.size === 0) {
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
        }

        return {
          ...prevSession, // preserve second scan info
          status: newStatus, 
          qrCodeValue: dbSession.key,
          readableCode,
          startTime,
          lateCutoff,
          lat: dbSession.lat,
          lng: dbSession.lng,
        };
      });

    } else if (!dbSession) { // Explicitly check for no dbSession
      setSession({
        status: 'inactive',
        qrCodeValue: '',
        readableCode: '',
        startTime: null,
        lateCutoff: null,
        secondScanTime: null,
        secondScanReason: null,
      });
      setAttendance(new Map());
    }
  }, [dbSession, students, attendance.size]);

  
  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0], readableCode: parts[1], timestamp: parts[2] };
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
      
      setSession(prev => ({
        ...prev,
        status: 'active_first',
        readableCode,
        qrCodeValue
      }))

      toast({ title: 'Session Started', description: `Students can mark attendance. Late after ${lateAfterMinutes} minutes.` });
    }, (error) => {
        toast({ variant: 'destructive', title: 'Location Error', description: `Could not get location: ${error.message}` });
    });
  }, [toast, firestore, userProfile, sessionDocRef]);
  
  const endSession = useCallback(() => {
    if (!sessionDocRef) return;
    deleteDocumentNonBlocking(sessionDocRef);
    setSession({ // Reset local state immediately
        status: 'ended',
        qrCodeValue: '',
        readableCode: '',
        startTime: null,
        lateCutoff: null,
        secondScanTime: null,
        secondScanReason: null,
    });
    toast({ title: 'Session Ended', description: 'Attendance is now closed.' });
  },[toast, sessionDocRef]);

  const markAttendance = useCallback((studentId: string, code: string, location: { lat: number; lng: number }): boolean => {
      if (!session.startTime || session.status === 'inactive' || session.status === 'ended') {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return false;
      }
      
      if (code.toUpperCase() !== session.readableCode) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect.' });
        return false;
      }

      if (session.lat && session.lng) {
        const distance = getDistance({lat: session.lat, lng: session.lng}, location);
        if (distance > 100) { // 100 meters
            toast({ variant: 'destructive', title: 'Out of Range', description: `You are too far from the session location. (Distance: ${Math.round(distance)}m)` });
            return false;
        }
         toast({ title: 'Location Verified', description: `You are within range (${Math.round(distance)}m).` });
      } else {
        toast({ variant: 'destructive', title: 'Session Error', description: 'Session location is not set.' });
        return false;
      }
      
      const studentRecord = attendance.get(studentId);
      if (!studentRecord) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not find your student profile.' });
        return false;
      }

      const now = new Date();
      const newAttendance = new Map(attendance);
      let toastMessage = 'Attendance Marked!';
      let toastDescription = '';
      
      if(session.status === 'active_first') {
        if(studentRecord.firstScanStatus !== 'absent') {
          toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance for this scan.' });
          return false;
        }
        
        let firstScanStatus: 'present' | 'late' = 'present';
        let minutesLate = 0;
        
        if (session.lateCutoff && now > session.lateCutoff) {
            firstScanStatus = 'late';
            minutesLate = Math.round((now.getTime() - session.lateCutoff.getTime()) / 60000);
            toastDescription = `You are marked as LATE (${minutesLate} min).`;
        } else {
            toastDescription = 'You are marked as PRESENT.';
        }

        newAttendance.set(studentId, {
          ...studentRecord,
          firstScanStatus,
          minutesLate,
          firstScanTimestamp: now,
          // Tentatively set final status, will be updated by second scan
          finalStatus: firstScanStatus, 
        });

      } else if (session.status === 'active_second') {
        if (studentRecord.firstScanStatus === 'absent') {
          toast({ variant: 'destructive', title: 'First Scan Missed', description: 'You cannot mark the second scan without the first.' });
          return false;
        }
        if (studentRecord.secondScanStatus === 'present') {
           toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance for this scan.' });
           return false;
        }

        newAttendance.set(studentId, {
          ...studentRecord,
          secondScanStatus: 'present',
          secondScanTimestamp: now,
           // Final status is determined by first scan status
          finalStatus: studentRecord.firstScanStatus,
        });
        toastDescription = 'Your presence has been verified!';
      }

      setAttendance(newAttendance);
      toast({ title: toastMessage, description: toastDescription });
      return true;
    },
    [session, attendance, toast]
  );
  
  const generateSecondQrCode = useCallback(async () => {
    const presentCount = Array.from(attendance.values()).filter(r => r.firstScanStatus !== 'absent').length;
    const absenceRate = students.length > 0 ? ((students.length - presentCount) / students.length) * 100 : 0;
    const classLengthMinutes = 120; // Assuming a 2-hour class

    try {
      const result = await getOptimalQrDisplayTime({ absenceRate, classLengthMinutes });
      setSession(prev => ({
        ...prev,
        secondScanTime: result.displayTimeMinutes,
        secondScanReason: result.reasoning
      }));
       toast({ title: 'AI Recommendation Ready', description: `AI suggests the 2nd scan at ${result.displayTimeMinutes} minutes.` });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'AI Error', description: 'Could not get recommendation.' });
    }
  }, [attendance, toast, students]);
  
  const activateSecondQr = useCallback(() => {
    const { readableCode, qrCodeValue } = generateNewCode('second');
    
    // Reset status for everyone who was present or late to absent for the second scan
    const newAttendance = new Map(attendance);
    newAttendance.forEach((record, studentId) => {
      // If they were present for the first scan, mark them as having left early.
      // Their final status will become 'present' again if they complete the second scan.
      if (record.firstScanStatus !== 'absent') {
        newAttendance.set(studentId, { 
          ...record,
          secondScanStatus: 'absent',
          finalStatus: 'left_early',
        });
      }
    });

    setAttendance(newAttendance);
    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    toast({ title: 'Second Scan Activated', description: 'Students must scan again to be marked fully present.' });
  }, [toast, attendance]);


  const value = useMemo(() => ({
    session,
    students: areStudentsLoading ? [] : students, // Return empty array while loading
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
