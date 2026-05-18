-- ═══════════════════════════════════════════════════════════════
-- GD TRACKER — SUPABASE SQL SCHEMA
-- Run this in Supabase SQL Editor (Settings → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('designer', 'lead', 'team_lead');
CREATE TYPE request_status AS ENUM (
  'pending','approved','backlog','assigned',
  'on_progress','on_review','revision','done','rejected','on_hold','canceled'
);
CREATE TYPE task_status AS ENUM (
  'assigned','on_progress','on_review','revision','done','on_hold','canceled','rejected'
);
CREATE TYPE priority_level AS ENUM ('Low','Medium','High');
CREATE TYPE workload_tier  AS ENUM ('light','medium','heavy');
CREATE TYPE comment_type   AS ENUM ('note','revision','file','system');
CREATE TYPE notif_type     AS ENUM ('task','deadline','revision','comment','success','status','info');
CREATE TYPE activity_action AS ENUM (
  'approved','rejected','assigned','status_change','revision','file','comment'
);

-- ─────────────────────────────────────────
-- TABLE: profiles
-- Extends Supabase auth.users; one row per authenticated user
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL,
  role           user_role NOT NULL DEFAULT 'designer',
  department     TEXT NOT NULL DEFAULT 'Design',
  phone          TEXT DEFAULT '',
  bio            TEXT DEFAULT '',
  avatar_color   TEXT DEFAULT '#1D6FBB',
  avatar_img     TEXT DEFAULT '',        -- base64 or URL
  points         INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- TABLE: requests
-- Design requests submitted via public form or internally
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id       TEXT NOT NULL UNIQUE,          -- GDR-ddmmyy-NNNN
  applicant_name   TEXT NOT NULL DEFAULT '',
  role_title       TEXT DEFAULT '',
  department       TEXT DEFAULT '',
  email            TEXT DEFAULT '',
  phone            TEXT DEFAULT '',
  product          TEXT DEFAULT '',
  title            TEXT NOT NULL DEFAULT '',
  design_type      TEXT DEFAULT '',
  description      TEXT DEFAULT '',
  guideline_link   TEXT DEFAULT '',
  priority         priority_level NOT NULL DEFAULT 'Medium',
  workload         workload_tier,
  status           request_status NOT NULL DEFAULT 'pending',
  deadline         DATE,
  reject_reason    TEXT DEFAULT '',
  attachments      TEXT[] DEFAULT '{}',           -- file names / URLs
  source           TEXT DEFAULT 'public_form',    -- 'public_form' | 'internal'
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_requests_status     ON public.requests(status);
CREATE INDEX idx_requests_deadline   ON public.requests(deadline);
CREATE INDEX idx_requests_created_at ON public.requests(created_at DESC);

-- ─────────────────────────────────────────
-- TABLE: tasks
-- One task per (request × designer). Multiple designers = multiple rows.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id         TEXT NOT NULL UNIQUE,           -- TSK-ddmmyy-NNNN-A
  request_id      UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  designer_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          task_status NOT NULL DEFAULT 'assigned',
  points_awarded  INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  revision_count  INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  files           TEXT[] DEFAULT '{}',
  accepted_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tasks_request_id  ON public.tasks(request_id);
CREATE INDEX idx_tasks_designer_id ON public.tasks(designer_id);
CREATE INDEX idx_tasks_status      ON public.tasks(status);

-- ─────────────────────────────────────────
-- TABLE: work_sessions
-- Timer tracking: start/stop sessions per task per user
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,                       -- NULL = session still running
  duration_sec INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
      ELSE NULL
    END
  ) STORED,
  note         TEXT DEFAULT '',                   -- optional session note
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ws_task_id  ON public.work_sessions(task_id);
CREATE INDEX idx_ws_user_id  ON public.work_sessions(user_id);
CREATE INDEX idx_ws_started  ON public.work_sessions(started_at DESC);

-- Prevent multiple open sessions per user
CREATE UNIQUE INDEX idx_ws_one_open_per_user
  ON public.work_sessions(user_id)
  WHERE ended_at IS NULL;

-- ─────────────────────────────────────────
-- TABLE: comments
-- Activity / comment thread per task
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    TEXT NOT NULL DEFAULT '',
  type       comment_type NOT NULL DEFAULT 'note',
  files      TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_task_id    ON public.comments(task_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at DESC);

-- ─────────────────────────────────────────
-- TABLE: activity_log
-- Immutable audit trail per request/task
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE,
  task_id    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     activity_action NOT NULL,
  detail     TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_request_id ON public.activity_log(request_id);
CREATE INDEX idx_activity_task_id    ON public.activity_log(task_id);
CREATE INDEX idx_activity_created_at ON public.activity_log(created_at DESC);

-- ─────────────────────────────────────────
-- TABLE: notifications
-- Per-user in-app notifications
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT DEFAULT '',
  type       notif_type NOT NULL DEFAULT 'info',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifs_user_id    ON public.notifications(user_id);
CREATE INDEX idx_notifs_is_read    ON public.notifications(is_read);
CREATE INDEX idx_notifs_created_at ON public.notifications(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── profiles ──
CREATE POLICY "Anyone authenticated can read profiles"
  ON public.profiles FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Lead can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth_role() = 'lead')
  WITH CHECK (auth_role() = 'lead');

CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ── requests ──
CREATE POLICY "Authenticated users can read requests"
  ON public.requests FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Anyone can insert requests (public form)"
  ON public.requests FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Lead can update requests"
  ON public.requests FOR UPDATE TO authenticated
  USING (auth_role() = 'lead')
  WITH CHECK (auth_role() = 'lead');

-- ── tasks ──
CREATE POLICY "Authenticated users can read tasks"
  ON public.tasks FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Lead can insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'lead');

CREATE POLICY "Designer and lead can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    designer_id = auth.uid()
    OR auth_role() = 'lead'
  );

-- ── work_sessions ──
CREATE POLICY "Users can read own work sessions"
  ON public.work_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth_role() IN ('lead','team_lead'));

CREATE POLICY "Users can insert own work sessions"
  ON public.work_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own work sessions"
  ON public.work_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── comments ──
CREATE POLICY "Authenticated users can read comments"
  ON public.comments FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Authenticated users can insert comments"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- ── activity_log ──
CREATE POLICY "Authenticated users can read activity"
  ON public.activity_log FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Authenticated users can insert activity"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ── notifications ──
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'designer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Award points when task is marked done
CREATE OR REPLACE FUNCTION award_points_on_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  wl      workload_tier;
  pts_min INTEGER;
  pts_max INTEGER;
  pts     INTEGER;
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' AND NEW.designer_id IS NOT NULL THEN
    SELECT r.workload INTO wl
    FROM public.requests r WHERE r.id = NEW.request_id;

    pts_min := CASE wl WHEN 'light' THEN 1 WHEN 'medium' THEN 6 ELSE 10 END;
    pts_max := CASE wl WHEN 'light' THEN 5 WHEN 'medium' THEN 15 ELSE 20 END;
    pts     := (pts_min + pts_max) / 2;

    UPDATE public.tasks    SET points_awarded = pts WHERE id = NEW.id;
    UPDATE public.profiles SET points = points + pts WHERE id = NEW.designer_id;

    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      NEW.designer_id,
      '🎉 Task approved',
      'Task completed · +' || pts || ' pts awarded',
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_points
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION award_points_on_done();

-- Notify designer when task is assigned
CREATE OR REPLACE FUNCTION notify_on_assign()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE req_title TEXT;
BEGIN
  IF NEW.designer_id IS NOT NULL AND OLD.designer_id IS DISTINCT FROM NEW.designer_id THEN
    SELECT title INTO req_title FROM public.requests WHERE id = NEW.request_id;
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      NEW.designer_id,
      '📋 Task assigned',
      'You have been assigned: ' || COALESCE(req_title,'a task'),
      'task'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_assign
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_assign();

-- Return canceled task's request to backlog if no active tasks remain
CREATE OR REPLACE FUNCTION restore_backlog_on_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE active_count INTEGER;
BEGIN
  IF NEW.status = 'canceled' AND OLD.status != 'canceled' THEN
    SELECT COUNT(*) INTO active_count
    FROM public.tasks
    WHERE request_id = NEW.request_id
      AND id        != NEW.id
      AND status NOT IN ('canceled','rejected','done');

    IF active_count = 0 THEN
      UPDATE public.requests
      SET status = 'backlog'
      WHERE id = NEW.request_id
        AND status NOT IN ('done','rejected','pending');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restore_backlog
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION restore_backlog_on_cancel();

-- ═══════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════

-- Total work time per task
CREATE OR REPLACE VIEW public.task_time_summary AS
SELECT
  task_id,
  user_id,
  COUNT(*)                             AS session_count,
  COALESCE(SUM(duration_sec), 0)      AS total_seconds,
  COALESCE(SUM(duration_sec), 0) / 60 AS total_minutes
FROM public.work_sessions
WHERE ended_at IS NOT NULL
GROUP BY task_id, user_id;

-- Designer workload snapshot
CREATE OR REPLACE VIEW public.designer_workload AS
SELECT
  p.id,
  p.name,
  p.role,
  p.points,
  COUNT(t.id)                                                      AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.status NOT IN ('done','canceled','rejected')) AS active_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'done')                   AS done_tasks,
  COALESCE(SUM(t.revision_count), 0)                             AS total_revisions
FROM public.profiles p
LEFT JOIN public.tasks t ON t.designer_id = p.id
WHERE p.role = 'designer'
GROUP BY p.id, p.name, p.role, p.points;

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA (optional — remove in production)
-- ═══════════════════════════════════════════════════════════════
-- NOTE: Users must be created via Supabase Auth first.
-- Then run this block substituting real auth UUIDs.
-- Example placeholder IDs used here for reference only.

/*
INSERT INTO public.profiles (id, name, email, role, department, phone) VALUES
  ('00000000-0000-0000-0000-000000000001','Jordan Lee','jordan@co.com','lead','Design','+62 877-2211-1173'),
  ('00000000-0000-0000-0000-000000000002','Riley Chen','riley@co.com','team_lead','Design','+62 812-3456-7890'),
  ('00000000-0000-0000-0000-000000000003','Sam Rivera','sam@co.com','designer','Design','+1 555 0103'),
  ('00000000-0000-0000-0000-000000000004','Chris Park','chris@co.com','designer','Design','+1 555 0104'),
  ('00000000-0000-0000-0000-000000000005','Dana Kim','dana@co.com','designer','Design','+1 555 0105')
ON CONFLICT (id) DO NOTHING;
*/
