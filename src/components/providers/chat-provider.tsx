
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
             // Query only for unread messages to avoid needing a composite index.
             // We will filter by sender on the client side.
             const q = query(messagesRef, where('isRead', '==', false));


            const unsubscribe = onSnapshot(q, snapshot => {
                const newMessages = snapshot.docChanges().filter(change => change.type === 'added').map(change => change.doc.data());
                
                // Client-side filtering for sender
                const relevantDocs = snapshot.docs.filter(doc => {
                    const message = doc.data();
                     if (isOwnChat) {
                        return message.senderUid !== userProfile.uid;
                    } else {
                        return message.senderUid === chatOwnerUid;
                    }
                });

                const unreadCount = relevantDocs.length;
                setUnreadCounts(prev => ({ ...prev, [chatOwnerUid]: unreadCount }));
                
                const shouldShowToast = isOwnChat ? (activeChatStudentUid !== chatOwnerUid) : (userProfile.role === 'admin' && activeChatStudentUid !== chatOwnerUid);

                if (shouldShowToast) {
                    newMessages.forEach(message => {
                        const isFromOtherParty = isOwnChat ? message.senderUid !== userProfile.uid : message.senderUid === chatOwnerUid;

                        if (isFromOtherParty) {
                            toast({
                                title: `New message from ${message.senderName}`,
                                description: message.text,
                            });
                        }
                    });
                }
            },
            (error) => {
                console.error(`Error subscribing to chat for ${chatOwnerUid}:`, error.message);
            });
            unsubscribes.push(unsubscribe);
        };


        if (userProfile.role === 'admin') {
            students.forEach(student => {
                setupSubscription(student.uid, false);
            });
        }
        else if (userProfile.role === 'viewer') {
            setupSubscription(userProfile.uid, true);
        }

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, [firestore, userProfile, students, toast, activeChatStudentUid]);
    
    useEffect(() => {
        if (firestore && activeChatStudentUid && userProfile) {
            const markAsRead = async () => {
                const messagesRef = collection(firestore, 'chats', activeChatStudentUid, 'messages');
                
                // This query now requires a composite index. We will simplify it.
                // Original failing query: query(messagesRef, where('isRead', '==', false), where('senderUid', '!=', userProfile.uid));
                
                const unreadQuery = query(messagesRef, where('isRead', '==', false));

                try {
                    const snapshot = await getDocs(unreadQuery);
                    if (snapshot.empty) return;
    
                    const batch = writeBatch(firestore);
                    snapshot.docs.forEach(doc => {
                        const message = doc.data();
                        const sentByOtherParty = userProfile.role === 'admin'
                            ? message.senderUid === activeChatStudentUid // Admin viewing student chat
                            : message.senderUid !== userProfile.uid;    // Student viewing their own chat

                        if (sentByOtherParty) {
                           batch.update(doc.ref, { isRead: true });
                        }
                    });
                    await batch.commit();
                } catch (error) {
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
