import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-lg font-bold text-primary', className)}>
      <ShieldCheck className="h-6 w-6" />
      <h1 className="font-headline">Class Guardian</h1>
    </div>
  );
}
