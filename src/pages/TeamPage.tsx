import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { UserProfile, Company, Invitation } from '../types';
import { Users, Mail, Trash2, Plus, Shield, ShieldAlert, Check, Activity, BarChart2 } from 'lucide-react';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { StudioHeader } from '../components/ui/StudioHeader';
import { isAdminRole } from '../utils/userRoles';

export function TeamPage() {
  const { tasks } = useGlobalState();
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const highlightMemberId = searchParams.get('highlightMemberId');

  useEffect(() => {
    if (highlightMemberId && members.length > 0) {
      const el = document.getElementById(`member-card-${highlightMemberId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-zinc-900', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-zinc-900', 'ring-offset-2');
        }, 3000);
      }
    }
  }, [highlightMemberId, members]);

  const workload = useMemo(() => {
    const unassignedCount = tasks.filter((t) => !t.assigneeId && t.status !== 'done' && t.status !== 'icebox').length;
    const unassignedPoints = tasks
      .filter((t) => !t.assigneeId && t.status !== 'done' && t.status !== 'icebox')
      .reduce((sum, t) => sum + t.effortPoints, 0);
      
    const memberWorkload = members.map((member) => {
      const activeTasks = tasks.filter((t) => t.assigneeId === member.id && t.status !== 'done' && t.status !== 'icebox');
      const completedTasks = tasks.filter((t) => t.assigneeId === member.id && t.status === 'done');
      
      return {
        member,
        activeCount: activeTasks.length,
        activePoints: activeTasks.reduce((sum, t) => sum + t.effortPoints, 0),
        completedCount: completedTasks.length,
        completedPoints: completedTasks.reduce((sum, t) => sum + t.effortPoints, 0),
      };
    }).sort((a, b) => b.activePoints - a.activePoints);
    
    return { unassignedCount, unassignedPoints, memberWorkload };
  }, [tasks, members]);

  useEffect(() => {
    if (!auth.currentUser) return;

    let unsubMembers: () => void;
    let unsubInvites: () => void;

    const fetchUserAndCompany = async () => {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        setCurrentUserProfile(profile);

        if (profile.companyId) {
          const compRef = doc(db, 'companies', profile.companyId);
          const compSnap = await getDoc(compRef);
          if (compSnap.exists()) {
            setCompany(compSnap.data() as Company);
          }

          const membersQ = query(collection(db, 'users'), where('companyId', '==', profile.companyId));
          unsubMembers = onSnapshot(membersQ, (snapshot) => {
            setMembers(snapshot.docs.map(d => d.data() as UserProfile));
          }, (error) => logFirestoreError(error, OperationType.GET, 'users'));

          const invitesQ = query(collection(db, 'invitations'), where('companyId', '==', profile.companyId));
          unsubInvites = onSnapshot(invitesQ, (snapshot) => {
            setInvitations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation)));
          }, (error) => logFirestoreError(error, OperationType.GET, 'invitations'));
        }
      }
    };

    fetchUserAndCompany();

    return () => {
      if (unsubMembers) unsubMembers();
      if (unsubInvites) unsubInvites();
    };
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !company || !currentUserProfile) return;
    
    setIsInviting(true);
    try {
      await addDoc(collection(db, 'invitations'), {
        email: newEmail.trim().toLowerCase(),
        companyId: company.id,
        role: 'member',
        invitedBy: currentUserProfile.id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setNewEmail('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invitations');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invitations', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invitations/${id}`);
    }
  };

  if (!currentUserProfile || !company) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-sm font-semibold text-zinc-400 uppercase tracking-[0.24em]">Constructing radar...</div>
      </div>
    );
  }

  // Find max active points to calculate radar bars
  const maxActivePoints = Math.max(1, ...workload.memberWorkload.map(mw => mw.activePoints));

  return (
    <div className="flex flex-col h-full bg-zinc-50 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(24,24,27,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(161,161,170,0.09),transparent_25%)] pointer-events-none" />
      
      {/* Studio Header */}
      <StudioHeader
        badge="Capacity Radar"
        badgeIcon={<BarChart2 className="h-3 w-3" />}
        title="Team Allocation Grid."
        subtitle={`Monitor bandwidth distribution across ${members.length} active operators relative to ongoing workflows.`}
        actions={isAdminRole(currentUserProfile.role) && (
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 shrink-0">
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full sm:w-64 border-b border-zinc-200 bg-transparent py-2 text-sm font-medium outline-none transition focus:border-zinc-900 placeholder:text-zinc-400"
              placeholder="Invite sequence (Email)"
            />
            <button
              type="submit"
              disabled={isInviting || !newEmail.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-2 text-xs font-bold uppercase tracking-[0.24em] text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isInviting ? 'Sending...' : 'Deploy'}
            </button>
          </form>
        )}
      />

      <div className="flex-1 overflow-y-auto relative z-10 w-full p-4 md:p-8">
        <div className="mx-auto max-w-7xl max-w-[1200px] space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* Capacity Radar Grid */}
          <section>
             <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-4 px-2">Operator Bandwidth</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
               {/* Unassigned Work Tile */}
                <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-1">
                 <div>
                   <h3 className="text-sm font-black text-zinc-950 mb-1">Unassigned Queue</h3>
                   <p className="text-xs text-zinc-500 mb-6">Work pending allocation</p>
                 </div>
                 <div className="flex items-end gap-3 text-red-500">
                    <span className="text-5xl font-black leading-none tracking-tighter">{workload.unassignedPoints}</span>
                    <span className="text-xs font-bold uppercase tracking-[0.24em] mb-1">PT Flux</span>
                 </div>
                 <div className="text-xs text-zinc-400 mt-2 font-mono">
                   {workload.unassignedCount} distinct task(s)
                 </div>
               </div>

                {workload.memberWorkload.map(stat => {
                  const percentage = Math.round((stat.activePoints / maxActivePoints) * 100) || 0;
                  return (
                    <div id={`member-card-${stat.member.id}`} key={stat.member.id} className={`relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm flex flex-col group ${highlightMemberId === stat.member.id ? 'ring-2 ring-zinc-900 ring-offset-2' : ''}`}>
                     {/* Radar Background Bar */}
                     <div 
                       className={`absolute bottom-0 left-0 w-full bg-zinc-50 transition-all duration-1000 ease-out z-0`}
                       style={{ height: `${percentage}%` }}
                     />
                     
                     <div className="relative z-10 flex flex-col h-full">
                       <div className="flex items-start justify-between mb-4">
                         <div className="flex items-center gap-3">
                           <div className="h-10 w-10 shrink-0 rounded-full border border-zinc-200 bg-white flex items-center justify-center text-sm font-black text-zinc-950 shadow-sm">
                             {stat.member.displayName.charAt(0).toUpperCase() || stat.member.email.charAt(0).toUpperCase()}
                           </div>
                           <div>
                             <h3 className="text-sm font-black text-zinc-950">{stat.member.displayName || 'Unnamed Base'}</h3>
                             <p className="text-xs font-medium text-zinc-500">{isAdminRole(stat.member.role) ? 'Command' : 'Operator'}</p>
                           </div>
                         </div>
                         {isAdminRole(stat.member.role) && <Shield className="h-4 w-4 text-emerald-500" />}
                       </div>

                       <div className="mt-auto pt-6 flex justify-between items-end">
                         <div>
                           <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-1">Active Output</div>
                           <div className="flex items-baseline gap-1.5">
                             <span className="text-3xl font-black text-zinc-950 tracking-tighter">{stat.activePoints}</span>
                              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-[0.24em]">PTS</span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono mt-0.5">{stat.activeCount} task(s)</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-1">Burned Output</div>
                            <div className="flex items-baseline gap-1.5 justify-end">
                              <span className="text-xl font-bold text-zinc-700 tracking-tighter">{stat.completedPoints}</span>
                              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-[0.24em]">PTS</span>
                           </div>
                           <div className="text-xs text-zinc-400 font-mono mt-0.5">{stat.completedCount} task(s)</div>
                         </div>
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
          </section>

          {/* Pending Invitations Grid */}
          {invitations.length > 0 && (
             <section>
               <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-4 px-2">Outgoing Sequences</h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {invitations.map(invite => (
                   <div key={invite.id} className="rounded-[2rem] border border-zinc-200/60 bg-white/50 p-4 border-dashed relative">
                     <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                     <div className="h-8 w-8 rounded-full border border-zinc-200 bg-zinc-50 flex items-center justify-center mb-3">
                       <Mail className="h-3.5 w-3.5 text-zinc-400" />
                     </div>
                     <p className="text-xs font-bold text-zinc-900 truncate mb-1" title={invite.email}>{invite.email}</p>
                     <p className="text-[10px] font-mono text-zinc-500 mb-4">Pending deployment</p>
                     
                     {isAdminRole(currentUserProfile.role) && (
                       <button
                         onClick={() => handleRevokeInvite(invite.id)}
                          className="flex w-full items-center justify-center gap-1.5 rounded bg-zinc-100 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900"
                       >
                         <Trash2 className="h-3 w-3" />
                         Revoke
                       </button>
                     )}
                   </div>
                 ))}
               </div>
             </section>
          )}

        </div>
      </div>
    </div>
  );
}
