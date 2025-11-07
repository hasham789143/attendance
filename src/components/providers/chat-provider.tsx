
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './auth-provider';
import { useStore } from './store-provider';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, writeBatch, getDocs, Query, DocumentData } from 'firebase/firestore';
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
        if (!firestore || !userProfile || (userProfile.role === 'admin' && (!students || students.length === 0))) {
            return;
        }

        const unsubscribes: (() => void)[] = [];

        const setupSubscription = (chatOwnerUid: string, isOwnChat: boolean) => {
             const messagesRef = collection(firestore, 'chats', chatOwnerUid, 'messages');
             let q: Query<DocumentData>;

            if (isOwnChat) {
                // A user looking at their own chat only needs to count messages sent by others (admin)
                q = query(messagesRef, where('isRead', '==', false), where('senderUid', '!=', userProfile.uid));
            } else {
                // An admin looking at a student's chat only needs to count messages sent by that student
                q = query(messagesRef, where('isRead', '==', false), where('senderUid', '==', chatOwnerUid));
            }

            const unsubscribe = onSnapshot(q, snapshot => {
                setUnreadCounts(prev => ({ ...prev, [chatOwnerUid]: snapshot.size }));

                 // Show toast for new messages for a student if their chat is not active
                if (isOwnChat && snapshot.docChanges().some(change => change.type === 'added') && activeChatStudentUid !== chatOwnerUid) {
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
            },
            (error) => {
                console.error(`Error subscribing to chat for ${chatOwnerUid}:`, error.message);
            });
            unsubscribes.push(unsubscribe);
        };


        // Logic for admin: subscribe to all student chats
        if (userProfile.role === 'admin') {
            students.forEach(student => {
                setupSubscription(student.uid, false);
            });
        }
        // Logic for student: subscribe to their own chat
        else if (userProfile.role === 'viewer') {
            setupSubscription(userProfile.uid, true);
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
                const messagesRef = collection(firestore, 'chats', activeChatStudentUid, 'messages');
                
                // Build the query to find unread messages sent by the *other* party
                if (userProfile.role === 'admin') {
                    // Admin is viewing a student's chat, mark messages sent by the student as read
                    q = query(messagesRef, where('isRead', '==', false), where('senderUid', '==', activeChatStudentUid));
                } else {
                    // Student is viewing their own chat, mark messages sent by an admin as read
                    q = query(messagesRef, where('isRead', '==', false), where('senderUid', '!=', userProfile.uid));
                }

                try {
                    const snapshot = await getDocs(q);
                    if (snapshot.empty) return;
    
                    const batch = writeBatch(firestore);
                    snapshot.docs.forEach(doc => {
                        batch.update(doc.ref, { isRead: true });
                    });
                    await batch.commit();
                } catch (error) {
                    // Don't emit a global error here, just log it. A failed write is less critical.
                    console.error(`Failed to mark messages as read for chat ${activeChatStudentUid}:`, error);
                }
            };

            markAsRead();
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
