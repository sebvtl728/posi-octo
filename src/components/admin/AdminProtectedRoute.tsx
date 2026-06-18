import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { onAdminAuthChanged } from '../../lib/auth';

export default function AdminProtectedRoute() {
  const [user, setUser] = useState<User | null | 'loading'>('loading');

  useEffect(() => {
    return onAdminAuthChanged(setUser);
  }, []);

  if (user === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center text-slate-400 text-sm">
        Vérification...
      </div>
    );
  }
  if (!user) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
