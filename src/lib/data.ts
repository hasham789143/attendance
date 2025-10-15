export type Student = {
  id: string;
  name: string;
  rollNumber: string;
};

export type User = {
  id: string;
  name:string;
  email: string;
  role: 'admin' | 'student';
  studentProfile?: Student;
};

const firstNames = ["Leia", "Sadie", "Jose", "Sara", "Frank", "Dewey", "Tomas", "Joel", "Lukas", "Carlos"];
const lastNames = ["Liberty", "Ray", "Harrison", "Bryan", "Perez", "Cunningham", "Hunt", "Hughes", "Morgan", "Ramirez"];

export const students: Student[] = Array.from({ length: 100 }, (_, i) => {
  const id = `${101 + i}`;
  const firstName = firstNames[i % firstNames.length];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return {
    id,
    name: `${firstName} ${lastName}`,
    rollNumber: `S${2024000 + i + 1}`,
  };
});

export const users: User[] = [
  {
    id: 'admin-01',
    name: 'Dr. Evelyn Reed',
    email: 'admin@edu.com',
    role: 'admin',
  },
  ...students.slice(0, 5).map((student, index) => ({
    id: `user-0${index + 1}`,
    name: student.name,
    email: `${student.name.split(' ')[0].toLowerCase()}@edu.com`,
    role: 'student' as const,
    studentProfile: student,
  })),
];
