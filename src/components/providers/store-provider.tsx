'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-display.flow';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from './auth-provider';
import { collection, query, where, doc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase } from '@/firebase';

type AttendanceStatus = 'present' | 'late' | 'absent';

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
};

type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  students: UserProfile[];
  startSession: () => void;
  endSession: () => void;
  markAttendance: (studentId: string, code: string) => boolean;
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

    const { data: allStudents } = useCollection<UserProfile>(studentsQuery);

    // Fetch single student profile (for viewer)
    const studentDocRef = useMemoFirebase(() => {
        if(userProfile?.role !== 'viewer' || !firestore || !userProfile?.uid) return null;
        return doc(firestore, 'users', userProfile.uid);
    }, [userProfile, firestore])

    const {data: singleStudent} = useDoc<UserProfile>(studentDocRef);


    return useMemo(() => {
        if (userProfile?.role === 'admin') {
            return allStudents || [];
        }
        if (userProfile?.role === 'viewer' && singleStudent) {
            return [singleStudent];
        }
        return [];
    }, [userProfile, allStudents, singleStudent]);
}


export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const students = useStudents();
  
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

  
  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const startSession = useCallback(() => {
    const startTime = new Date();
    const firstScanCutoff = new Date(startTime.getTime() + 10 * 60 * 1000); // 10 minute grace period
    const { readableCode, qrCodeValue } = generateNewCode('first');
    setSession({
      status: 'active_first',
      qrCodeValue,
      readableCode,
      startTime,
      firstScanCutoff,
      secondScanTime: null,
      secondScanReason: null,
    });
    // Reset attendance
    const newAttendance = new Map<string, AttendanceRecord>();
    students.forEach(student => {
      newAttendance.set(student.uid, { student, status: 'absent', timestamp: null, minutesLate: 0 });
    });
    setAttendance(newAttendance);
    toast({ title: 'Session Started', description: 'Students can now mark their attendance.' });
  }, [toast, students]);
  
  const endSession = useCallback(() => {
    setSession(prev => ({...prev, status: 'ended', qrCodeValue: '', readableCode: ''}));
    toast({ title: 'Session Ended', description: 'Attendance is now closed.' });
  },[toast]);

  const markAttendance = useCallback((studentId: string, code: string): boolean => {
      if (!session.startTime || session.status === 'inactive' || session.status === 'ended') {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return false;
      }
      
      if (code.toUpperCase() !== session.readableCode) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you entered is incorrect.' });
        return false;
      }
      
      const studentRecord = attendance.get(studentId);
      if(studentRecord && studentRecord.status !== 'absent') {
          toast({ variant: 'default', title: 'Already Marked', description: 'You have already marked your attendance.' });
          return false;
      }

      const now = new Date();
      let status: AttendanceStatus = 'present';
      let minutesLate = 0;

      if(session.status === 'active_first' && session.firstScanCutoff) {
          if (now > session.firstScanCutoff) {
              status = 'late';
              minutesLate = Math.round((now.getTime() - session.firstScanCutoff.getTime()) / 60000);
          }
      }
      
      const student = students.find(s => s.uid === studentId);
      if (!student) return false;

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
       toast({ title: 'AI Recommendation', description: `Optimal time for 2nd QR: ${result.displayTimeMinutes} mins. ${result.reasoning}` });
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
      if (record.status === 'present' || record.status === 'late') {
        newAttendance.set(studentId, { 
          ...record, // Keep original record details like student info
          status: 'absent', // Mark as absent for the second round
          timestamp: null, // Reset timestamp for second scan
          minutesLate: 0,
        });
      }
    });

    setAttendance(newAttendance);
    setSession(prev => ({ ...prev, status: 'active_second', readableCode, qrCodeValue }));
    toast({ title: 'Second Scan Activated', description: 'Students who left will be marked absent if they do not scan again.' });
  }, [toast, attendance]);
  
  // QR Code refresh interval
  useEffect(() => {
    if (session.status === 'active_first' || session.status === 'active_second') {
      const interval = setInterval(() => {
        const prefix = session.status === 'active_first' ? 'first' : 'second';
        const { readableCode, qrCodeValue } = generateNewCode(prefix);
        setSession(prev => ({...prev, readableCode, qrCodeValue}));
      }, 15000); // Refresh every 15 seconds
      return () => clearInterval(interval);
    }
  }, [session.status]);


  return (
    <StoreContext.Provider value={{ session, students, attendance, startSession, endSession, markAttendance, generateSecondQrCode, activateSecondQr }}>
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

    