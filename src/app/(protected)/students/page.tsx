'use client';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from 'lucide-react';
import { UserProfile } from '@/components/providers/auth-provider';

export default function StudentsPage() {
  const { firestore } = useFirebase();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    const fetchStudents = async () => {
      setLoading(true);
      const studentsQuery = query(collection(firestore, "users"), where("role", "==", "viewer"));
      const querySnapshot = await getDocs(studentsQuery);
      const studentList = querySnapshot.docs.map(doc => doc.data() as UserProfile);
      setStudents(studentList.sort((a, b) => (a.roll || '').localeCompare(b.roll || '')));
      setLoading(false);
    };

    fetchStudents();
  }, [firestore]);

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline mb-4">Student Roster</h1>
      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
          <CardDescription>A list of all students enrolled in the class.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Avatar</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Roll Number</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map(student => (
                  <TableRow key={student.uid}>
                    <TableCell>
                      <Avatar>
                          <AvatarFallback>{student.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.roll || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
