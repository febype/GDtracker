// ═══════════════════════════════════════════════════════════════
// supabase.js — GD Tracker Supabase Integration Layer
// Usage: import { supabase, useAuth, db, timer } from './supabase'
// ═══════════════════════════════════════════════════════════════
// Environment variables required (e.g. .env or Vite/Next config):
//   VITE_SUPABASE_URL      = https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY = eyJhbGc...
//
// For Create React App:
//   REACT_APP_SUPABASE_URL
//   REACT_APP_SUPABASE_ANON_KEY
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────
const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL ||
  process.env?.REACT_APP_SUPABASE_URL ||
  process.env?.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  process.env?.REACT_APP_SUPABASE_ANON_KEY ||
  process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[GDTracker] ⚠ SUPABASE_URL or SUPABASE_ANON_KEY is missing. Check your .env file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ─────────────────────────────────────────
// HOOK: useAuth
// Handles Supabase Auth + profile loading
// ─────────────────────────────────────────
export function useAuth() {
  const [session, setSession]   = useState(null);   // Supabase session
  const [profile, setProfile]   = useState(null);   // public.profiles row
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Load profile row from public.profiles
  const loadProfile = useCallback(async (userId) => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (err) { console.error('[useAuth] loadProfile:', err); return null; }
    return data;
  }, []);

  useEffect(() => {
    let mounted = true;

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        if (mounted) setProfile(p);
      }
      setLoading(false);
    });

    // Auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        setSession(s);
        if (s?.user) {
          const p = await loadProfile(s.user.id);
          if (mounted) setProfile(p);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  // ── Auth actions ──

  const signIn = async (email, password) => {
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); return { error: err }; }
    return { data };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const signUp = async (email, password, meta = {}) => {
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: meta },   // name, role passed here → handle_new_user trigger reads it
    });
    if (err) { setError(err.message); return { error: err }; }
    return { data };
  };

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const p = await loadProfile(session.user.id);
    setProfile(p);
    return p;
  }, [session, loadProfile]);

  return { session, profile, loading, error, signIn, signOut, signUp, refreshProfile };
}

// ─────────────────────────────────────────
// HOOK: useRealtimeTable
// Subscribe to any table with Realtime
// ─────────────────────────────────────────
export function useRealtimeTable(table, query = () => supabase.from(table).select('*')) {
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await query();
    if (err) { setError(err); setLoading(false); return; }
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();

    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        fetch(); // re-fetch on any change
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, fetch]);

  return { rows, loading, error, refetch: fetch };
}

// ─────────────────────────────────────────
// DB — Data access layer
// All CRUD operations, returns { data, error }
// ─────────────────────────────────────────
export const db = {

  // ── profiles ─────────────────────────────
  profiles: {
    list: () =>
      supabase.from('profiles').select('*').order('name'),

    get: (id) =>
      supabase.from('profiles').select('*').eq('id', id).single(),

    update: (id, fields) =>
      supabase.from('profiles').update(fields).eq('id', id).select().single(),

    // Lead creating a user: uses admin via service role — call from server-side only
    // For client-side, use signUp() + profile update
  },

  // ── requests ─────────────────────────────
  requests: {
    list: () =>
      supabase.from('requests').select('*').order('created_at', { ascending: false }),

    get: (id) =>
      supabase.from('requests').select('*').eq('id', id).single(),

    create: (fields) =>
      supabase.from('requests').insert(fields).select().single(),

    update: (id, fields) =>
      supabase.from('requests').update(fields).eq('id', id).select().single(),

    pending: () =>
      supabase.from('requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),

    backlog: () =>
      supabase.from('requests').select('*').eq('status', 'backlog').order('created_at', { ascending: false }),
  },

  // ── tasks ─────────────────────────────────
  tasks: {
    list: () =>
      supabase.from('tasks')
        .select(`*, request:requests(*), designer:profiles!designer_id(*), assigner:profiles!assigned_by(*)`)
        .order('created_at', { ascending: false }),

    listForDesigner: (designerId) =>
      supabase.from('tasks')
        .select(`*, request:requests(*), assigner:profiles!assigned_by(*)`)
        .eq('designer_id', designerId)
        .order('created_at', { ascending: false }),

    listForRequest: (requestId) =>
      supabase.from('tasks')
        .select(`*, designer:profiles!designer_id(*), assigner:profiles!assigned_by(*)`)
        .eq('request_id', requestId),

    get: (id) =>
      supabase.from('tasks')
        .select(`*, request:requests(*), designer:profiles!designer_id(*), assigner:profiles!assigned_by(*)`)
        .eq('id', id).single(),

    create: (fields) =>
      supabase.from('tasks').insert(fields).select().single(),

    update: (id, fields) =>
      supabase.from('tasks').update(fields).eq('id', id).select().single(),

    updateStatus: async (id, status) => {
      const fields = { status };
      if (status === 'on_progress') fields.accepted_at = new Date().toISOString();
      if (status === 'done')        fields.completed_at = new Date().toISOString();
      return supabase.from('tasks').update(fields).eq('id', id).select().single();
    },

    incrementRevision: (id) =>
      supabase.rpc('increment_revision_count', { task_id: id }),
  },

  // ── work_sessions ─────────────────────────
  sessions: {
    list: (taskId) =>
      supabase.from('work_sessions').select('*').eq('task_id', taskId).order('started_at', { ascending: false }),

    listForUser: (userId) =>
      supabase.from('work_sessions').select('*, task:tasks(task_id,request:requests(title))')
        .eq('user_id', userId).order('started_at', { ascending: false }),

    activeSession: (userId) =>
      supabase.from('work_sessions').select('*').eq('user_id', userId).is('ended_at', null).maybeSingle(),

    start: (taskId, userId, note = '') =>
      supabase.from('work_sessions').insert({ task_id: taskId, user_id: userId, note }).select().single(),

    stop: (sessionId) =>
      supabase.from('work_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId).select().single(),

    summary: (taskId) =>
      supabase.from('task_time_summary').select('*').eq('task_id', taskId),

    totalForTask: async (taskId) => {
      const { data } = await supabase.from('task_time_summary').select('total_seconds').eq('task_id', taskId);
      return data?.reduce((a, r) => a + (r.total_seconds || 0), 0) || 0;
    },
  },

  // ── comments ──────────────────────────────
  comments: {
    list: (taskId) =>
      supabase.from('comments')
        .select(`*, author:profiles!author_id(id,name,avatar_color,avatar_img)`)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),

    create: (fields) =>
      supabase.from('comments').insert(fields).select(`*, author:profiles!author_id(id,name,avatar_color,avatar_img)`).single(),
  },

  // ── activity_log ──────────────────────────
  activity: {
    list: (requestId) =>
      supabase.from('activity_log')
        .select(`*, actor:profiles!actor_id(id,name)`)
        .eq('request_id', requestId)
        .order('created_at', { ascending: false }),

    listForTask: (taskId) =>
      supabase.from('activity_log')
        .select(`*, actor:profiles!actor_id(id,name)`)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false }),

    create: (fields) =>
      supabase.from('activity_log').insert(fields).select().single(),
  },

  // ── notifications ─────────────────────────
  notifications: {
    list: (userId) =>
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),

    markRead: (id) =>
      supabase.from('notifications').update({ is_read: true }).eq('id', id),

    markAllRead: (userId) =>
      supabase.from('notifications').update({ is_read: true }).eq('user_id', userId),

    create: (userId, title, body, type = 'info') =>
      supabase.from('notifications').insert({ user_id: userId, title, body, type }).select().single(),

    unreadCount: async (userId) => {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false);
      return count || 0;
    },
  },
};

// ─────────────────────────────────────────
// HOOK: useTimer
// Per-task work session timer with Supabase persistence
// ─────────────────────────────────────────
export function useTimer(taskId, userId) {
  const [running, setRunning]       = useState(false);
  const [elapsed, setElapsed]       = useState(0);       // seconds
  const [sessionId, setSessionId]   = useState(null);    // active work_session.id
  const [totalTime, setTotalTime]   = useState(0);       // historical seconds
  const [loading, setLoading]       = useState(false);
  const intervalRef                 = useRef(null);
  const startedAtRef                = useRef(null);

  // Load total historical time + check for already-running session
  useEffect(() => {
    if (!taskId || !userId) return;
    let mounted = true;

    (async () => {
      // Check for orphaned running session (browser closed mid-session)
      const { data: open } = await db.sessions.activeSession(userId);
      if (open && open.task_id === taskId && mounted) {
        const secondsElapsed = Math.floor((Date.now() - new Date(open.started_at).getTime()) / 1000);
        setSessionId(open.id);
        setElapsed(secondsElapsed);
        setRunning(true);
        startedAtRef.current = new Date(open.started_at).getTime();
      }
      // Total historical time
      const total = await db.sessions.totalForTask(taskId);
      if (mounted) setTotalTime(total);
    })();

    return () => { mounted = false; };
  }, [taskId, userId]);

  // Ticker
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000);
        setElapsed(secs);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const start = useCallback(async (note = '') => {
    if (running || !taskId || !userId) return;
    setLoading(true);
    const { data, error } = await db.sessions.start(taskId, userId, note);
    if (error) { console.error('[useTimer] start:', error); setLoading(false); return; }
    startedAtRef.current = Date.now();
    setSessionId(data.id);
    setElapsed(0);
    setRunning(true);
    setLoading(false);
  }, [running, taskId, userId]);

  const stop = useCallback(async () => {
    if (!running || !sessionId) return;
    setLoading(true);
    const { data, error } = await db.sessions.stop(sessionId);
    if (error) { console.error('[useTimer] stop:', error); setLoading(false); return; }
    clearInterval(intervalRef.current);
    setRunning(false);
    setTotalTime(prev => prev + (data.duration_sec || 0));
    setElapsed(0);
    setSessionId(null);
    setLoading(false);
  }, [running, sessionId]);

  const toggle = useCallback((note) => running ? stop() : start(note), [running, start, stop]);

  // Format helper
  const fmt = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  return {
    running,
    elapsed,
    totalTime: totalTime + (running ? elapsed : 0),
    elapsedFmt: fmt(elapsed),
    totalFmt: fmt(totalTime + (running ? elapsed : 0)),
    loading,
    start,
    stop,
    toggle,
  };
}

// ─────────────────────────────────────────
// HOOK: useNotifications (realtime)
// ─────────────────────────────────────────
export function useNotifications(userId) {
  const [notifs, setNotifs]   = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await db.notifications.list(userId);
    setNotifs(data || []);
    setUnread((data || []).filter(n => !n.is_read).length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
    if (!userId) return;

    const channel = supabase.channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifs(prev => [payload.new, ...prev]);
        setUnread(prev => prev + 1);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, fetch]);

  const markRead = async (id) => {
    await db.notifications.markRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await db.notifications.markAllRead(userId);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const push = async (targetUserId, title, body, type = 'info') => {
    await db.notifications.create(targetUserId, title, body, type);
  };

  return { notifs, unread, loading, markRead, markAllRead, push, refetch: fetch };
}

// ─────────────────────────────────────────
// HOOK: useTasks
// Realtime task list with CRUD helpers
// ─────────────────────────────────────────
export function useTasks(designerId = null) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = designerId
      ? await db.tasks.listForDesigner(designerId)
      : await db.tasks.list();
    if (err) { setError(err); setLoading(false); return; }
    setTasks(data || []);
    setLoading(false);
  }, [designerId]);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('realtime:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetch]);

  const create = async (fields) => {
    const { data, error: err } = await db.tasks.create(fields);
    if (!err) fetch();
    return { data, error: err };
  };

  const update = async (id, fields) => {
    const { data, error: err } = await db.tasks.update(id, fields);
    if (!err) fetch();
    return { data, error: err };
  };

  const updateStatus = async (id, status) => {
    const { data, error: err } = await db.tasks.updateStatus(id, status);
    if (!err) fetch();
    return { data, error: err };
  };

  return { tasks, loading, error, refetch: fetch, create, update, updateStatus };
}

// ─────────────────────────────────────────
// HOOK: useRequests (realtime)
// ─────────────────────────────────────────
export function useRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await db.requests.list();
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('realtime:requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetch]);

  const create = async (fields) => {
    const { data, error } = await db.requests.create(fields);
    if (!error) fetch();
    return { data, error };
  };

  const update = async (id, fields) => {
    const { data, error } = await db.requests.update(id, fields);
    if (!error) fetch();
    return { data, error };
  };

  return { requests, loading, refetch: fetch, create, update };
}

// ─────────────────────────────────────────
// HOOK: useProfiles
// ─────────────────────────────────────────
export function useProfiles() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await db.profiles.list();
    setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id, fields) => {
    const { data, error } = await db.profiles.update(id, fields);
    if (!error) fetch();
    return { data, error };
  };

  return { users, loading, refetch: fetch, update };
}

// ─────────────────────────────────────────
// STORAGE — File upload helpers
// Bucket: 'task-files' (create in Supabase Storage dashboard)
// ─────────────────────────────────────────
export const storage = {
  upload: async (taskId, file) => {
    const ext  = file.name.split('.').pop();
    const path = `tasks/${taskId}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('task-files').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) return { error };
    const { data: { publicUrl } } = supabase.storage.from('task-files').getPublicUrl(path);
    return { url: publicUrl, path: data.path };
  },

  getUrl: (path) =>
    supabase.storage.from('task-files').getPublicUrl(path).data.publicUrl,

  list: (taskId) =>
    supabase.storage.from('task-files').list(`tasks/${taskId}`),

  delete: (path) =>
    supabase.storage.from('task-files').remove([path]),
};

// ─────────────────────────────────────────
// HELPER: logActivity
// Convenience wrapper for activity_log inserts
// ─────────────────────────────────────────
export async function logActivity(requestId, taskId, actorId, action, detail = '') {
  return db.activity.create({ request_id: requestId, task_id: taskId, actor_id: actorId, action, detail });
}

// ─────────────────────────────────────────
// HELPER: pushNotification
// ─────────────────────────────────────────
export async function pushNotification(userId, title, body, type = 'info') {
  return db.notifications.create(userId, title, body, type);
}

export default supabase;
