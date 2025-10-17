
'use client';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, writeBatch, doc } from 'firebase/firestore';
import { Loader2, Trash2 } from 'lucide-react';
import { AttendanceSession } from '@/models/backend';
import { SessionHistory } from '@/components/dashboard/session-history';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast.tsx';


export default function ReportsPage() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
  };

  const handleSelectSession = (sessionId: string, isSelected: boolean) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(sessionId);
      } else {
        newSet.delete(sessionId);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = async () => {
    if (!firestore || selectedSessions.size === 0) return;

    const batch = writeBatch(firestore);
    selectedSessions.forEach(sessionId => {
      batch.delete(doc(firestore, "sessions", sessionId));
      // Note: This doesn't delete subcollections (records). A cloud function would be needed for that.
      // For this client-side implementation, we are only deleting the session document itself.
    });

    try {
      await batch.commit();
      toast({ title: "Sessions Deleted", description: `${selectedSessions.size} session(s) have been deleted.` });
      setSelectedSessions(new Set());
      setIsDeleteDialogOpen(false);
      
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Error", description: `Could not delete sessions: ${error.message}` });
    }
  };


  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold font-headline">Attendance Reports</h1>
        {selectedSessions.size > 0 && (
          <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected ({selectedSessions.size})
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
            {sessions && sessions.length > 0 ? (
                sessions.map((session, index) => (
                    <AccordionItem value={`item-${index}`} key={session.id}>
                        <div className="flex items-center gap-2">
                           <Checkbox
                             id={`select-${session.id}`}
                             checked={selectedSessions.has(session.id)}
                             onCheckedChange={(checked) => handleSelectSession(session.id, !!checked)}
                             className="ml-4"
                           />
                           <AccordionTrigger className="flex-1">
                                {getTriggerText(session)}
                           </AccordionTrigger>
                        </div>
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

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected {selectedSessions.size} session(s). The records within the sessions will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
