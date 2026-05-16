// ═══════════════════════════════════════════════════════════════
//  lib/supabase.js
//  Supabase client + all data-access helpers used by the app.
//  Import: import { supabase, taskService, sessionService, ... } from './lib/supabase'
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

// ── ENV VARIABLES ───────────────────────────────────────────────
// .env.local (Next.js / Vite / CRA):
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
//
// Vite prefix: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
const SUPABASE_URL =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.REACT_APP_SUPABASE_URL   ||
      process.env.VITE_SUPABASE_URL        || ""
    : "";

const SUPABASE_ANON_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.REACT_APP_SUPABASE_ANON_KEY   ||
      process.env.VITE_SUPABASE_ANON_KEY        || ""
    : "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[GD Tracker] Missing Supabase env vars. " +
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

// ── CLIENT ──────────────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ── HELPERS ─────────────────────────────────────────────────────
const handle = (data, error, label = "") => {
  if (error) {
    console.error(`[supabase${label ? "::" + label : ""}]`, error.message);
    throw error;
  }
  return data;
};

// ═══════════════════════════════════════════════════════════════
//  AUTH SERVICE
// ═══════════════════════════════════════════════════════════════
export const authService = {
  /** Sign in with email + password */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return handle(data, error, "signIn");
  },

  /** Sign out current user */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /** Get current session */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return handle(session, error, "getSession");
  },

  /** Get current user's profile */
  async getProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return handle(data, error, "getProfile");
  },

  /** Update current user's profile */
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();
    return handle(data, error, "updateProfile");
  },

  /** Listen to auth state changes */
  onAuthChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => callback(session)
    );
    return subscription;
  },
};

// ═══════════════════════════════════════════════════════════════
//  PROFILES SERVICE
// ═══════════════════════════════════════════════════════════════
export const profileService = {
  /** Get all active profiles (for team page, assign modal) */
  async getAll() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("name");
    return handle(data, error, "profiles.getAll");
  },

  /** Get designer workload view */
  async getDesignerWorkload() {
    const { data, error } = await supabase
      .from("designer_workload")
      .select("*")
      .order("points", { ascending: false });
    return handle(data, error, "profiles.workload");
  },

  /** Deactivate (soft-delete) a profile */
  async deactivate(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", userId)
      .select()
      .single();
    return handle(data, error, "profiles.deactivate");
  },
};

// ═══════════════════════════════════════════════════════════════
//  REQUESTS SERVICE
// ═══════════════════════════════════════════════════════════════
export const requestService = {
  /** Fetch all requests, newest first */
  async getAll() {
    const { data, error } = await supabase
      .from("design_requests")
      .select("*")
      .order("created_at", { ascending: false });
    return handle(data, error, "requests.getAll");
  },

  /** Fetch single request */
  async getById(id) {
    const { data, error } = await supabase
      .from("design_requests")
      .select("*")
      .eq("id", id)
      .single();
    return handle(data, error, "requests.getById");
  },

  /** Create a new request (from public form) */
  async create(payload) {
    const { data, error } = await supabase
      .from("design_requests")
      .insert(payload)
      .select()
      .single();
    return handle(data, error, "requests.create");
  },

  /** Update request fields (approve, reject, set workload, etc.) */
  async update(id, updates) {
    const { data, error } = await supabase
      .from("design_requests")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    return handle(data, error, "requests.update");
  },

  /** Subscribe to real-time request changes */
  subscribe(callback) {
    return supabase
      .channel("design_requests")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "design_requests" },
        callback
      )
      .subscribe();
  },
};

// ═══════════════════════════════════════════════════════════════
//  TASK SERVICE
// ═══════════════════════════════════════════════════════════════
export const taskService = {
  /** Fetch all tasks with joined request + designer data */
  async getAll() {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        design_requests ( id, request_id, title, design_type, priority,
                          workload, deadline, status, applicant_name,
                          department, description ),
        designer:profiles!tasks_designer_id_fkey ( id, name, email,
                          avatar_color, avatar_url, points ),
        assigner:profiles!tasks_assigned_by_fkey ( id, name )
      `)
      .order("created_at", { ascending: false });
    return handle(data, error, "tasks.getAll");
  },

  /** Fetch tasks for a specific designer */
  async getByDesigner(designerId) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        design_requests ( id, request_id, title, design_type, priority,
                          workload, deadline, applicant_name, description )
      `)
      .eq("designer_id", designerId)
      .order("created_at", { ascending: false });
    return handle(data, error, "tasks.getByDesigner");
  },

  /** Fetch single task by id */
  async getById(id) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        design_requests (*),
        designer:profiles!tasks_designer_id_fkey (*),
        assigner:profiles!tasks_assigned_by_fkey ( id, name )
      `)
      .eq("id", id)
      .single();
    return handle(data, error, "tasks.getById");
  },

  /** Create one or more tasks (assignment) */
  async create(payload) {
    const { data, error } = await supabase
      .from("tasks")
      .insert(Array.isArray(payload) ? payload : [payload])
      .select();
    return handle(data, error, "tasks.create");
  },

  /** Update task (status change, accept, revision count, files, etc.) */
  async update(id, updates) {
    const { data, error } = await supabase
      .from("tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    return handle(data, error, "tasks.update");
  },

  /** Soft-cancel a task */
  async cancel(id) {
    return taskService.update(id, { status: "canceled" });
  },

  /** Subscribe to real-time task changes */
  subscribe(callback) {
    return supabase
      .channel("tasks")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        callback
      )
      .subscribe();
  },

  /** Subscribe to tasks for a specific designer only */
  subscribeForDesigner(designerId, callback) {
    return supabase
      .channel(`tasks:designer:${designerId}`)
      .on("postgres_changes",
        {
          event: "*", schema: "public", table: "tasks",
          filter: `designer_id=eq.${designerId}`,
        },
        callback
      )
      .subscribe();
  },
};

// ═══════════════════════════════════════════════════════════════
//  WORK SESSION SERVICE  (timer tracking)
// ═══════════════════════════════════════════════════════════════
export const sessionService = {
  /** Start a new session for a task */
  async start(taskId, userId, note = "") {
    // End any existing running session for this user first
    await sessionService.endAllRunning(userId);

    const { data, error } = await supabase
      .from("work_sessions")
      .insert({
        task_id:    taskId,
        user_id:    userId,
        started_at: new Date().toISOString(),
        note,
      })
      .select()
      .single();
    return handle(data, error, "sessions.start");
  },

  /** End a session by id */
  async end(sessionId) {
    const endedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("work_sessions")
      .update({ ended_at: endedAt })
      .eq("id", sessionId)
      .select()
      .single();
    // duration_secs computed by trigger
    return handle(data, error, "sessions.end");
  },

  /** End ALL running sessions for a user (e.g. on logout or new start) */
  async endAllRunning(userId) {
    const { error } = await supabase
      .from("work_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("ended_at", null);
    if (error) console.warn("[sessions.endAllRunning]", error.message);
  },

  /** Get the currently running session for a user (if any) */
  async getRunning(userId) {
    const { data, error } = await supabase
      .from("work_sessions")
      .select("*, tasks(task_id, request_id)")
      .eq("user_id", userId)
      .is("ended_at", null)
      .maybeSingle();
    return handle(data, error, "sessions.getRunning");
  },

  /** Get all sessions for a task */
  async getByTask(taskId) {
    const { data, error } = await supabase
      .from("work_sessions")
      .select("*, profiles(name, avatar_color)")
      .eq("task_id", taskId)
      .order("started_at", { ascending: false });
    return handle(data, error, "sessions.getByTask");
  },

  /** Get summary for a task (total time) */
  async getSummary(taskId) {
    const { data, error } = await supabase
      .from("task_time_summary")
      .select("*")
      .eq("task_id", taskId)
      .maybeSingle();
    return handle(data, error, "sessions.getSummary");
  },

  /** Get all sessions for a user in a date range */
  async getByUser(userId, fromDate, toDate) {
    let q = supabase
      .from("work_sessions")
      .select("*, tasks(task_id, design_requests(title))")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false });

    if (fromDate) q = q.gte("started_at", fromDate);
    if (toDate)   q = q.lte("started_at", toDate);

    const { data, error } = await q;
    return handle(data, error, "sessions.getByUser");
  },

  /** Format seconds → "Xh Ym" */
  formatDuration(secs) {
    if (!secs || secs < 0) return "0m";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  /** Subscribe to work sessions for a task */
  subscribe(taskId, callback) {
    return supabase
      .channel(`work_sessions:${taskId}`)
      .on("postgres_changes",
        {
          event: "*", schema: "public", table: "work_sessions",
          filter: `task_id=eq.${taskId}`,
        },
        callback
      )
      .subscribe();
  },
};

// ═══════════════════════════════════════════════════════════════
//  COMMENT SERVICE
// ═══════════════════════════════════════════════════════════════
export const commentService = {
  /** Get all comments for a task, newest last */
  async getByTask(taskId) {
    const { data, error } = await supabase
      .from("comments")
      .select("*, author:profiles(id, name, avatar_color, avatar_url)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    return handle(data, error, "comments.getByTask");
  },

  /** Add a comment */
  async create(taskId, authorId, content, type = "note", files = []) {
    const { data, error } = await supabase
      .from("comments")
      .insert({ task_id: taskId, author_id: authorId, content, type, files })
      .select("*, author:profiles(id, name, avatar_color)")
      .single();
    return handle(data, error, "comments.create");
  },

  /** Subscribe to new comments on a task */
  subscribe(taskId, callback) {
    return supabase
      .channel(`comments:${taskId}`)
      .on("postgres_changes",
        {
          event: "INSERT", schema: "public", table: "comments",
          filter: `task_id=eq.${taskId}`,
        },
        callback
      )
      .subscribe();
  },
};

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY LOG SERVICE
// ═══════════════════════════════════════════════════════════════
export const activityService = {
  /** Log an activity entry */
  async log(requestId, taskId, actorId, action, detail, metadata = {}) {
    const { error } = await supabase
      .from("activity_log")
      .insert({ request_id: requestId, task_id: taskId,
                actor_id: actorId, action, detail, metadata });
    if (error) console.warn("[activity.log]", error.message);
  },

  /** Get activity for a request */
  async getByRequest(requestId) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*, actor:profiles(id, name, avatar_color)")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });
    return handle(data, error, "activity.getByRequest");
  },

  /** Get activity for a task */
  async getByTask(taskId) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*, actor:profiles(id, name, avatar_color)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    return handle(data, error, "activity.getByTask");
  },
};

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATION SERVICE
// ═══════════════════════════════════════════════════════════════
export const notifService = {
  /** Get notifications for a user */
  async getByUser(userId, limit = 50) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return handle(data, error, "notifs.getByUser");
  },

  /** Create a notification for one user */
  async create(userId, title, body, type = "info", taskId = null, requestId = null) {
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id:    userId,
        title,
        body,
        type,
        task_id:    taskId,
        request_id: requestId,
      });
    if (error) console.warn("[notifs.create]", error.message);
  },

  /** Mark one notification as read */
  async markRead(notifId) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notifId);
    if (error) console.warn("[notifs.markRead]", error.message);
  },

  /** Mark all notifications for a user as read */
  async markAllRead(userId) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) console.warn("[notifs.markAllRead]", error.message);
  },

  /** Subscribe to new notifications for a user */
  subscribe(userId, callback) {
    return supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes",
        {
          event: "INSERT", schema: "public", table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        payload => callback(payload.new)
      )
      .subscribe();
  },
};

// ═══════════════════════════════════════════════════════════════
//  STORAGE SERVICE  (file uploads for task attachments)
// ═══════════════════════════════════════════════════════════════
export const storageService = {
  BUCKET: "task-files",

  /** Upload a file — returns public URL */
  async upload(taskId, file) {
    const ext  = file.name.split(".").pop();
    const path = `tasks/${taskId}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
      .from(storageService.BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(storageService.BUCKET)
      .getPublicUrl(data.path);

    return { path: data.path, url: publicUrl, name: file.name };
  },

  /** Get public URL for a storage path */
  getPublicUrl(path) {
    const { data: { publicUrl } } = supabase.storage
      .from(storageService.BUCKET)
      .getPublicUrl(path);
    return publicUrl;
  },

  /** Delete a file by path */
  async delete(path) {
    const { error } = await supabase.storage
      .from(storageService.BUCKET)
      .remove([path]);
    if (error) console.warn("[storage.delete]", error.message);
  },
};

// ═══════════════════════════════════════════════════════════════
//  REALTIME MANAGER
//  Manage all subscriptions in one place, clean up on unmount.
// ═══════════════════════════════════════════════════════════════
export class RealtimeManager {
  constructor() {
    this._channels = [];
  }

  /** Add a channel subscription, store for cleanup */
  add(channel) {
    this._channels.push(channel);
    return channel;
  }

  /** Unsubscribe all channels */
  cleanup() {
    this._channels.forEach(ch => {
      supabase.removeChannel(ch).catch(() => {});
    });
    this._channels = [];
  }
}

export default supabase;
