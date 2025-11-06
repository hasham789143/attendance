
'use client';

import { useToast } from '@/hooks/use-toast.tsx';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { UserProfile } from './auth-provider';
import { collection, query, where, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { useCollection, useDoc, useFirebase, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { AttendanceSession, ScanData } from '@/models/backend';
import { uploadImageAndGetURL } from '@/firebase/storage';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'left_early';
export type AttendanceMode = 'class' | 'hostel';

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
  radius?: number; // Allowed radius in meters
  isSelfieRequired?: boolean;

  lat?: number;
  lng?: number;
};

type MarkAttendancePayload = {
    studentId: string;
    code: string; // For class mode, this is QR code data. For hostel mode, this is the uniqueScanKey.
    deviceId: string;
};

type StartSessionPayload = {
  lateAfterMinutes: number;
  subject: string;
  totalScans: number;
  radius: number;
  isSelfieRequired: boolean;
};


type StoreContextType = {
  session: Session;
  attendance: AttendanceMap;
  usersForSession: UserProfile[];
  students: UserProfile[]; // The stable, complete list of all students/residents.
  startSession: (payload: StartSessionPayload) => Promise<void>;
  endSession: () => void;
  markAttendance: (payload: MarkAttendancePayload) => Promise<boolean>;
  uploadSelfies: (studentId: string, photoURLs: string[]) => Promise<void>;
  activateNextScan: () => void;
  requestCorrection: (studentId: string, reason: string) => void;
  handleCorrectionRequest: (studentId: string, approved: boolean) => void;
  attendanceMode: AttendanceMode;
  setAttendanceMode: (mode: AttendanceMode) => void;
};

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function useUsers(userProfile: UserProfile | null) {
    const { firestore } = useFirebase();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // This query is ONLY for admins.
    const adminUsersQuery = useMemoFirebase(() => {
        if (!firestore || !userProfile || userProfile.role !== 'admin') {
            return null;
        }
        return query(collection(firestore, 'users'), where('role', 'in', ['viewer', 'admin']));
    }, [firestore, userProfile]);

    const { data: adminFetchedUsers, isLoading: isAdminLoading } = useCollection<UserProfile>(adminUsersQuery);

    useEffect(() => {
        // We can't do anything until the user profile is loaded.
        if (!userProfile || !firestore) {
            setIsLoading(true);
            return;
        }

        if (userProfile.role === 'admin') {
            // Admin logic: use the result of the collection query.
            if (!isAdminLoading) {
                setUsers(adminFetchedUsers || []);
                setIsLoading(false);
            }
        } else if (userProfile.role === 'viewer') {
            // Viewer logic: fetch only their own document to avoid permission errors.
            setIsLoading(true);
            const userDocRef = doc(firestore, 'users', userProfile.uid);
            getDoc(userDocRef).then(docSnap => {
                if (docSnap.exists()) {
                    setUsers([{ id: docSnap.id, ...docSnap.data() } as UserProfile]);
                } else {
                    // This is an inconsistent state, but we handle it gracefully.
                    setUsers([]);
                }
            }).catch(error => {
                console.error("Error fetching own user document:", error);
                setUsers([]); // Clear users on error
            }).finally(() => {
                setIsLoading(false);
            });
        } else {
            // For disabled users or other cases, the user list is empty.
            setUsers([]);
            setIsLoading(false);
        }

    }, [userProfile, firestore, adminFetchedUsers, isAdminLoading]);

    return { users: users, isLoading };
}


export function StoreProvider({ children, userProfile }: { children: ReactNode, userProfile: UserProfile | null }) {
  const { toast } = useToast();
  const { firestore } = useFirebase();
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('class');
  const { users: allUsers, isLoading: areUsersLoading } = useUsers(userProfile);


  // CRITICAL CHANGE: Only define the sessionDocRef if the userProfile is loaded.
  // This prevents hooks from running with an invalid path before permissions are known.
  const sessionDocRef = useMemoFirebase(() => {
    if (!firestore || !userProfile) return null;
    return doc(firestore, 'sessions', `${attendanceMode}-current`);
  }, [firestore, attendanceMode, userProfile]);

  const { data: dbSession } = useDoc<AttendanceSession>(sessionDocRef);

  // Live attendance records from Firestore
  const liveRecordsQuery = useMemoFirebase(() => {
    if (!firestore || !dbSession || !userProfile) return null;
    return collection(firestore, 'sessions', `${attendanceMode}-current`, 'records');
  }, [firestore, dbSession, attendanceMode, userProfile]);

  const { data: liveRecords } = useCollection<any>(liveRecordsQuery);
  
  const [session, setSession] = useState<Session>({
    status: 'inactive',
    qrCodeValue: '',
    readableCode: '',
    startTime: null,
    currentScan: 0,
    totalScans: 0,
    lateAfterMinutes: 0,
    radius: 100,
    isSelfieRequired: false,
  });

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [devicesInUse, setDevicesInUse] = useState<Map<number, Set<string>>>(new Map());
  
  const handleSetAttendanceMode = useCallback((mode: AttendanceMode) => {
    setAttendanceMode(mode);
  }, []);

  const usersForSession = useMemo(() => {
    if (userProfile?.role === 'admin') {
        const relevantUserTypes = attendanceMode === 'class' ? ['student', 'both'] : ['resident', 'both'];
        return allUsers.filter(u => relevantUserTypes.includes(u.userType));
    }
    return allUsers;
  }, [userProfile, allUsers, attendanceMode]);
  
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
          const parsed = parseQrCodeValue(qrCodeValue);
          if (parsed) readableCode = parsed.readableCode;
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
          radius: dbSession.radius,
          isSelfieRequired: dbSession.isSelfieRequired,
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
          radius: 100,
          isSelfieRequired: false,
        });
    } else {
        // Ensure session is reset if dbSession becomes null and session was already inactive
         setSession({
          status: 'inactive', 
          qrCodeValue: '',
          readableCode: '',
          startTime: null,
          currentScan: 0,
          totalScans: 0,
          lateAfterMinutes: 0,
          radius: 100,
          isSelfieRequired: false,
        });
    }
  }, [dbSession, session.status]);

  // Effect to sync local attendance map from live Firestore records
  useEffect(() => {
    if (session.status !== 'active' || areUsersLoading || usersForSession.length === 0) {
      if ((session.status === 'inactive' || session.status === 'ended') && attendance.size > 0) {
        setAttendance(new Map());
      }
      return;
    }

    const newAttendance = new Map<string, AttendanceRecord>();
    const newDevices = new Map<number, Set<string>>();
    
    for (let i = 1; i <= (session.totalScans || 3); i++) {
        newDevices.set(i, new Set());
    }

    usersForSession.forEach(student => {
        const liveRecordData = liveRecords?.find(r => r.id === student.uid);
        if (liveRecordData) {
              const hydratedRecord: AttendanceRecord = {
                student: liveRecordData.student,
                scans: liveRecordData.scans.map((scan: any) => ({
                    ...scan,
                    timestamp: scan.timestamp ? new Date(scan.timestamp.seconds ? scan.timestamp.seconds * 1000 : scan.timestamp) : null
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
    
  }, [liveRecords, usersForSession, session.totalScans, session.status, areUsersLoading, attendance.size]);


  const generateNewCode = (prefix: string) => {
    const readableCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeValue = `${prefix}:${readableCode}:${Date.now()}`;
    return { readableCode, qrCodeValue };
  };

  const parseQrCodeValue = (qrValue: string) => {
    if (typeof qrValue !== 'string') return null;
    const parts = qrValue.split(':');
    return { prefix: parts[0] || '', readableCode: parts[1] || '', timestamp: parts[2] || '' };
  };

  const startSession = useCallback(async (payload: StartSessionPayload) => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Location Error', description: 'Geolocation is not supported by your browser.' });
      return;
    }
    const usersToEnroll = usersForSession.filter(u => u.role !== 'admin');
    if (!firestore || !userProfile || !sessionDocRef || usersToEnroll.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not start session. Ensure residents are loaded and you have permissions.' });
        return;
    }

    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const { qrCodeValue } = generateNewCode('scan1');
          
          const sessionData: Partial<AttendanceSession> = {
            key: qrCodeValue,
            adminUid: userProfile.uid,
            createdAt: new Date().toISOString(),
            lat: latitude,
            lng: longitude,
            subject: payload.subject,
            totalScans: payload.totalScans,
            currentScan: 1,
            radius: payload.radius,
          };
          
          if (attendanceMode === 'class') {
            sessionData.lateAfterMinutes = payload.lateAfterMinutes;
          } else { // Hostel mode
            sessionData.isSelfieRequired = payload.isSelfieRequired;
          }
    
          if (payload.totalScans >= 2) {
              const { qrCodeValue: secondKey } = generateNewCode('scan2');
              sessionData.secondKey = secondKey;
              sessionData.secondScanLateAfterMinutes = payload.lateAfterMinutes;
          }
          if (payload.totalScans === 3) {
            const { qrCodeValue: thirdKey } = generateNewCode('scan3');
            sessionData.thirdKey = thirdKey;
            sessionData.thirdScanLateAfterMinutes = payload.lateAfterMinutes;
          }
          
          const batch = writeBatch(firestore);
          batch.set(sessionDocRef, sessionData);
    
          usersToEnroll.forEach(student => {
              const recordRef = doc(firestore, 'sessions', `${attendanceMode}-current`, 'records', student.uid);
              
              const scans = Array.from({ length: payload.totalScans }, (v, i) => {
                  const scanData: Partial<ScanData> = {
                      status: 'absent',
                      timestamp: null,
                      minutesLate: 0,
                  };
                  // If hostel mode, generate a unique key for each scan
                  if (attendanceMode === 'hostel') {
                      scanData.uniqueScanKey = Math.random().toString(36).substring(2, 12).toUpperCase();
                  }
                  return scanData;
              });

              const initialRecord = {
                  student: {
                    uid: student.uid,
                    name: student.name,
                    email: student.email,
                    role: student.role,
                    roll: student.roll,
                    userType: student.userType
                  }, 
                  scans,
                  finalStatus: 'absent',
              };
              batch.set(recordRef, initialRecord);
          });
          
          await batch.commit();
          
          toast({ title: 'Session Started', description: `Residents can now perform the first scan.` });
          resolve();
        } catch (error) {
          toast({ variant: 'destructive', title: 'Session Start Failed', description: (error as Error).message });
          reject(error);
        }
      }, (error) => {
          let description = 'Could not get your location. Please ensure location services are enabled for your browser and this site.';
          if (error.code === error.PERMISSION_DENIED) {
            description = 'Location permission was denied. You must allow location access to start a session.';
          }
          toast({ variant: 'destructive', title: 'Location Error', description });
          reject(error);
      });
    });
  }, [toast, firestore, userProfile, sessionDocRef, usersForSession, attendanceMode]);
  
 const endSession = useCallback(async () => {
    if (!sessionDocRef || !dbSession || !firestore) return;

    try {
        const currentRecordsPath = `sessions/${attendanceMode}-current/records`;
        const recordsSnapshot = await getDocs(collection(firestore, currentRecordsPath));
        
        // Use a single batch to update finalStatus for live records
        const updateBatch = writeBatch(firestore);
        recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const scansCompleted = recordData.scans.filter((s: ScanData) => s.status !== 'absent').length;
            let finalStatus: AttendanceStatus = 'absent';
            
            if (scansCompleted > 0 && scansCompleted < recordData.scans.length) {
              finalStatus = 'left_early';
            } else if (scansCompleted === recordData.scans.length) {
                const isLate = recordData.scans.some((s: ScanData) => s.status === 'late');
                finalStatus = isLate ? 'late' : 'present';
            }

            updateBatch.update(recordDoc.ref, { finalStatus });
        });
        await updateBatch.commit();


        // Now, perform the archival in a second step
        const archiveBatch = writeBatch(firestore);
        const archiveSessionRef = doc(collection(firestore, "sessions"));
        
        const sessionToArchive: Partial<AttendanceSession> = {
          ...dbSession
        };

        // Clean up undefined optional fields before archiving
        if (sessionToArchive.secondKey === undefined) delete sessionToArchive.secondKey;
        if (sessionToArchive.thirdKey === undefined) delete sessionToArchive.thirdKey;
        if (sessionToArchive.subject === undefined) delete sessionToArchive.subject;
        if (sessionToArchive.lateAfterMinutes === undefined) delete sessionToArchive.lateAfterMinutes;
        if (sessionToArchive.secondScanLateAfterMinutes === undefined) delete sessionToArchive.secondScanLateAfterMinutes;
        if (sessionToArchive.thirdScanLateAfterMinutes === undefined) delete sessionToArchive.thirdScanLateAfterMinutes;


        archiveBatch.set(archiveSessionRef, sessionToArchive);
        
        // Re-fetch records that now have the finalStatus updated
        const finalRecordsSnapshot = await getDocs(collection(firestore, currentRecordsPath));

        finalRecordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const archiveRecordRef = doc(firestore, 'sessions', archiveSessionRef.id, 'records', recordDoc.id);
            const dataToArchive = {
                ...recordData,
                scans: recordData.scans.map((scan: any) => {
                    let timestamp = null;
                    // Handle both Firestore Timestamps and ISO strings
                    if (scan.timestamp) {
                        if (scan.timestamp.toDate) { // It's a Firestore Timestamp
                            timestamp = scan.timestamp.toDate().toISOString();
                        } else if (typeof scan.timestamp === 'string') { // It's already an ISO string
                            timestamp = scan.timestamp;
                        }
                    }
                    return {
                        ...scan,
                        timestamp,
                    };
                }),
                correctionRequest: recordData.correctionRequest || null,
            };
            archiveBatch.set(archiveRecordRef, dataToArchive);
            archiveBatch.delete(recordDoc.ref); // Delete from live collection
        });

        archiveBatch.delete(sessionDocRef); // Delete the live session doc

        await archiveBatch.commit();

        toast({ title: 'Session Ended', description: 'Attendance has been archived.' });

    } catch (error: any) {
        console.error("Failed to archive session:", error);
        toast({ variant: 'destructive', title: 'Error Ending Session', description: error.message || 'Could not archive records.' });
    }
}, [sessionDocRef, dbSession, firestore, toast, attendanceMode]);


const markAttendance = useCallback(async (payload: MarkAttendancePayload): Promise<boolean> => {
    const { studentId, code, deviceId } = payload;
    
    if (!firestore || session.status !== 'active' || !session.startTime) {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return false;
    }
    
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);
    const studentRecordSnap = await getDoc(studentDocRef);
    if (!studentRecordSnap.exists()) {
        toast({ variant: 'destructive', title: 'Record not found', description: 'Your attendance record could not be found.' });
        return false;
    }
    const studentRecord = studentRecordSnap.data();
    const currentScanIndex = session.currentScan - 1;
    const currentScanData = studentRecord.scans[currentScanIndex];

    // Check if code is valid
    if (attendanceMode === 'class') {
      const parsed = parseQrCodeValue(code);
      if (!parsed || parsed.readableCode.toUpperCase() !== session.readableCode.toUpperCase()) {
          toast({ variant: 'destructive', title: 'Invalid Code', description: 'The code you scanned is incorrect for the current scan.' });
          return false;
      }
    } else { // Hostel Mode
        if (code !== currentScanData.uniqueScanKey) {
             toast({ variant: 'destructive', title: 'Invalid Key', description: 'The attendance key is incorrect.' });
             return false;
        }
    }
    
    if (devicesInUse.get(session.currentScan)?.has(deviceId)) {
        toast({ variant: 'destructive', title: 'Device Already Used', description: 'This device has already marked attendance for this scan.' });
        return false;
    }

    if (currentScanData?.status !== 'absent') {
        toast({ title: 'Already Scanned', description: `You have already completed Scan ${session.currentScan}.` });
        return false;
    }

    const now = new Date();
    let status: 'present' | 'late' = 'present';
    let minutesLate = 0;
    
    const latePolicies = [session.lateAfterMinutes, session.secondScanLateAfterMinutes, session.thirdScanLateAfterMinutes];
    const latePolicyForCurrentScan = latePolicies[currentScanIndex];
    
    if (attendanceMode === 'class' && latePolicyForCurrentScan !== undefined && session.startTime) {
        const cutoffTime = new Date(session.startTime.getTime() + latePolicyForCurrentScan * 60000);
        if (now > cutoffTime) {
            status = 'late';
            minutesLate = Math.round((now.getTime() - cutoffTime.getTime()) / 60000);
        }
    }
    
    const updatedScans = [...studentRecord.scans];
    const scanUpdate: Partial<ScanData> = {
        ...currentScanData,
        status,
        minutesLate,
        timestamp: now.toISOString(),
        deviceId: deviceId,
    };
    
    updatedScans[currentScanIndex] = scanUpdate as ScanData;
    
    updateDocumentNonBlocking(studentDocRef, { scans: updatedScans });
    toast({ title: `Attendance Recorded!`, description: `You are marked as ${status.toUpperCase()}${minutesLate > 0 ? ` (${minutesLate} min late)` : ''}.` });
    return true;

}, [session, firestore, devicesInUse, toast, attendanceMode]);

const uploadSelfies = useCallback(async (studentId: string, photoURLs: string[]) => {
    if (!firestore || session.status !== 'active' || !session.startTime) {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'The attendance session is not active.' });
        return;
    }
    
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);

    try {
        const uploadedURLs = await Promise.all(
            photoURLs.map(dataUrl => uploadImageAndGetURL(dataUrl, studentId))
        );
        
        const studentRecordSnap = await getDoc(studentDocRef);
        if (!studentRecordSnap.exists()) {
             toast({ variant: 'destructive', title: 'Record not found', description: 'Could not find your record to save selfies.' });
            return;
        }

        const studentRecord = studentRecordSnap.data();
        const currentScanIndex = session.currentScan - 1;
        const updatedScans = [...studentRecord.scans];

        if(updatedScans[currentScanIndex]) {
            updatedScans[currentScanIndex].photoURLs = uploadedURLs;
        }
        
        updateDocumentNonBlocking(studentDocRef, { scans: updatedScans });
        toast({ title: 'Selfies Uploaded!', description: 'Your identity verification is complete.' });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Image Upload Failed', description: (error as Error).message });
        return;
    }
}, [firestore, session, toast, attendanceMode]);
  
  
  const activateNextScan = useCallback(async () => {
    if(!firestore || !sessionDocRef || !dbSession) return;
    
    const nextScanNumber = dbSession.currentScan + 1;
    if (nextScanNumber > dbSession.totalScans) {
        toast({ variant: 'destructive', title: 'No More Scans', description: 'This was the final scan of the session.' });
        return;
    }

    try {
        let keyFieldToUpdate: 'secondKey' | 'thirdKey';
        let newKey = '';
        if (nextScanNumber === 2) {
          keyFieldToUpdate = 'secondKey';
          newKey = dbSession.secondKey || generateNewCode(`scan${nextScanNumber}`).qrCodeValue;
        }
        else if (nextScanNumber === 3) {
          keyFieldToUpdate = 'thirdKey';
          newKey = dbSession.thirdKey || generateNewCode(`scan${nextScanNumber}`).qrCodeValue;
        }
        else return;
        
        const updatePayload: any = { 
            currentScan: nextScanNumber,
            [keyFieldToUpdate]: newKey
        };
        
        const batch = writeBatch(firestore);
        batch.update(sessionDocRef, updatePayload);

        // For hostel mode, generate new unique keys for the next scan
        if (attendanceMode === 'hostel') {
          const recordsSnapshot = await getDocs(collection(firestore, `sessions/${attendanceMode}-current/records`));
          recordsSnapshot.forEach(recordDoc => {
            const recordData = recordDoc.data();
            const updatedScans = [...recordData.scans];
            if (updatedScans[nextScanNumber - 1] && !updatedScans[nextScanNumber - 1].uniqueScanKey) {
              updatedScans[nextScanNumber - 1].uniqueScanKey = Math.random().toString(36).substring(2, 12).toUpperCase();
            }
            batch.update(recordDoc.ref, { scans: updatedScans });
          });
        }

        await batch.commit();
        
        toast({ title: `Scan ${nextScanNumber} Activated`, description: 'Residents must scan again to continue.' });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Activation Failed', description: 'Could not activate the next scan.' });
        console.error("Failed to activate next scan:", error);
    }
  }, [firestore, dbSession, toast, sessionDocRef, attendanceMode]);

  const requestCorrection = useCallback(async(studentId: string, reason: string) => {
    if (!firestore || session.status !== 'active') {
        toast({ variant: 'destructive', title: 'Session inactive', description: 'Cannot submit request for an inactive session.' });
        return;
    }
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);
    
    const correctionRequest = {
        requestedAt: new Date().toISOString(),
        reason: reason,
        status: 'pending',
    };

    updateDocumentNonBlocking(studentDocRef, { correctionRequest });
    toast({ title: 'Request Submitted', description: 'Your attendance correction request has been sent to the admin.' });

  }, [firestore, session.status, toast, attendanceMode]);

  const handleCorrectionRequest = useCallback(async(studentId: string, approved: boolean) => {
    if (!firestore) return;
    const studentDocRef = doc(firestore, `sessions/${attendanceMode}-current/records`, studentId);

    const studentRecordSnap = await getDoc(studentDocRef);
    if (!studentRecordSnap.exists()) return;
    
    const studentRecord = studentRecordSnap.data();

    const updateData: any = {
      'correctionRequest.status': approved ? 'approved' : 'denied'
    };

    if (approved) {
        const updatedScans = [...studentRecord.scans];
        updatedScans[0] = {
            ...updatedScans[0],
            status: 'present',
            minutesLate: 0,
            timestamp: new Date().toISOString(),
            deviceId: 'manual_admin_override',
        };
        updateData.scans = updatedScans;
        toast({ title: 'Request Approved', description: `${studentRecord.student.name} marked as present for scan 1.` });
    } else {
        toast({ title: 'Request Denied', description: `Correction request for ${studentRecord.student.name} has been denied.` });
    }

    updateDocumentNonBlocking(studentDocRef, updateData);

  }, [firestore, toast, attendanceMode]);


  const value = useMemo(() => ({
    session,
    usersForSession, 
    students: allUsers.filter(u => u.role === 'viewer'), // Provide the stable list of all students
    attendance,
    startSession,
    endSession,
    markAttendance,
    uploadSelfies,
    activateNextScan,
    requestCorrection,
    handleCorrectionRequest,
    attendanceMode,
    setAttendanceMode: handleSetAttendanceMode,
  }), [
    session,
    usersForSession,
    allUsers,
    attendance,
    startSession,
    endSession,
    markAttendance,
    uploadSelfies,
    activateNextScan,
    requestCorrection,
    handleCorrectionRequest,
    attendanceMode,
    handleSetAttendanceMode,
  ]);


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

    