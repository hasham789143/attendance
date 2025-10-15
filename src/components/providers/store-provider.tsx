'use client';

import { getOptimalQrDisplayTime } from '@/ai/flows/dynamic-qr-display.flow';
import { Student, students } from '@/lib/data';
import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

type AttendanceStatus = 'present' | 'late' | 'absent';
export type AttendanceRecord = {
  student: Student;
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
  startSession: () => void;
  endSession: () => void;
  markAttendance: (studentId: string, code: string) => boolean;
  generateSecondQrCode: () => Promise<void>;
  activateSecondQr: () => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const initialAttendance = new Map<string, AttendanceRecord>();
students.forEach(student => {
  initialAttendance.set(student.id, { student, status: 'absent', timestamp: null, minutesLate: 0 });
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [session, setSession] = useState<Session>({
    status: 'inactive',
    qrCodeValue: '',
    readableCode: '',
    startTime: null,
    firstScanCutoff: null,
    secondScanTime: null,
    secondScanReason: null,
  });
  const [attendance, setAttendance] = useState<AttendanceMap>(new Map(initialAttendance));

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
      newAttendance.set(student.id, { student, status: 'absent', timestamp: null, minutesLate: 0 });
    });
    setAttendance(newAttendance);
    toast({ title: 'Session Started', description: 'Students can now mark their attendance.' });
  }, [toast]);
  
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
          toast({ variant: 'destructive', title: 'Already Marked', description: 'You have already marked your attendance.' });
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
      
      const newRecord: AttendanceRecord = { student: students.find(s=> s.id === studentId)!, status, timestamp: now, minutesLate };
      const newAttendance = new Map(attendance);
      newAttendance.set(studentId, newRecord);
      setAttendance(newAttendance);
      
      toast({ title: 'Attendance Marked!', description: `You are marked as ${status}.` });
      return true;
    },
    [session, attendance, toast]
  );
  
  const generateSecondQrCode = useCallback(async () => {
    const presentCount = Array.from(attendance.values()).filter(r => r.status !== 'absent').length;
    const absenceRate = ((students.length - presentCount) / students.length) * 100;
    const classLengthMinutes = 120;

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
  }, [attendance, toast]);
  
  const activateSecondQr = useCallback(() => {
    const { readableCode, qrCodeValue } = generateNewCode('second');
    
    const newAttendance = new Map(attendance);
    newAttendance.forEach((record, studentId) => {
      if (record.status !== 'absent') {
        newAttendance.set(studentId, { 
          student: record.student,
          status: 'absent',
          timestamp: null,
          minutesLate: 0
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
    <StoreContext.Provider value={{ session, attendance, startSession, endSession, markAttendance, generateSecondQrCode, activateSecondQr }}>
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
