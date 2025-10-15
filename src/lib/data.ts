// This file is now deprecated as we are fetching users from Firestore.
// It can be removed in a future step.
export type Student = {
  id: string;
  name: string;
  rollNumber: string;
};

export const students: Student[] = [];
