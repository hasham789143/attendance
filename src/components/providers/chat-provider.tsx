
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './auth-provider';
import { useStore } from './store-provider';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, writeBatch, getDocs, Query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast.tsx';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type UnreadCounts = {
    [studentUid: string]: number;
};

type ChatContextType = {
    unreadCounts: UnreadCounts;
    totalUnreadCount: number;
    setActiveChatStudentUid: (uid: string | null) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
    const { firestore } = useFirebase();
    const { userProfile } = useAuth();
    const { students } = useStore();
    const { toast } = useToast();
    const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
    const [activeChatStudentUid, setActiveChatStudentUid] = useState<string | null>(null);

    useEffect(() => {
        if (!firestore || !userProfile || (userProfile.role === 'admin' && students.length === 0)) {
            return;
        }

        const unsubscribes: (() => void)[] = [];

        // Logic for admin: subscribe to all student chats
        if (userProfile.role === 'admin') {
            students.forEach(student => {
                const q = query(
                    collection(firestore, 'chats', student.uid, 'messages'),
                    where('isRead', '==', false)
                    // Removing the second where clause to avoid needing a composite index
                    // where('senderUid', '==', student.uid) 
                );

                const unsubscribe = onSnapshot(q, snapshot => {
                    // Filter on the client-side
                    const unreadCount = snapshot.docs.filter(doc => doc.data().senderUid === student.uid).length;
                    setUnreadCounts(prev => ({ ...prev, [student.uid]: unreadCount }));
                },
                (error) => {
                    const contextualError = new FirestorePermissionError({
                        path: `chats/${student.uid}/messages`,
                        operation: 'list',
                    });
                    errorEmitter.emit('permission-error', contextualError);
                });
                unsubscribes.push(unsubscribe);
            });
        }
        // Logic for student: subscribe to their own chat
        else if (userProfile.role === 'viewer') {
            const q = query(
                collection(firestore, 'chats', userProfile.uid, 'messages'),
                where('isRead', '==', false),
                where('senderUid', '!=', userProfile.uid)
            );

            const unsubscribe = onSnapshot(q, snapshot => {
                setUnreadCounts({ [userProfile.uid]: snapshot.size });

                // Show toast for new messages if chat is not active
                if (snapshot.docChanges().some(change => change.type === 'added') && activeChatStudentUid !== userProfile.uid) {
                    snapshot.docChanges().forEach(change => {
                         if (change.type === 'added') {
                             const message = change.doc.data();
                             if(message.senderUid !== userProfile.uid) {
                                 toast({
                                    title: `New message from ${message.senderName}`,
                                    description: message.text,
                                 });
                             }
                         }
                    })
                }
            },
            (error) => {
                const contextualError = new FirestorePermissionError({
                    path: `chats/${userProfile.uid}/messages`,
                    operation: 'list',
                });
                errorEmitter.emit('permission-error', contextualError);
            });
            unsubscribes.push(unsubscribe);
        }

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, [firestore, userProfile, students, toast, activeChatStudentUid]);
    
    // Effect to mark messages as read when a chat becomes active
    useEffect(() => {
        if (firestore && activeChatStudentUid && userProfile) {
            const markAsRead = async () => {
                let q: Query;
                
                const baseQuery = query(
                    collection(firestore, 'chats', activeChatStudentUid, 'messages'),
                    where('isRead', '==', false)
                );
                
                const snapshot = await getDocs(baseQuery);
                if (snapshot.empty) return;

                const batch = writeBatch(firestore);
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    // Admin marks messages from the student as read
                    if (userProfile.role === 'admin' && data.senderUid === activeChatStudentUid) {
                         batch.update(doc.ref, { isRead: true });
                    } 
                    // Student marks messages from admins as read
                    else if (userProfile.role !== 'admin' && data.senderUid !== userProfile.uid) {
                         batch.update(doc.ref, { isRead: true });
                    }
                });
                await batch.commit();
            };

            markAsRead().catch((error) => {
                const contextualError = new FirestorePermissionError({
                    path: `chats/${activeChatStudentUid}/messages`,
                    operation: 'update',
                });
                errorEmitter.emit('permission-error', contextualError);
            });
        }
    }, [firestore, activeChatStudentUid, userProfile]);

    const totalUnreadCount = useMemo(() => {
        return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    }, [unreadCounts]);

    const value = {
        unreadCounts,
        totalUnreadCount,
        setActiveChatStudentUid,
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}

export const useChat = (): ChatContextType => {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};
