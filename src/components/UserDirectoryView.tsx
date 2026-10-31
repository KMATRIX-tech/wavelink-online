import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { UserProfile } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { Users, Search, MessageSquare, Shield, AlertTriangle, ShieldAlert, Lock, Star, Sparkles, X, UserPlus, Check } from 'lucide-react';
import { isSuperAdminEmail, ADMIN_EMAIL } from '../firebase';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { toggleFollowUser } from '../services/notificationService';

interface UserDirectoryViewProps {
  onStartChat: (userId: string) => void;
}

export const UserDirectoryView: React.FC<UserDirectoryViewProps> = ({ onStartChat }) => {
  const { currentUser, canTalkToAdmin, isSuperAdmin, isSubAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminLockModal, setShowAdminLockModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const handleMessageClick = (targetUser: UserProfile) => {
    const isTargetAdmin = isSuperAdminEmail(targetUser.email);
    // Requirement 8: only admins or verified pple with the bluestar can talk to the admin
    if (isTargetAdmin && !canTalkToAdmin) {
      setShowAdminLockModal(true);
      return;
    }
    onStartChat(targetUser.id);
  };

  const handleToggleFollow = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    const isNowFollowing = await toggleFollowUser(
      currentUser.uid,
      currentUser.displayName || 'A waver',
      targetUser.id,
      targetUser.displayName
    );
    setFollowingMap((prev) => ({ ...prev, [targetUser.id]: isNowFollowing }));
    setSuccessNotice(
      isNowFollowing
        ? `You are now following ${targetUser.displayName} 🌟`
        : `Unfollowed ${targetUser.displayName}`
    );
    setTimeout(() => setSuccessNotice(null), 3000);
  };

  // Listen to currentUser's follows
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'follows'), where('followerId', '==', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, boolean> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data.targetUserId) map[data.targetUserId] = true;
        });
        setFollowingMap(map);
      },
      (err) => {
        console.warn('Follows snapshot notice:', err);
      }
    );
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as UserProfile));
        setUsers(list);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Directory users snapshot notice:', err);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [currentUser?.uid]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.bio || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="max-w-5xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {successNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in">
          <span>{successNotice}</span>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs px-2 py-1 rounded-lg hover:bg-emerald-100"
          >
            ✕
          </button>
        </div>
      )}
      <div className="bg-white dark:bg-[#131927] border border-blue-200/70 dark:border-gray-800 rounded-3xl p-6 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 text-xs font-bold uppercase tracking-wider mb-2">
            <Users size={13} />
            <span>Community Directory</span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#0F172A] dark:text-white">
            WaveLink Members ({users.length})
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-1">
            Real registered members across the network. Zero bot profiles or artificial activity.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-gray-400">Loading member directory...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#131927] border border-gray-200 dark:border-gray-800 rounded-3xl p-6">
          <Users size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {searchTerm ? 'No members found matching your search.' : 'No members registered yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const isMe = user.id === currentUser?.uid;

            return (
              <div
                key={user.id}
                className="bg-white dark:bg-[#131927] border border-slate-200/90 dark:border-gray-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between transition hover:border-blue-300 dark:hover:border-blue-900/60 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="relative">
                      <img
                        src={user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.id}`}
                        alt={user.displayName}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500/20"
                      />
                      {!user.isBanned && (
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131927]"
                          title="Online Member"
                        />
                      )}
                    </div>

                    <div>
                      {user.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 uppercase">
                          <ShieldAlert size={10} />
                          Banned
                        </span>
                      ) : user.status === 'warned' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 uppercase">
                          <AlertTriangle size={10} />
                          Warned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Online</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mb-2">
                    <CrystalBadge
                      email={user.email}
                      name={user.displayName}
                      isPro={user.isPro}
                      hasBlueStar={user.hasBlueStar || user.isPro}
                      isSubAdmin={user.isSubAdmin || user.role === 'sub_admin'}
                      size="md"
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        {user.username || `@${user.email.split('@')[0]}`}
                      </span>
                      <span>·</span>
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-4">
                    {user.bio || 'WaveLink Community Member'}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between text-xs gap-2">
                  <span className="text-[10px] text-gray-400">
                    Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>

                  {!isMe && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleFollow(user)}
                        className={`px-2.5 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1 transition ${
                          followingMap[user.id]
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600'
                        }`}
                      >
                        {followingMap[user.id] ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
                            <span>Follow</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleMessageClick(user)}
                        className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition ${
                          isSuperAdminEmail(user.email) && !canTalkToAdmin
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/40 hover:bg-amber-100'
                            : 'bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {isSuperAdminEmail(user.email) && !canTalkToAdmin ? (
                          <>
                            <Lock size={12} className="text-amber-500" />
                            <span>Admin</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare size={13} />
                            <span>Message</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Direct Messaging Restriction Modal */}
      {showAdminLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#131927] border border-amber-300 dark:border-amber-900/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setShowAdminLockModal(false)}
              className="absolute top-5 right-5 p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
              <Star size={28} className="fill-white" />
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                Verified Blue Star Required
              </span>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mt-1">
                Protected Administrator Channel
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Direct messaging and calls with Platform Administrator (<span className="font-semibold text-purple-600 dark:text-purple-400">{ADMIN_EMAIL}</span>) are strictly reserved for <strong className="text-sky-600 dark:text-sky-400">Verified Blue Star subscribers</strong> and <strong className="text-purple-600 dark:text-purple-400">Platform Administrators</strong>.
            </p>

            <div className="p-3.5 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-xs space-y-1.5">
              <div className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                <Sparkles size={14} className="text-sky-500" />
                <span>How to unlock direct access:</span>
              </div>
              <p className="text-[11px] text-sky-700 dark:text-sky-300">
                Subscribe to WaveLink Pro to immediately receive your permanent <strong>Verified Blue Star badge</strong>, direct admin access, 500MB uploads, and 1080p calling.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowAdminLockModal(false);
                  setShowPaymentModal(true);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition"
              >
                <Star size={16} className="fill-white" />
                <span>Get Verified Blue Star (Pro)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Checkout Modal */}
      {showPaymentModal && (
        <MobileMoneyPaymentModal
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSuccessNotice('🎉 Congratulations! You are now a Verified Blue Star member with full admin messaging and pro privileges unlocked!');
            setTimeout(() => setSuccessNotice(null), 5000);
          }}
        />
      )}
    </div>
  );
};
