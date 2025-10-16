'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-display.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getDistance } from '@/lib/utils';
import { AttendanceSession } from '@/models/backend';

type AttendanceStatus = 'present' | 'late' | 'absent';
type StudentLocation = { lat: number; lng: number };

// Student is now UserProfile
export type AttendanceRecord = {
  student: UserProfile;
  status: AttendanceStatus;
  timestamp: Date | null;
  minutesLate: number;
};
export type AttendanceMap = Map<string, AttendanceRecord>;

type SessionStatus = 'inactive' | 'active_first' | 'active_second' | 'ended';
export type Session = {
  status: SessionStatus;
  qrCodeValue: string;
  readableCode: string;
  startTime: Date | null;
  firstScanCutoff: Date | null;
  secondScanTime: number | null;
  secondScanReason: string | null;
  lat?: number;
  lng?: number;
};

type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: () => void;
  endSession: () => void;
  markAttendance: (studentId: string, code: string, location: StudentLocation) => boolean;
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
            // In a real app, you might fetch just the single student's profile
            // For now, if they are a viewer, they don't need the full list.
            // Returning the userProfile in an array if it exists.
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
    firstScanCutoff: null,
    secondScanTime: null,
    secondScanReason: null,
  });
  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());

  // Effect to sync local state with Firestore session
  useEffect(() => {
    if (dbSession && students.length > 0) {
      const startTime = dbSession.createdAt ? new Date(dbSession.createdAt) : new Date();
      // Set the cutoff for being marked 'late' to 10 minutes after session start
      const firstScanCutoff = new Date(startTime.getTime() + 10 * 60 * 1000); 
      const { readableCode } = parseQrCodeValue(dbSession.key);
      
      setSession(prevSession => {
        const newStatus = prevSession.status === 'active_second' ? 'active_second' : 'active_first';
        // If the session in DB is new, initialize attendance
        if(prevSession.qrCodeValue !== dbSession.key) {
            const newAttendance = new Map<string, AttendanceRecord>();
            students.forEach(student => {
                newAttendance.set(student.uid, { student, status: 'absent', timestamp: null, minutesLate: 0 });
            });
            setAttendance(newAttendance);
        }

        return {
          ...prevSession, // preserve second scan info
          status: newStatus, 
          qrCodeValue: dbSession.key,
          readableCode,
          startTime,
          firstScanCutoff,
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
        firstScanCutoff: null,
        secondScanTime: null,
        secondScanReason: null,
      });
      setAttendance(new Map());
    }
  }, [dbSession, students]);

  
  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    const parts = qrValue.split(':');
    return { prefix: parts[0], readableCode: parts[1], timestamp: parts[2] };
  };

  const startSession = useCallback(() => {
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
      }

      setDocumentNonBlocking(sessionDocRef, sessionData, {});
      
      setSession(prev => ({
        ...prev,
        status: 'active_first',
        readableCode,
        qrCodeValue
      }))

      toast({ title: 'Session Started', description: 'Students can now mark their attendance.' });
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
        firstScanCutoff: null,
        secondScanTime: null,
        secondScanReason: null,
    });
    toast({ title: 'Session Ended', description: 'Attendance is now closed.' });
  },[toast, sessionDocRef]);

  const markAttendance = useCallback((studentId: string, code: string, location: StudentLocation): boolean => {
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
      } else {
        toast({ variant: 'destructive', title: 'Session Error', description: 'Session location is not set.' });
        return false;
      }
      
      const studentRecord = attendance.get(studentId);
      // Prevent marking again if status is already 'present' or 'late' for the current session state.
      if(studentRecord && (studentRecord.status === 'present' || studentRecord.status === 'late')) {
          toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance for this scan.' });
          return false;
      }

      const now = new Date();
      let status: AttendanceStatus = 'present';
      let minutesLate = 0;

      // Check for lateness only during the first scan
      if(session.status === 'active_first' && session.firstScanCutoff) {
          if (now > session.firstScanCutoff) {
              status = 'late';
              minutesLate = Math.round((now.getTime() - session.firstScanCutoff.getTime()) / 60000);
          }
      }
      
      const student = students.find(s => s.uid === studentId);
      if (!student) {
          toast({ variant: 'destructive', title: 'Error', description: 'Could not find your student profile.' });
          return false;
      }

      const newRecord: AttendanceRecord = { student, status, timestamp: now, minutesLate };
      const newAttendance = new Map(attendance);
      newAttendance.set(studentId, newRecord);
      setAttendance(newAttendance);
      
      toast({ title: 'Attendance Marked!', description: `You are marked as ${status}.` });
      return true;
    },
    [session, attendance, toast, students]
  );
  
  const generateSecondQrCode = useCallback(async () => {
    const presentCount = Array.from(attendance.values()).filter(r => r.status !== 'absent').length;
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
      // Only reset those who were present. Absentees remain absent.
      if (record.status === 'present' || record.status === 'late') {
        newAttendance.set(studentId, { 
          ...record,
          status: 'absent', // Mark as absent for the second round
          timestamp: null,
          minutesLate: 0,
        });
      }
    });

    setAttendance(newAttendance);
    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    toast({ title: 'Second Scan Activated', description: 'Students who left will be marked absent if they do not scan again.' });
  }, [toast, attendance]);
  
  // QR Code refresh interval (local state update for display)
  useEffect(() => {
    if (session.status === 'active_first' || session.status === 'active_second') {
      const interval = setInterval(() => {
        // This only updates the local state for the QR code display,
        // The core session `key` in firestore remains the same for the duration of the scan period.
        const { readableCode } = generateNewCode(session.status === 'active_first' ? 'first' : 'second');
        setSession(prev => ({...prev, readableCode}));
      }, 15000); // Refresh every 15 seconds
      return () => clearInterval(interval);
    }
  }, [session.status]);


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
