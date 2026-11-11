import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType, batchCacheUserProfiles, notifyQuotaExceeded, isFirestoreQuotaError } from '../firebase';
import { collection, query, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { UserProfile } from '../types';
import { CrystalBadge } from './CrystalBadge';
import { UserDirectorySkeleton } from './PostSkeleton';
import { Users, Search, MessageSquare, Shield, AlertTriangle, ShieldAlert, Lock, Star, Sparkles, X, UserPlus, Check, RefreshCw } from 'lucide-react';
import { isSuperAdminEmail, ADMIN_EMAIL } from '../firebase';
import { MobileMoneyPaymentModal } from './MobileMoneyPaymentModal';
import { toggleFollowUser } from '../services/notificationService';
import { QuotaExceededBanner } from './QuotaExceededBanner';

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
    const isTargetAdmin = isSuperAdminEmail(targetUser.email, targetUser.role);
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

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load currentUser's follows once with limit(50)
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    const fetchFollows = async () => {
      try {
        const q = query(collection(db, 'follows'), where('followerId', '==', currentUser.uid), limit(50));
        const snap = await getDocs(q);
        if (!isMounted) return;
        const map: Record<string, boolean> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data.targetUserId) map[data.targetUserId] = true;
        });
        setFollowingMap(map);
      } catch (err) {
        console.warn('Follows fetch notice:', err);
      }
    };
    fetchFollows();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Load directory profiles once with limit(25) + in-memory batch caching
  const loadDirectoryUsers = async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(25));
      const snapshot = await getDocs(q);
      const list: UserProfile[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as UserProfile));
      batchCacheUserProfiles(list);
      setUsers(list);
    } catch (err) {
      console.warn('Directory users fetch notice:', err);
      if (isFirestoreQuotaError(err)) notifyQuotaExceeded(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDirectoryUsers();
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
      <QuotaExceededBanner onRetry={() => loadDirectoryUsers(true)} />

      {successNotice && (
        <div className="p-4 rounded-2xl bg-teal-50 border border-teal-300 text-teal-950 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in">
          <span>{successNotice}</span>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-teal-800 hover:text-teal-950 text-xs px-2 py-1 rounded-lg hover:bg-teal-100"
          >
            ✕
          </button>
        </div>
      )}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-2">
            <Users size={13} />
            <span>Community Directory</span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#1C1917] flex items-center gap-2">
            <span>WaveLink Members</span>
            {isLoading ? (
              <span className="inline-block h-6 w-12 rounded-lg bg-stone-200 animate-pulse" />
            ) : (
              <span>({users.length})</span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-[#57534E] mt-1">
            Real registered members across the network. Zero bot profiles or artificial activity.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-3 text-[#57534E]" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#D6D3CD] text-xs sm:text-sm text-[#1C1917] placeholder-[#57534E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      {isLoading ? (
        <UserDirectorySkeleton count={6} />
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6">
          <Users size={32} className="mx-auto text-[#57534E] mb-2" />
          <p className="text-sm font-bold text-[#1C1917]">
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
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 shadow-xs flex flex-col justify-between transition hover:border-[#2563EB]/40 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="relative">
                      <img
                        src={user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.id}`}
                        alt={user.displayName}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-[#2563EB]/20"
                      />
                      {!user.isBanned && (
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#0D9488] ring-2 ring-white"
                          title="Online Member"
                        />
                      )}
                    </div>

                    <div>
                      {user.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 uppercase">
                          <ShieldAlert size={10} />
                          Banned
                        </span>
                      ) : user.status === 'warned' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 uppercase">
                          <AlertTriangle size={10} />
                          Warned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#0D9488] border border-teal-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />
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
                    <div className="flex items-center gap-1.5 text-xs text-[#57534E] mt-0.5">
                      <span className="font-mono text-[#2563EB] font-bold">
                        {user.username || `@${user.email.split('@')[0]}`}
                      </span>
                      <span>·</span>
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>

                  <p className="text-xs text-[#57534E] line-clamp-2 mb-4 leading-relaxed">
                    {user.bio || 'WaveLink Community Member'}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#EFECE6] flex items-center justify-between text-xs gap-2">
                  <span className="text-[11px] font-medium text-[#57534E]">
                    Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>

                  {!isMe && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleFollow(user)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition ${
                          followingMap[user.id]
                            ? 'bg-teal-50 text-[#0D9488] border border-teal-200 hover:bg-teal-100'
                            : 'bg-[#FAF7F2] text-[#1C1917] border border-[#D6D3CD] hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB]'
                        }`}
                      >
                        {followingMap[user.id] ? (
                          <>
                            <Check size={12} className="text-[#0D9488]" />
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
                        type="button"
                        onClick={() => handleMessageClick(user)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
                          isSuperAdminEmail(user.email, user.role) && !canTalkToAdmin
                            ? 'bg-amber-50 text-amber-900 border border-amber-300/80 hover:bg-amber-100'
                            : 'bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200/80'
                        }`}
                      >
                        {isSuperAdminEmail(user.email, user.role) && !canTalkToAdmin ? (
                          <>
                            <Lock size={12} className="text-amber-600" />
                            <span>Try Pro</span>
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

      {/* Gentle Try Pro Note when tapping Admin Direct Messaging */}
      {showAdminLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white border border-[#EFECE6] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowAdminLockModal(false)}
              className="absolute top-4 right-4 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:text-[#1C1917] hover:bg-[#FAF7F2]"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shadow-sm">
              <Star size={24} className="fill-white" />
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-[#2563EB] border border-blue-200">
                Try WaveLink Pro
              </span>
              <h3 className="text-lg font-extrabold text-[#1C1917] mt-1.5">
                Direct Administrator Messaging
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed">
              Direct messaging and calls with Platform Administrator (<span className="font-bold text-[#1C1917]">{ADMIN_EMAIL}</span>) are included with <strong>WaveLink Pro</strong>.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAdminLockModal(false);
                  setShowPaymentModal(true);
                }}
                className="flex-1 min-h-[48px] py-3 px-4 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#0D9488] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Star size={16} className="fill-white" />
                <span>Try WaveLink Pro</span>
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
            setSuccessNotice('Welcome to WaveLink Pro! Direct admin messaging and Pro privileges are now active.');
            setTimeout(() => setSuccessNotice(null), 5000);
          }}
        />
      )}
    </div>
  );
};
