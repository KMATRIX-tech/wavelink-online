import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth, DAILY_REWARD_SCHEDULE } from '../context/AuthContext';
import { Coins, Sparkles } from 'lucide-react';

interface CompactPointsDisplayProps {
  userId?: string;
  onClick?: () => void;
  className?: string;
  showLabel?: boolean;
}

export const CompactPointsDisplay: React.FC<CompactPointsDisplayProps> = ({
  userId,
  onClick,
  className = '',
  showLabel = true
}) => {
  const { currentUser, userProfile } = useAuth();
  const targetUid = userId || currentUser?.uid;

  const fallbackPoints =
    userProfile?.points ??
    userProfile?.wavePoints ??
    DAILY_REWARD_SCHEDULE[0];

  const [points, setPoints] = useState<number>(fallbackPoints);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevPointsRef = useRef<number>(fallbackPoints);

  // Sync fallback if local profile updates before snapshot
  useEffect(() => {
    if (fallbackPoints > points) {
      setPoints(fallbackPoints);
    }
  }, [fallbackPoints, points]);

  // Real-time Firestore listener on the user's document for the 'points' field
  useEffect(() => {
    if (!targetUid) return;

    const userDocRef = doc(db, 'users', targetUid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const livePoints =
            typeof data.points === 'number'
              ? data.points
              : typeof data.wavePoints === 'number'
              ? data.wavePoints
              : fallbackPoints;

          if (livePoints !== prevPointsRef.current) {
            prevPointsRef.current = livePoints;
            setIsAnimating(true);
            const timer = setTimeout(() => setIsAnimating(false), 650);
            setPoints(livePoints);
            return () => clearTimeout(timer);
          } else {
            setPoints(livePoints);
          }
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
        } catch (err) {
          console.warn('CompactPointsDisplay snapshot notice:', err);
        }
      }
    );

    return () => unsubscribe();
  }, [targetUid, fallbackPoints]);

  if (!targetUid) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-50 via-yellow-50/90 to-emerald-50/80 hover:from-amber-100/90 hover:to-emerald-100/80 border border-amber-200/90 text-[#0F172A] shadow-2xs transition-all duration-200 active:scale-95 ${
        isAnimating ? 'scale-105 ring-2 ring-amber-400/60 bg-amber-100/80' : ''
      } ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      title={`${points.toLocaleString()} Points (Real-time synced)`}
    >
      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white shadow-2xs shrink-0">
        <Coins size={10} className={isAnimating ? 'animate-spin' : ''} />
      </span>
      <span className="font-mono text-xs font-black tracking-tight text-amber-900">
        {points.toLocaleString()}
      </span>
      {showLabel && (
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700/90 hidden sm:inline">
          pts
        </span>
      )}
      {isAnimating && (
        <Sparkles size={11} className="text-emerald-600 animate-pulse shrink-0" />
      )}
    </button>
  );
};
