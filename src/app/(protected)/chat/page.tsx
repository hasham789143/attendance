
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Send, User, Shield } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from '@/components/providers/store-provider';
import { useToast } from '@/hooks/use-toast.tsx';

type ChatMessage = {
  id?: string;
  text: string;
  senderUid: string;
  senderName: string;
  senderRole: 'admin' | 'viewer';
  timestamp: any; // Firestore timestamp or Date
};

export default function ChatPage() {
  const { userProfile } = useAuth();
  const { firestore } = useFirebase();
  const { students } = useStore(); // Use the stable, complete list of students
  const { toast } = useToast();
  
  const [selectedStudentUid, setSelectedStudentUid] = useState<string>('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // This effect correctly sets the initial chat context for both admins and students.
  useEffect(() => {
    if (userProfile?.role === 'viewer') {
      setSelectedStudentUid(userProfile.uid);
    } else if (userProfile?.role === 'admin' && students && students.length > 0 && !selectedStudentUid) {
      // For admins, default to the first student in the list if no one is selected yet.
      setSelectedStudentUid(students[0].uid);
    }
  }, [userProfile, students, selectedStudentUid]);

  const chatCollectionRef = useMemoFirebase(() => {
    if (!firestore || !selectedStudentUid) return null;
    return collection(firestore, 'chats', selectedStudentUid, 'messages');
  }, [firestore, selectedStudentUid]);

  const chatQuery = useMemoFirebase(() => {
    if (!chatCollectionRef) return null;
    return query(chatCollectionRef, orderBy('timestamp', 'asc'));
  }, [chatCollectionRef]);

  const { data: messages, isLoading } = useCollection<ChatMessage>(chatQuery);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !userProfile || !chatCollectionRef) return;

    setIsSending(true);
    const newMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
      text: message,
      senderUid: userProfile.uid,
      senderName: userProfile.name,
      senderRole: userProfile.role,
    };

     try {
        await addDoc(chatCollectionRef, {
            ...newMessage,
            timestamp: serverTimestamp()
        });
        setMessage('');
    } catch (error) {
        console.error("Error sending message:", error);
         toast({
            variant: "destructive",
            title: "Failed to send message",
            description: "Could not send your message. Please try again."
        });
    } finally {
        setIsSending(false);
    }
  };

  const getStudentName = (uid: string) => {
    if (!students) return 'Unknown Student';
    return students.find(s => s.uid === uid)?.name || 'Unknown Student';
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-headline">Chat</h1>
        <p className="text-muted-foreground">
          {userProfile?.role === 'admin' ? 'Communicate with students directly.' : 'Ask the administrator a question.'}
        </p>
      </div>

      <Card className="flex-1 flex flex-col">
        <CardHeader>
          {userProfile?.role === 'admin' ? (
             <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Conversation</CardTitle>
                    <CardDescription>
                        {selectedStudentUid ? `Chatting with ${getStudentName(selectedStudentUid)}` : 'Select a student to start chatting.'}
                    </CardDescription>
                </div>
                <Select onValueChange={setSelectedStudentUid} value={selectedStudentUid}>
                    <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                        {students && students.map(student => (
                            <SelectItem key={student.uid} value={student.uid}>
                                {student.name} ({student.roll || 'N/A'})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             </div>
          ) : (
             <>
                <CardTitle>Conversation with Admin</CardTitle>
                <CardDescription>Your chat history is saved here.</CardDescription>
             </>
          )}
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
          <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {isLoading && <Loader2 className="mx-auto h-8 w-8 animate-spin" />}
              {!isLoading && messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex items-start gap-3',
                    msg.senderUid === userProfile?.uid ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.senderUid !== userProfile?.uid && (
                     <Avatar className="h-8 w-8">
                        <AvatarFallback>
                            {msg.senderRole === 'admin' ? <Shield/> : <User/>}
                        </AvatarFallback>
                     </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-xs rounded-lg p-3 text-sm',
                      msg.senderUid === userProfile?.uid
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <p className="font-bold">{msg.senderName}</p>
                    <p>{msg.text}</p>
                     <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'sending...'}
                    </p>
                  </div>
                   {msg.senderUid === userProfile?.uid && (
                     <Avatar className="h-8 w-8">
                        <AvatarFallback>
                             {msg.senderRole === 'admin' ? <Shield/> : <User/>}
                        </AvatarFallback>
                     </Avatar>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
              {!isLoading && messages?.length === 0 && (
                <p className="text-center text-muted-foreground py-10">No messages yet. Start the conversation!</p>
              )}
            </div>
          </ScrollArea>
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-4 border-t">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isSending || !selectedStudentUid}
            />
            <Button type="submit" disabled={isSending || !message.trim()}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
