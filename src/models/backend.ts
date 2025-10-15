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
    key: string; // The unique key or code associated with this attendance session.
    adminUid: string; // UID of the admin who created the session.
    createdAt: string; // ISO 8601 timestamp.
    lat: number;
    lng: number;
}


/**
 * Represents a single attendance record for a user in a specific session.
 */
export interface AttendanceRecord {
    uid: string; // UID of the user.
    name: string;
    roll?: string;
    email: string;
    status: string; // e.g., 'present'
    timestamp: string; // ISO 8601 timestamp.
    photoURL?: string; // URL of the photo taken during attendance.
    deviceId: string; // Unique identifier of the device used.
    distance?: number; // Distance from the session location.
}

/**
 * Application-wide settings.
 */
export interface Settings {
    isSelfieRequired: boolean;
    isRegistrationOpen: boolean;
}
