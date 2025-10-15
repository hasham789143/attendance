'use client';

import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { StudentDashboard } from '@/components/dashboard/student-dashboard';
import { useAuth } from '@/components/providers/auth-provider';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  return <StudentDashboard />;
}
