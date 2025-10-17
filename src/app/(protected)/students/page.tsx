'use client';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { AttendanceSession } from '@/models/backend';
import { SessionHistory } from '@/components/dashboard/session-history';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { format } from 'date-fns';


export default function ReportsPage() {
  const { firestore } = useFirebase();

  const sessionsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // Query for the last 20 sessions, ordered by creation date
    return query(
      collection(firestore, "sessions"), 
      orderBy("createdAt", "desc"),
      limit(20)
    );
  }, [firestore]);

  const { data: sessions, isLoading } = useCollection<AttendanceSession & { id: string }>(sessionsQuery);

  const getTriggerText = (session: AttendanceSession) => {
    const dateString = format(new Date(session.createdAt), 'PPP p');
    if (session.subject) {
      return `${session.subject} - ${dateString}`;
    }
    return `Session from ${dateString}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline mb-4">Attendance Reports</h1>
      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
            {sessions && sessions.length > 0 ? (
                sessions.map((session, index) => (
                    <AccordionItem value={`item-${index}`} key={session.id}>
                        <AccordionTrigger>{getTriggerText(session)}</AccordionTrigger>
                        <AccordionContent>
                           <SessionHistory sessionId={session.id} sessionDate={new Date(session.createdAt)} />
                        </AccordionContent>
                    </AccordionItem>
                ))
            ) : (
                <p className="text-muted-foreground text-center py-8">No historical session data found.</p>
            )}
        </Accordion>
      )}
    </div>
  );
}
