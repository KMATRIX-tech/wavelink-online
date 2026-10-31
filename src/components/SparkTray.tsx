import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Spark } from '../types';
import { SparkViewerModal } from './SparkViewerModal';
import { SparkComposerModal } from './SparkComposerModal';
import {
  Flame,
  Plus,
  Clock,
  Sparkles,
  Zap,
  Play
} from 'lucide-react';

export const SparkTray: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [activeSparks, setActiveSparks] = useState<Spark[]>([]);
  const [selectedSparkIndex, setSelectedSparkIndex] = useState<number | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  // Real-time listener for sparks
  useEffect(() => {
    const q = query(collection(db, 'sparks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date().getTime();
        const list: Spark[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Spark;
          // Filter strictly: only sparks that have not expired (< 24 hours)
          const expiresAtTime = new Date(data.expiresAt).getTime();
          if (expiresAtTime > now) {
            list.push({ ...data, id: docSnap.id });
          }
        });
        setActiveSparks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sparks');
      }
    );

    return () => unsub();
  }, []);

  // Periodic tick to remove expired sparks client-side every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      setActiveSparks((prev) =>
        prev.filter((spark) => new Date(spark.expiresAt).getTime() > now)
      );
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Calculate short remaining time
  const getHoursLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return '0m';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h left`;
    return `${minutes}m left`;
  };

  return (
    <>
      <div className="bg-[#FFFFFF] dark:bg-[#131927] border border-slate-200/80 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.06)]">
        {/* Tray Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#10B981] text-white shadow-xs">
              <Flame size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-extrabold text-[#0F172A] dark:text-white tracking-tight">
                  Sparks (24h Moments)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#10B981] border border-emerald-200 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <Zap size={10} className="fill-[#10B981] text-[#10B981]" />
                  <span>Live 24H</span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsComposerOpen(true)}
            className="px-4 py-2 rounded-2xl bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition active:scale-95"
          >
            <Plus size={14} />
            <span>Post Spark</span>
          </button>
        </div>

        {/* Horizontal Carousel Tray */}
        <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none pt-1">
          {/* Item 1: Current user "+ Add Spark" Button */}
          <div
            onClick={() => setIsComposerOpen(true)}
            className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
          >
            <div className="relative w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-[#3B82F6] to-[#10B981] transition-transform group-hover:scale-105 shadow-sm">
              <div className="w-full h-full rounded-full bg-white dark:bg-[#131927] p-0.5 flex items-center justify-center overflow-hidden">
                <img
                  src={
                    userProfile?.photoURL ||
                    currentUser?.photoURL ||
                    `https://api.dicebear.com/7.x/shapes/svg?seed=${currentUser?.uid || 'user'}`
                  }
                  alt="Your Spark"
                  className="w-full h-full rounded-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
              </div>

              {/* Plus Badge */}
              <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#10B981] border-2 border-white dark:border-[#131927] text-white flex items-center justify-center shadow-xs">
                <Plus size={12} className="stroke-[3]" />
              </div>
            </div>

            <span className="text-[11px] font-bold text-[#0F172A] dark:text-gray-300 max-w-[70px] truncate text-center">
              Your Spark
            </span>
          </div>

          {/* Active Sparks posted by community within 24h */}
          {activeSparks.map((spark, index) => {
            const isMine = spark.authorId === currentUser?.uid;

            return (
              <div
                key={spark.id}
                onClick={() => setSelectedSparkIndex(index)}
                className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
              >
                {/* Glowing Ring Avatar */}
                <div className="relative w-16 h-16 rounded-full p-0.75 bg-gradient-to-tr from-[#3B82F6] to-[#10B981] transition-transform group-hover:scale-105 shadow-md shadow-blue-500/15">
                  <div className="w-full h-full rounded-full bg-slate-100 overflow-hidden ring-2 ring-white dark:ring-[#131927] relative">
                    {spark.mediaType === 'video' ? (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center relative">
                        <img
                          src={spark.authorPhotoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${spark.authorId}`}
                          alt={spark.authorName}
                          className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                          <Play size={14} className="fill-white text-white" />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={spark.mediaUrl}
                        alt="Spark Moment"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Flame Badge */}
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#3B82F6] border-2 border-white dark:border-[#131927] text-white flex items-center justify-center shadow-xs">
                    <Flame size={11} className="fill-white text-white" />
                  </div>
                </div>

                {/* Author Name + Time Remaining */}
                <div className="flex flex-col items-center max-w-[72px]">
                  <span className="text-[11px] font-bold text-[#0F172A] dark:text-gray-200 truncate w-full text-center">
                    {isMine ? 'You' : spark.authorName.split(' ')[0]}
                  </span>
                  <span className="text-[9px] font-mono text-[#10B981] font-bold truncate">
                    {getHoursLeft(spark.expiresAt)}
                  </span>
                </div>
              </div>
            );
          })}

          {activeSparks.length === 0 && (
            <div className="flex items-center gap-3 pl-3 pr-6 py-2 text-xs text-slate-500 dark:text-gray-400">
              <span>Share a photo or short clip to light up today&apos;s community Sparks!</span>
            </div>
          )}
        </div>
      </div>

      {/* Spark Composer Modal */}
      <SparkComposerModal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
      />

      {/* Fullscreen Spark Story Viewer Modal */}
      {selectedSparkIndex !== null && activeSparks.length > 0 && (
        <SparkViewerModal
          sparks={activeSparks}
          initialIndex={selectedSparkIndex}
          onClose={() => setSelectedSparkIndex(null)}
        />
      )}
    </>
  );
};
