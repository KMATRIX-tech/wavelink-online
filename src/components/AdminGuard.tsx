import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ADMIN_EMAILS = ['keylanmbilinyi5@gmail.com'];

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const isOwnerEmail = Boolean(
        user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase())
      );

      if (isOwnerEmail) {
        // Auto-provision admin status in Firestore for keylanmbilinyi5@gmail.com
        try {
          await setDoc(
            doc(db, 'users', user.uid),
            {
              email: user.email,
              role: 'admin',
              isOwner: true
            },
            { merge: true }
          );
        } catch (err) {
          console.warn('Could not write admin role automatically:', err);
        }
        setIsAdmin(true);
      } else {
        // Check Firestore for standard users
        try {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          const userData = userDocSnap.exists() ? userDocSnap.data() : null;
          setIsAdmin(
            userData?.role === 'admin' ||
              userData?.role === 'super_admin' ||
              userData?.role === 'sub_admin' ||
              userData?.isSubAdmin === true ||
              userData?.isOwner === true
          );
        } catch {
          setIsAdmin(false);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-5 text-center">Checking Clearance...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="text-center p-10">
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
