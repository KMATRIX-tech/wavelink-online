import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';

const ADMIN_EMAILS = ['keylanmbilinyi5@gmail.com'];

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const initialUser = auth.currentUser;
  const initialIsOwner = Boolean(
    initialUser?.email && ADMIN_EMAILS.includes(initialUser.email.trim().toLowerCase())
  );

  const [loading, setLoading] = useState(!initialUser);
  const [isAdmin, setIsAdmin] = useState(initialIsOwner);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user || !user.email) {
        setIsAdmin(false);
      } else {
        const isOwner = ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
        setIsAdmin(isOwner);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="text-center p-[60px] text-slate-900 dark:text-white">
        <h2 className="text-lg font-bold">Verifying Admin Desk clearance...</h2>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center p-10 text-slate-900 dark:text-white">
        <h2 className="text-xl font-bold mb-2">403 Forbidden</h2>
        <p className="mb-4">Access restricted to platform administrator.</p>
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
