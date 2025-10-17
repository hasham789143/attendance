'use client';

import { useStore } from '@/components/providers/store-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';

export function QrCodeDisplay() {
  const { session } = useStore();

  if (session.status !== 'active') {
    return null;
  }

  return (
    <Card className="flex flex-col items-center justify-center p-6 bg-card">
      <CardHeader className="text-center p-2">
        <CardTitle>Scan {session.currentScan} of {session.totalScans}</CardTitle>
        <CardDescription>Scan the QR code or enter the code below.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 p-2">
        <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-lg overflow-hidden border-4 border-primary shadow-lg">
          <Image
            key={session.qrCodeValue}
            src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(session.qrCodeValue)}&qzone=1`}
            alt="QR Code"
            width={300}
            height={300}
            priority
            className="animate-in fade-in duration-500"
          />
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Code:</p>
          <p className="font-mono text-3xl font-bold tracking-widest text-primary animate-pulse">{session.readableCode}</p>
        </div>
      </CardContent>
    </Card>
  );
}
