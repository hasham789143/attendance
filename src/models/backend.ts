'use client';
// Note: This file is used to generate the backend.json file.
// It is not used directly by the application.
// You can edit this file to define the data models for your application.

/**
 * Represents a user of the attendance tracking system.
 */
export interface User {
    uid: string;
    name: string;
    roll?: string;
    email: string;
    /** @enum {string} */
    role: 'admin' | 'viewer' | 'disabled';
}

/**
 * Represents a specific attendance session, typically associated with a class or event.
 */
export interface AttendanceSession {
    key: string; // The unique key for the first scan.
    secondKey?: string; // The unique key for the second scan.
    thirdKey?: string; // The unique key for the third scan
    totalScans: number; // The total number of scans for this session (e.g. 2, 3)
    currentScan: number; // The current active scan number (1, 2, or 3)
    adminUid: string; // UID of the admin who created the session.
    createdAt: string; // ISO 8601 timestamp.
    lat: number;
    lng: number;
    radius: number; // Allowed radius in meters.
    lateAfterMinutes: number; // For first scan
    secondScanLateAfterMinutes?: number; // For second scan
    thirdScanLateAfterMinutes?: number; // For third scan
    subject?: string; // The subject of the class session
    isSelfieRequired?: boolean; // Whether a selfie is required for this session (hostel mode).
}

/**
 * Represents the status and data for a single scan within an attendance record.
 */
export interface ScanData {
    /** @enum {string} */
    status: 'present' | 'late' | 'absent';
    timestamp: string | null;
    minutesLate: number;
    deviceId?: string;
    photoURLs?: string[]; // URLs of the captured selfies for this scan.
}

/**
 * Represents a single attendance record for a user in a specific session.
 */
export interface AttendanceRecord {
    student: User;
    scans: ScanData[]; // An array holding the data for each scan.
    
    /** @enum {string} */
    finalStatus: 'present' | 'late' | 'absent' | 'left_early';
    
    correctionRequest?: {
        requestedAt: string;
        reason: string;
        status: 'pending' | 'approved' | 'denied';
    };
}

/**
 * Application-wide settings.
 */
export interface Settings {
    isSelfieRequired: boolean;
    isRegistrationOpen: boolean;
}

/**
 * Represents a text translation request and result.
 */
export interface Translate {
    sourceText: string;
    /** @enum {string} */
    sourceLanguage: 'English' | 'Chinese';
    /** @enum {string} */
    targetLanguage: 'English' | 'Chinese';
    translatedText?: string;
}
