
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './auth-provider';
import { useStore } from './store-provider';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, writeBatch, getDocs, Query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast.tsx';

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
                    where('isRead', '==', false),
                    where('senderUid', '==', student.uid) // Only count messages from the student
                );

                const unsubscribe = onSnapshot(q, snapshot => {
                    setUnreadCounts(prev => ({ ...prev, [student.uid]: snapshot.size }));
                }, error => {
                    console.error(`Error fetching unread count for ${student.name}:`, error);
                });
                unsubscribes.push(unsubscribe);
            });
        }
        // Logic for student: subscribe to their own chat
        else if (userProfile.role === 'viewer') {
            const q = query(
                collection(firestore, 'chats', userProfile.uid, 'messages'),
                where('isRead', '==', false),
                where('senderUid', '!=', userProfile.uid) // Count messages not sent by me
            );

            const unsubscribe = onSnapshot(q, snapshot => {
                setUnreadCounts({ [userProfile.uid]: snapshot.size });

                // Show toast for new messages if chat is not active
                if (snapshot.docChanges().some(change => change.type === 'added') && activeChatStudentUid !== userProfile.uid) {
                    snapshot.docChanges().forEach(change => {
                         if (change.type === 'added') {
                             const message = change.doc.data();
                             toast({
                                title: `New message from ${message.senderName}`,
                                description: message.text,
                             });
                         }
                    })
                }
            }, error => {
                 console.error(`Error fetching unread count for myself:`, error);
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
                if (userProfile.role === 'admin') {
                    // Admin marks messages from the student as read
                     q = query(
                        collection(firestore, 'chats', activeChatStudentUid, 'messages'),
                        where('isRead', '==', false),
                        where('senderUid', '==', activeChatStudentUid)
                    );
                } else {
                    // Student marks messages from admins as read
                     q = query(
                        collection(firestore, 'chats', activeChatStudentUid, 'messages'),
                        where('isRead', '==', false),
                        where('senderUid', '!=', userProfile.uid)
                    );
                }
               
                const snapshot = await getDocs(q);
                if (snapshot.empty) return;

                const batch = writeBatch(firestore);
                snapshot.docs.forEach(doc => {
                    batch.update(doc.ref, { isRead: true });
                });
                await batch.commit();
            };

            markAsRead().catch(console.error);
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
