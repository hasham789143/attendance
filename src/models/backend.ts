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
    adminUid: string; // UID of the admin who created the session.
    createdAt: string; // ISO 8601 timestamp.
    lat: number;
    lng: number;
    lateAfterMinutes?: number; // For first scan
    secondScanLateAfterMinutes?: number; // For second scan
    subject?: string; // The subject of the class session
}


/**
 * Represents a single attendance record for a user in a specific session.
 */
export interface AttendanceRecord {
    student: User;
    
    /** @enum {string} */
    scan1_status: 'present' | 'late' | 'absent';
    scan1_timestamp: string | null;
    scan1_minutesLate: number;

    /** @enum {string} */
    scan2_status: 'present' | 'late' | 'absent' | 'n/a';
    scan2_timestamp: string | null;
    scan2_minutesLate: number;

    /** @enum {string} */
    finalStatus: 'present' | 'late' | 'absent' | 'left_early';

    deviceId?: string; // Unique identifier of the device used.
}

/**
 * Application-wide settings.
 */
export interface Settings {
    isSelfieRequired: boolean;
    isRegistrationOpen: boolean;
}
