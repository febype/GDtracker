// ═══════════════════════════════════════════════════════════════
// App.jsx — GD Tracker with Supabase Integration
// Drop-in replacement for the top-level export default function App()
// in gd-tracker-v2.jsx
//
// HOW TO USE:
// 1. Install: npm install @supabase/supabase-js
// 2. Copy supabase.js alongside this file
// 3. Create .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
// 4. Run supabase_schema.sql in Supabase SQL Editor
// 5. Replace the export default App() in gd-tracker-v2.jsx with this file
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  supabase,
  useAuth,
  useTimer,
  useNotifications,
  db,
  logActivity,
  pushNotification,
  storage,
} from './supabase';

// ─────────────────────────────────────────
// ROOT — replaces App() in gd-tracker-v2.jsx
// ─────────────────────────────────────────
export default function App() {
  const { session, profile, loading, signIn, signOut, signUp } = useAuth();
  const [view, setView] = useState('public'); // 'public' | 'login' | 'app'

  // Sync view with auth state
  useEffect(() => {
    if (loading) return;
    if (session && profile) setView('app');
    else if (view === 'app') setView('login');
  }, [session, profile, loading]);

  if (loading) return <SplashScreen />;

  if (view === 'public')
    return (
      <PublicForm
        onSubmitReq={async (req) => {
          await db.requests.create(req);
        }}
        onStaffLogin={() => setView('login')}
      />
    );

  if (view === 'login' || !session)
    return (
      <LoginScreenSupabase
        onLogin={signIn}
        onBack={() => setView('public')}
      />
    );

  return (
    <MainAppSupabase
      profile={profile}
      onLogout={signOut}
    />
  );
}

// ─────────────────────────────────────────
// SPLASH — shown while auth loads
// ─────────────────────────────────────────
function SplashScreen() {
  return (
    <>
      <style>{`
        .splash{display:flex;align-items:center;justify-content:center;height:100vh;
          background:linear-gradient(135deg,#053A8C,#0857C3)}
        .splash-logo{width:56px;height:56px;border-radius:16px;
          background:rgba(255,255,255,.18);display:flex;align-items:center;
          justify-content:center;font-size:22px;font-weight:800;color:#fff;
          animation:splash-pulse 1.2s ease-in-out infinite}
        @keyframes splash-pulse{0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.7;transform:scale(.96)}}
      `}</style>
      <div className="splash">
        <div className="splash-logo">GD</div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// LOGIN — Supabase Auth version
// ─────────────────────────────────────────
function LoginScreenSupabase({ onLogin, onBack }) {
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [err, setErr]       = useState('');
  const [busy, setBusy]     = useState(false);

  const login = async () => {
    if (!email || !pw) { setErr('Enter email and password.'); return; }
    setBusy(true);
    setErr('');
    const { error } = await onLogin(email.trim(), pw);
    setBusy(false);
    if (error) setErr(error.message || 'Invalid email or password.');
  };

  // Reuses the existing css variable from gd-tracker-v2.jsx
  return (
    <><style>{css}</style>
      <div className="login-wrap">
        <div className="login-card">
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:26 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:'#0857C3',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:18, fontWeight:800, color:'#fff' }}>GD</div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#0F172A', letterSpacing:'-.3px' }}>Staff Portal</div>
              <div style={{ fontSize:12, color:'#64748B' }}>GD Tracker — Design Team</div>
            </div>
          </div>
          {err && <div className="login-err">⚠ {err}</div>}
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="you@company.com" />
          </div>
          <div className="fg">
            <label className="fl">Password</label>
            <input className="fi" type="password" value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()} />
          </div>
          <button
            className="btn btn-primary"
            style={{ width:'100%', height:42, fontSize:14, marginBottom:10 }}
            onClick={login} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
          <button className="btn" style={{ width:'100%' }} onClick={onBack}>
            ← Back to Request Form
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// MAIN APP — Supabase-backed version
// Replaces MainApp() in gd-tracker-v2.jsx
// ─────────────────────────────────────────
function MainAppSupabase({ profile, onLogout }) {
  const cu   = profile;
  const role = cu?.role;

  // ── State ──────────────────────────────
  const [users,          setUsers]          = useState([]);
  const [requests,       setRequests]       = useState([]);
  const [tasks,          setTasks]          = useState([]);
  const [comments,       setComs]           = useState([]);
  const [activity,       setActivity]       = useState([]);
  const [page,           setPage]           = useState('dashboard');
  const [modal,          setModal]          = useState(null);
  const [toast,          setToast]          = useState(null);
  const [profileTarget,  setProfileTarget]  = useState(null);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [syncU,          setSyncU]          = useState(cu);
  const sentReminders                       = useRef(new Set());

  // ── Supabase realtime notifications ────
  const { notifs, unread, markRead, markAllRead, push: pushN } = useNotifications(cu?.id);

  // ── Bootstrap: load all data ───────────
  const loadAll = useCallback(async () => {
    const [
      { data: usersData },
      { data: reqData },
      { data: taskData },
    ] = await Promise.all([
      db.profiles.list(),
      db.requests.list(),
      db.tasks.list(),
    ]);
    if (usersData)  setUsers(usersData);
    if (reqData)    setRequests(reqData);
    if (taskData)   setTasks(taskData);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime subscriptions
  useEffect(() => {
    const channels = [
      supabase.channel('rt:profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAll)
        .subscribe(),
      supabase.channel('rt:requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, loadAll)
        .subscribe(),
      supabase.channel('rt:tasks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadAll)
        .subscribe(),
    ];
    return () => channels.forEach(c => supabase.removeChannel(c));
  }, [loadAll]);

  // Sync own profile
  useEffect(() => {
    const me = users.find(u => u.id === cu?.id) || cu;
    setSyncU(me);
  }, [users, cu]);

  // ── Deadline reminders ─────────────────
  const checkDeadlines = useCallback(() => {
    const now2 = new Date(); now2.setHours(0,0,0,0);
    const tmr  = new Date(now2); tmr.setDate(tmr.getDate()+1);
    const day2 = new Date(tmr);  day2.setDate(day2.getDate()+1);
    tasks.forEach(task => {
      if (['done','canceled','rejected','on_hold'].includes(task.status)) return;
      if (!task.designer_id) return;
      // Support both joined and flat request data
      const req = task.request || requests.find(r => r.id === task.request_id);
      if (!req?.deadline) return;
      const dl = new Date(req.deadline); dl.setHours(0,0,0,0);
      if (dl >= tmr && dl < day2) {
        const key = `dl-tmr-${task.id}`;
        if (!sentReminders.current.has(key)) {
          sentReminders.current.add(key);
          pushN(task.designer_id, '⏰ Deadline tomorrow',
            `"${req.title}" is due tomorrow — ${new Date(req.deadline).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}`,
            'deadline');
        }
      }
      if (dl < now2) {
        const key = `dl-ov-${task.id}`;
        if (!sentReminders.current.has(key)) {
          sentReminders.current.add(key);
          const diff = Math.round((now2-dl)/(1000*60*60*24));
          pushN(task.designer_id, '🔴 Task overdue',
            `"${req.title}" is ${diff}d overdue`,
            'deadline');
        }
      }
    });
  }, [tasks, requests, pushN]);

  useEffect(() => {
    checkDeadlines();
    const t = setInterval(checkDeadlines, 60000);
    return () => clearInterval(t);
  }, [checkDeadlines]);

  // ── Helpers ────────────────────────────
  const showToast = (msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const go = p => {
    if (!allowed(role, p)) { showToast('Access denied', 'error'); return; }
    setPage(p);
    setProfileTarget(null);
    setSidebarOpen(false);
  };
  const safe = allowed(role, page) ? page : 'dashboard';
  const goDesignerProfile = user => { setProfileTarget(user); setPage('team'); setSidebarOpen(false); };

  const handleNotifClick = (n) => {
    markRead(n.id);
    const matchedTask = tasks.find(t => {
      const req = t.request || requests.find(r => r.id === t.request_id);
      return req && (t.designer_id === cu.id || role === 'lead' || role === 'team_lead')
        && (n.body.includes(req.title) || n.body.includes(t.task_id));
    });
    if (matchedTask) setModal({ type: 'task-detail', data: matchedTask });
  };

  // ── ACTIONS ────────────────────────────

  const logAct = (requestId, taskId, action, detail) =>
    logActivity(requestId, taskId, cu.id, action, detail);

  const approveReq = async (id, wl) => {
    if (!can(role, 'approve_request')) return;
    await db.requests.update(id, { status: 'backlog', workload: wl });
    await logAct(id, null, 'approved', `Approved · ${wl} workload`);
    showToast('Approved → Backlog');
    setModal(null);
    loadAll();
  };

  const rejectReq = async (id, reason) => {
    if (!can(role, 'reject_request')) return;
    await db.requests.update(id, { status: 'rejected', reject_reason: reason });
    await logAct(id, null, 'rejected', `Rejected: ${reason}`);
    showToast('Rejected', 'error');
    setModal(null);
    loadAll();
  };

  const assignDesigners = async (rid, dids) => {
    if (!can(role, 'assign_designer')) return;
    const req  = requests.find(x => x.id === rid);
    const existing = tasks.filter(t => t.request_id === rid);
    const sfxs = dids.map((_, i) => '-' + String.fromCharCode(65 + existing.length + i));

    await Promise.all(dids.map(async (did, i) => {
      const taskId = req.request_id.replace('GDR-', 'TSK-') + sfxs[i];
      const { data: newTask } = await db.tasks.create({
        task_id:     taskId,
        request_id:  rid,
        designer_id: did,
        assigned_by: cu.id,
        status:      'assigned',
      });
      await logAct(rid, newTask?.id, 'assigned',
        `Assigned to ${users.find(u => u.id === did)?.name || did}`);
    }));

    if (['backlog','pending'].includes(req.status))
      await db.requests.update(rid, { status: 'assigned' });

    showToast(`Assigned to ${dids.length} person(s)`);
    setModal(null);
    loadAll();
  };

  const updateStatus = async (tid, ns) => {
    await db.tasks.updateStatus(tid, ns);
    const task = tasks.find(t => t.id === tid);
    const req  = task?.request || requests.find(r => r.id === task?.request_id);
    await logAct(task?.request_id, tid, 'status_change', `Status → ${ns}`);

    // Notify other parties
    if (task) {
      const others = [...new Set([task.designer_id, task.assigned_by])].filter(id => id && id !== cu.id);
      await Promise.all(others.map(uid =>
        pushN(uid, '📌 Task updated', `${req?.title || 'Task'}: → ${ns}`, 'status')
      ));
    }

    // Restore to backlog if canceled and no active tasks remain
    if (ns === 'canceled' && task) {
      const remaining = tasks.filter(t =>
        t.request_id === task.request_id && t.id !== tid &&
        !['canceled','rejected','done'].includes(t.status)
      );
      if (remaining.length === 0) {
        const r = requests.find(r2 => r2.id === task.request_id);
        if (r && !['done','rejected','pending'].includes(r.status))
          await db.requests.update(task.request_id, { status: 'backlog' });
      }
    }
    loadAll();
  };

  const acceptTask = async tid => {
    await updateStatus(tid, 'on_progress');
    const t   = tasks.find(x => x.id === tid);
    const req = t?.request || requests.find(r => r.id === t?.request_id);
    if (t?.assigned_by && t.assigned_by !== cu.id)
      await pushN(t.assigned_by, '✅ Task accepted',
        `${syncU?.name} accepted: ${req?.title || 'task'}`, 'status');
    showToast('Accepted → In Progress');
  };

  const addCom = async (tid, content, type = 'note', fileNames = []) => {
    const { data: c } = await db.comments.create({
      task_id:   tid,
      author_id: cu.id,
      content,
      type,
      files: fileNames,
    });
    if (type === 'file') {
      const task = tasks.find(t => t.id === tid);
      await logAct(task?.request_id, tid, 'file', `File uploaded: ${fileNames.join(', ')}`);
    }
    const task = tasks.find(t => t.id === tid);
    const others = [...new Set([task?.designer_id, task?.assigned_by])].filter(id => id && id !== cu.id);
    await Promise.all(others.map(uid =>
      pushN(uid, '💬 New comment', `${syncU?.name}: ${content.slice(0,60)}`, 'comment')
    ));
    // Refresh comments for open modal
    if (modal?.data?.id === tid) {
      const { data: fresh } = await db.comments.list(tid);
      if (fresh) setComs(fresh);
    }
  };

  const requestRev = async (tid, note, fileNames = []) => {
    await addCom(tid, note, 'revision', fileNames);
    const task = tasks.find(t => t.id === tid);
    await db.tasks.update(tid, {
      status:         'revision',
      revision_count: (task?.revision_count || 0) + 1,
    });
    const req = task?.request || requests.find(r => r.id === task?.request_id);
    await logAct(task?.request_id, tid, 'revision',
      `Revision #${(task?.revision_count || 0) + 1}: ${note.slice(0,80)}`);
    await pushN(task?.designer_id, '🔄 Revision requested',
      `Revision for: ${req?.title || 'Task'}`, 'revision');
    showToast('Revision requested');
    setModal(null);
    loadAll();
  };

  const approveTask = async tid => {
    await db.tasks.updateStatus(tid, 'done');
    const task = tasks.find(t => t.id === tid);
    const req  = task?.request || requests.find(r => r.id === task?.request_id);
    const wl   = req?.workload;
    const pts  = { light:3, medium:10, heavy:15 }[wl] || 3;
    await db.tasks.update(tid, { points_awarded: pts });
    await db.profiles.update(task?.designer_id, {
      points: (users.find(u => u.id === task?.designer_id)?.points || 0) + pts,
    });
    if (req) await db.requests.update(req.id, { status: 'done' });
    await logAct(req?.id, tid, 'approved', `Approved · +${pts} pts`);
    await pushN(task?.designer_id, '🎉 Task approved',
      `${req?.title} completed · +${pts} pts`, 'success');
    showToast('Approved! Task closed 🎉');
    setModal(null);
    loadAll();
  };

  const saveProfile = async (id, fields) => {
    if (id !== cu.id && !can(role, 'edit_any_profile')) return;
    await db.profiles.update(id, fields);
    showToast('Profile saved');
    setModal(null);
    loadAll();
  };

  const addUser = async fd => {
    if (!can(role, 'add_user')) return;
    // Creates auth user — requires Supabase service role or invitation flow
    // For demo: create profile directly (works if auth user exists)
    const { error } = await supabase.auth.admin?.createUser?.({
      email: fd.email, password: fd.password,
      user_metadata: { name: fd.name, role: fd.role },
    }) || {};
    if (error) { showToast('Error creating user: ' + error.message, 'error'); return; }
    showToast(`${fd.name} added`);
    setModal(null);
    loadAll();
  };

  const removeUser = async id => {
    if (!can(role, 'remove_user')) return;
    if (id === cu.id) { showToast('Cannot remove yourself', 'error'); return; }
    await supabase.from('profiles').delete().eq('id', id);
    showToast('User removed', 'error');
    loadAll();
  };

  // Load comments when task modal opens
  useEffect(() => {
    if (modal?.type === 'task-detail' && modal.data?.id) {
      db.comments.list(modal.data.id).then(({ data }) => { if (data) setComs(data); });
      db.activity.listForTask(modal.data.id).then(({ data }) => { if (data) setActivity(data); });
    }
  }, [modal]);

  // ── Render (same JSX as MainApp in gd-tracker-v2.jsx) ──
  // NOTE: The JSX below is identical to the original MainApp return()
  // with the only changes being:
  //   - syncU   sourced from Supabase profile
  //   - notifs / unread / markRead from useNotifications hook
  //   - all setSharedUsers / setSharedRequests / setTasks replaced with loadAll()
  //
  // Paste in the full JSX from the original MainApp return() here,
  // replacing the local state setters with the async actions above.

  const allAssignable = users.filter(u =>
    u.role === 'designer' || (u.id === cu?.id && role === 'lead')
  );

  const renderPage = () => {
    if (!allowed(role, safe)) return <Forbidden />;
    const cp = { users, requests, tasks, activity, setModal, go, goDesignerProfile };
    switch (safe) {
      case 'dashboard':    return <Dashboard cu={syncU} {...cp} />;
      case 'queue':        return can(role,'approve_request')
        ? <IncomingRequests requests={requests.filter(r=>r.status==='pending')} setModal={setModal}/>
        : <Forbidden/>;
      case 'board':        return can(role,'view_all_board')
        ? <KanbanBoard {...cp} cu={syncU} role={role}/>
        : <Forbidden/>;
      case 'team':         return can(role,'view_team')
        ? <TeamPage {...cp} removeUser={removeUser} canEdit={can(role,'add_user')}
            initialProfile={profileTarget} onClearProfile={() => setProfileTarget(null)}/>
        : <Forbidden/>;
      case 'reports':      return can(role,'view_reports')
        ? <Reports requests={requests} tasks={tasks} users={users} goDesignerProfile={goDesignerProfile}/>
        : <Forbidden/>;
      case 'my-tasks':     return <MyTasks
        tasks={tasks.filter(t => t.designer_id === cu?.id)}
        requests={requests} setModal={setModal} acceptTask={acceptTask}/>;
      case 'task-list':    return can(role,'view_reports')
        ? <AllTaskList tasks={tasks} requests={requests} users={users}
            setModal={setModal} goDesignerProfile={goDesignerProfile}/>
        : <Forbidden/>;
      case 'profile':      return <ProfilePage
        cu={syncU} tasks={tasks.filter(t => t.designer_id === cu?.id)}
        requests={requests} go={go} setModal={setModal}/>;
      case 'edit-profile': return <EditProfilePage
        cu={syncU} onSave={fd => saveProfile(syncU?.id, fd)} go={go} role={role}/>;
      case 'notifications': return <NotifPage
        notifs={notifs} markRead={markRead}
        setNotifs={() => {}} onNotifClick={handleNotifClick}/>;
      default:             return <Forbidden/>;
    }
  };

  const Forbidden = () => (
    <div className="forbidden">
      <div style={{ fontSize:40 }}>🚫</div>
      <div style={{ fontSize:16, fontWeight:700 }}>Access Denied</div>
    </div>
  );

  // ── NAV identical to gd-tracker-v2.jsx ──
  const NAV = {
    designer: [
      { id:'dashboard',     label:'Dashboard',     icon:<IcoHome s={18} c="white"/> },
      { id:'my-tasks',      label:'My Tasks',      icon:<IcoTasks s={18} c="white"/> },
      { id:'board',         label:'Kanban',        icon:<IcoBoard s={18} c="white"/> },
      { id:'profile',       label:'Profile',       icon:<IcoUser s={18} c="white"/> },
      { id:'notifications', label:'Notifications', icon:<IcoBell s={18} c="white"/>, badge:unread },
    ],
    lead: [
      { id:'dashboard',     label:'Dashboard',     icon:<IcoHome s={18} c="white"/> },
      { id:'queue',         label:'Incoming',      icon:<IcoInbox s={18} c="white"/>,
        badge: requests.filter(r=>r.status==='pending').length || null },
      { id:'board',         label:'Kanban',        icon:<IcoBoard s={18} c="white"/> },
      { id:'team',          label:'Team',          icon:<IcoTeam s={18} c="white"/> },
      { id:'task-list',     label:'Task List',     icon:<IcoTasks s={18} c="white"/> },
      { id:'reports',       label:'Reports',       icon:<IcoChart s={18} c="white"/> },
      { id:'profile',       label:'Profile',       icon:<IcoUser s={18} c="white"/> },
      { id:'notifications', label:'Notifications', icon:<IcoBell s={18} c="white"/>, badge:unread },
    ],
    team_lead: [
      { id:'dashboard',     label:'Dashboard',     icon:<IcoHome s={18} c="white"/> },
      { id:'board',         label:'Kanban',        icon:<IcoBoard s={18} c="white"/> },
      { id:'team',          label:'Team',          icon:<IcoTeam s={18} c="white"/> },
      { id:'task-list',     label:'Task List',     icon:<IcoTasks s={18} c="white"/> },
      { id:'reports',       label:'Reports',       icon:<IcoChart s={18} c="white"/> },
      { id:'profile',       label:'Profile',       icon:<IcoUser s={18} c="white"/> },
      { id:'notifications', label:'Notifications', icon:<IcoBell s={18} c="white"/>, badge:unread },
    ],
  };
  const PAGE_TITLES = {
    dashboard:'Dashboard', queue:'Incoming Requests', board:'Kanban Board',
    team:'Team', reports:'Reports', 'my-tasks':'My Tasks',
    'task-list':'Task List', profile:'My Profile',
    notifications:'Notifications', 'edit-profile':'Edit Profile',
  };

  return (
    <><style>{css}</style>
      <div className="app">
        {sidebarOpen && <div className="sb-overlay" onClick={() => setSidebarOpen(false)}/>}
        <div className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-brand">
            <div className="sb-logo">GD</div>
            <div>
              <div className="sb-name">GD Tracker</div>
              <div className="sb-sub">Design Request System</div>
            </div>
          </div>
          <div className="sb-user" onClick={() => go('edit-profile')}>
            <Avatar name={syncU?.name} size={30} color={syncU?.avatar_color} img={syncU?.avatar_img}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="sb-uname" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {syncU?.name?.split(' ')[0]}
              </div>
              <div className="sb-urole">{ROLE_LABELS[role]}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div className="sb-section">Navigation</div>
          {(NAV[role] || []).map(item => (
            <div key={item.id}
              className={`nav-item${safe === item.id ? ' active' : ''}`}
              onClick={() => go(item.id)}>
              <span style={{ display:'flex', alignItems:'center', opacity:.85, flexShrink:0 }}>{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
            </div>
          ))}
          <div className="sb-footer">
            <button className="sb-logout" onClick={onLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <button className="topbar-btn hamburger" style={{ display:'none' }}
              onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="topbar-title">{PAGE_TITLES[safe] || ''}</div>
            <div style={{ fontSize:11, color:'#94A3B8', flexShrink:0 }}>
              {new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
            </div>
            <div className="topbar-btn" style={{ position:'relative', cursor:'pointer' }}
              onClick={() => go('notifications')} title="Notifications">
              <IcoBell s={20} c="#64748B"/>
              {unread > 0 &&
                <div style={{ position:'absolute', top:2, right:2, minWidth:16, height:16,
                  borderRadius:8, background:'#EF4444', border:'2px solid #fff',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, fontWeight:800, color:'#fff', padding:'0 3px' }}>
                  {unread > 9 ? '9+' : unread}
                </div>
              }
            </div>
            <div className="topbar-av" style={{ cursor:'pointer' }}
              onClick={() => go('profile')} title="My Profile">
              {syncU?.avatar_img
                ? <img src={syncU.avatar_img} alt={syncU.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : inits(syncU?.name)}
            </div>
          </div>
          <div className="content">{renderPage()}</div>
        </div>

        {/* Modals */}
        {modal?.type==='approve-request' && can(role,'approve_request') &&
          <ApproveModal req={modal.data} onClose={() => setModal(null)}
            onApprove={approveReq} onReject={rejectReq}/>}
        {modal?.type==='assign' && can(role,'assign_designer') &&
          <AssignModal req={modal.data} assignable={allAssignable} tasks={tasks}
            cu={cu} users={users} onClose={() => setModal(null)} onAssign={assignDesigners}/>}
        {modal?.type==='task-detail' &&
          <TaskModalSupabase
            task={modal.data} requests={requests} users={users}
            comments={comments} activity={activity}
            cu={syncU} role={role}
            onClose={() => setModal(null)}
            onStatus={updateStatus} onAccept={acceptTask}
            onRevision={requestRev} onApprove={approveTask}
            onComment={addCom} showToast={showToast}
            goDesignerProfile={goDesignerProfile}
            onAdditionalAssign={() => setModal({
              type:'assign',
              data: requests.find(r => r.id === modal.data.request_id) || modal.data,
            })}/>}
        {modal?.type==='req-detail' &&
          <ReqDetailModal req={modal.data}
            tasks={tasks.filter(t => t.request_id === modal.data.id)}
            users={users}
            activity={activity.filter(a => a.request_id === modal.data.id)}
            onClose={() => setModal(null)}/>}
        {modal?.type==='add-user' && can(role,'add_user') &&
          <AddUserModal onClose={() => setModal(null)} onAdd={addUser}/>}
        {modal?.type==='edit-user' && can(role,'edit_any_profile') &&
          <EditUserModal user={modal.data} onClose={() => setModal(null)}
            onSave={fd => saveProfile(modal.data.id, fd)}/>}

        {toast &&
          <div className="toast" style={{
            background: toast.type==='error' ? '#FEF2F2' : '#fff',
            color:      toast.type==='error' ? '#7F1D1D' : '#0F172A',
            border:     `1px solid ${toast.type==='error' ? '#FCA5A5' : '#E2E8F0'}`,
          }}>
            <span>{toast.type==='error' ? '⚠' : '✓'}</span>{toast.msg}
          </div>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// TaskModal — enhanced with useTimer
// Adds live work session timer to the task detail modal
// ─────────────────────────────────────────
function TaskModalSupabase(props) {
  const { task, cu } = props;
  const isOwner = cu?.id === task.designer_id;

  // Timer only for the assigned designer
  const timer = useTimer(isOwner ? task.id : null, isOwner ? cu?.id : null);

  return (
    <>
      {/* Render the original TaskModal */}
      <TaskModal {...props} timerSlot={
        isOwner && (
          <div style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'10px 14px', borderRadius:10,
            background: timer.running ? '#F0FDF4' : '#F8FAFC',
            border: `1.5px solid ${timer.running ? '#86EFAC' : '#E2E8F0'}`,
            marginBottom:14,
          }}>
            <div style={{
              width:8, height:8, borderRadius:'50%',
              background: timer.running ? '#16A34A' : '#94A3B8',
              flexShrink:0,
              boxShadow: timer.running ? '0 0 0 3px rgba(22,163,74,.2)' : 'none',
              animation: timer.running ? 'pulse 1.5s infinite' : 'none',
            }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color: timer.running ? '#15803D' : '#475569' }}>
                {timer.running ? `⏱ Timer running — ${timer.elapsedFmt}` : '⏱ Work Timer'}
              </div>
              <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>
                Total tracked: {timer.totalFmt}
              </div>
            </div>
            <button
              className={`btn btn-sm ${timer.running ? 'btn-ghost-red' : 'btn-success'}`}
              onClick={() => timer.toggle()}
              disabled={timer.loading}>
              {timer.loading ? '…' : timer.running ? '⏹ Stop' : '▶ Start'}
            </button>
          </div>
        )
      }/>
    </>
  );
}
