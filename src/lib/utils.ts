import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Haversine formula to calculate distance between two points on Earth
export function getDistance(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): number {
  const R = 6371e3; // metres
  const φ1 = (p1.lat * Math.PI) / 180; // φ, λ in radians
  const φ2 = (p2.lat * Math.PI) / 180;
  const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
  const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // in metres
  return d;
}

// Function to get a unique device ID
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    // crypto.randomUUID() is a modern, secure way to get a UUID
    deviceId = self.crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}


export function getScanLabel(scanNumber: number, short = false, t?: (key: string) => string): string {
    const labels = [
      t ? t('scans.first') : "First",
      t ? t('scans.second') : "Second",
      t ? t('scans.third') : "Third"
    ];
    const prefix = labels[scanNumber - 1] || `${t ? t('scans.scan') : "Scan"} ${scanNumber}`;
    return short ? prefix : `${prefix} ${t ? t('scans.scan') : "Scan"}`;
}
