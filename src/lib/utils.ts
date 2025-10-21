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
  const toRad = (value: number) => (value * Math.PI) / 180;

  const lat1 = p1.lat;
  const lon1 = p1.lng;
  const lat2 = p2.lat;
  const lon2 = p2.lng;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
