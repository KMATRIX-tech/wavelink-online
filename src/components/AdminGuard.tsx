import React from 'react';
import { useAuth } from '../context/AuthContext';

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const { isLoading, isAdmin, isSupportHelper, isSuperAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="text-center p-[60px] text-slate-900 dark:text-white">
        <h2 className="text-lg font-bold">Verifying Staff &amp; Admin Desk clearance...</h2>
      </div>
    );
  }

  if (!isAdmin && !isSupportHelper && !isSuperAdmin) {
    return (
      <div className="text-center p-10 text-slate-900 dark:text-white">
        <h2 className="text-xl font-bold mb-2">403 Forbidden</h2>
        <p className="mb-4">Access restricted to authorized WaveLink Staff (Owner, Moderator, or Support Helper).</p>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/';
          }}
          className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold"
        >
          Return Home
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
