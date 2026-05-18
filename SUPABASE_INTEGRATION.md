# GD Tracker — Supabase Integration Guide

## Struktur File

```
project/
├── .env                     ← environment variables (JANGAN di-commit)
├── .env.example             ← template env untuk tim
├── src/
│   ├── supabase.js          ← Supabase client + semua hooks + db layer
│   ├── App_supabase.jsx     ← MainApp versi Supabase (pengganti gd-tracker-v2.jsx)
│   └── gd-tracker-v2.jsx   ← UI components (tidak berubah)
└── supabase_schema.sql      ← Jalankan di Supabase SQL Editor
```

---

## 1. Setup Project

### Install dependency

```bash
npm install @supabase/supabase-js
```

### Buat file `.env`

```env
# Vite
VITE_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Create React App (alternatif)
REACT_APP_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Next.js (alternatif)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> Nilai SUPABASE_URL dan ANON_KEY ada di:
> **Supabase Dashboard → Settings → API**

---

## 2. Setup Database

### Langkah-langkah

1. Buka **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Paste seluruh isi `supabase_schema.sql`
3. Klik **Run**
4. Verifikasi di **Table Editor** — 7 tabel harus muncul:
   - `profiles`
   - `requests`
   - `tasks`
   - `work_sessions`
   - `comments`
   - `activity_log`
   - `notifications`

### Buat bucket Storage (untuk upload file)

1. **Storage** → **New Bucket**
2. Nama: `task-files`
3. Public: ✅ (centang)
4. Tambahkan policy:

```sql
-- Authenticated users bisa upload
CREATE POLICY "Authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-files');

-- Semua orang bisa baca (public)
CREATE POLICY "Public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-files');

-- User hanya bisa hapus file miliknya
CREATE POLICY "Owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-files' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 3. Buat User Accounts

### Via Supabase Dashboard (Recommended untuk setup awal)

1. **Authentication** → **Users** → **Invite User**
2. Masukkan email → Send invitation
3. User klik link → set password
4. Profile otomatis dibuat via trigger `handle_new_user`
5. Update role di **Table Editor → profiles**:

```sql
UPDATE public.profiles
SET role = 'lead', name = 'Jordan Lee', phone = '+62 877-2211-1173'
WHERE email = 'jordan@co.com';

UPDATE public.profiles
SET role = 'team_lead', name = 'Riley Chen', phone = '+62 812-3456-7890'
WHERE email = 'riley@co.com';
```

### Via Supabase Auth API (Programmatic)

```js
// Di server/admin context saja — JANGAN dari client browser
const { data, error } = await supabase.auth.admin.createUser({
  email: 'sam@co.com',
  password: 'yourpassword',
  email_confirm: true,
  user_metadata: {
    name: 'Sam Rivera',
    role: 'designer',
  },
});
```

---

## 4. Integrasi ke Kode

### Opsi A — Ganti export default App()

Di `gd-tracker-v2.jsx`, hapus atau ganti seluruh `export default function App()` dengan import dari `App_supabase.jsx`:

```js
// Di gd-tracker-v2.jsx — bagian paling atas
export { default } from './App_supabase';
```

### Opsi B — Import langsung

```js
// main.jsx / index.js
import App from './App_supabase';
import ReactDOM from 'react-dom/client';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

### Opsi C — Hybrid (UI tetap + Supabase hooks)

Tambahkan di bagian atas `gd-tracker-v2.jsx`:

```js
import { useAuth, db, useTimer, useNotifications } from './supabase';
```

Lalu ganti fungsi-fungsi di `MainApp`:
- `pushN` → `pushNotification` dari supabase.js
- `setSharedRequests` → `db.requests.update`
- `setTasks` → `db.tasks.update`
- `setComs` → `db.comments.create`

---

## 5. Tabel & Kolom Lengkap

### `profiles`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | = auth.users.id |
| name | TEXT | Nama lengkap |
| email | TEXT | Email login |
| role | ENUM | designer / lead / team_lead |
| department | TEXT | Divisi |
| phone | TEXT | Nomor WA |
| bio | TEXT | Deskripsi singkat |
| avatar_color | TEXT | Hex color |
| avatar_img | TEXT | Base64 atau URL |
| points | INTEGER | Total poin designer |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | Auto-update |

### `requests`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| request_id | TEXT UNIQUE | Format GDR-ddmmyy-NNNN |
| applicant_name | TEXT | Nama pemohon |
| role_title | TEXT | Jabatan pemohon |
| department | TEXT | Divisi |
| email | TEXT | Email pemohon |
| phone | TEXT | Nomor telepon |
| product | TEXT | Produk/project |
| title | TEXT | Judul request |
| design_type | TEXT | Tipe desain |
| description | TEXT | Deskripsi lengkap |
| guideline_link | TEXT | URL brand guideline |
| priority | ENUM | Low / Medium / High |
| workload | ENUM | light / medium / heavy |
| status | ENUM | pending → backlog → assigned → ... → done |
| deadline | DATE | Batas waktu |
| reject_reason | TEXT | Alasan jika ditolak |
| attachments | TEXT[] | Array nama/URL file |
| source | TEXT | public_form / internal |
| created_by | UUID FK | profiles.id |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `tasks`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| task_id | TEXT UNIQUE | Format TSK-ddmmyy-NNNN-A |
| request_id | UUID FK | requests.id |
| designer_id | UUID FK | profiles.id |
| assigned_by | UUID FK | profiles.id |
| status | ENUM | assigned → on_progress → on_review → done |
| points_awarded | INTEGER | Auto-calc saat done |
| revision_count | INTEGER | Jumlah revisi |
| files | TEXT[] | File terlampir |
| accepted_at | TIMESTAMPTZ | Saat designer accept |
| completed_at | TIMESTAMPTZ | Saat task done |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `work_sessions`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| task_id | UUID FK | tasks.id |
| user_id | UUID FK | profiles.id |
| started_at | TIMESTAMPTZ | Timer mulai |
| ended_at | TIMESTAMPTZ | Timer berhenti (NULL = sedang berjalan) |
| duration_sec | INTEGER GENERATED | Auto-hitung dari ended_at - started_at |
| note | TEXT | Catatan sesi opsional |
| created_at | TIMESTAMPTZ | |

> **Unique constraint:** Satu user hanya boleh punya 1 sesi aktif (ended_at IS NULL) sekaligus.

### `comments`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| task_id | UUID FK | tasks.id |
| author_id | UUID FK | profiles.id |
| content | TEXT | Isi komentar |
| type | ENUM | note / revision / file / system |
| files | TEXT[] | File terlampir di komentar |
| created_at | TIMESTAMPTZ | |

### `activity_log`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| request_id | UUID FK | requests.id |
| task_id | UUID FK | tasks.id |
| actor_id | UUID FK | profiles.id |
| action | ENUM | approved / rejected / assigned / status_change / revision / file / comment |
| detail | TEXT | Deskripsi detail aksi |
| created_at | TIMESTAMPTZ | Immutable — tidak ada updated_at |

### `notifications`
| Kolom | Type | Keterangan |
|-------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK | profiles.id |
| title | TEXT | Judul notifikasi |
| body | TEXT | Isi notifikasi |
| type | ENUM | task / deadline / revision / comment / success / status / info |
| is_read | BOOLEAN | Default FALSE |
| created_at | TIMESTAMPTZ | |

---

## 6. Hooks Reference

```js
import {
  useAuth,           // Login, logout, profile
  useTimer,          // Work session timer
  useNotifications,  // Realtime notifications
  useTasks,          // Realtime task list + CRUD
  useRequests,       // Realtime request list + CRUD
  useProfiles,       // User list + update
  db,                // Direct DB access layer
  storage,           // File upload/download
  logActivity,       // Activity log helper
  pushNotification,  // Notification helper
} from './supabase';
```

### `useAuth()`
```js
const { session, profile, loading, error, signIn, signOut, signUp, refreshProfile } = useAuth();

// Login
await signIn('email@co.com', 'password');

// Logout
await signOut();

// Register (buat user baru)
await signUp('email@co.com', 'password', { name: 'Sam', role: 'designer' });
```

### `useTimer(taskId, userId)`
```js
const { running, elapsedFmt, totalFmt, start, stop, toggle, loading } = useTimer(taskId, userId);

await timer.start('Mulai ngerjain banner');   // bisa isi note
await timer.stop();
await timer.toggle();                          // start jika off, stop jika on
```

### `useNotifications(userId)`
```js
const { notifs, unread, markRead, markAllRead, push } = useNotifications(userId);

// Kirim notif ke user lain
await push(targetUserId, '📋 Task baru', 'Kamu dapat assignment baru', 'task');
```

### `db.tasks`
```js
// List semua task (dengan joined data)
const { data } = await db.tasks.list();

// List task milik designer tertentu
const { data } = await db.tasks.listForDesigner(designerId);

// Update status (otomatis set accepted_at / completed_at)
await db.tasks.updateStatus(taskId, 'on_progress');

// Buat task baru
await db.tasks.create({
  task_id: 'TSK-230426-0001-A',
  request_id: '...',
  designer_id: '...',
  assigned_by: '...',
  status: 'assigned',
});
```

### `db.sessions` (Work Timer)
```js
// Mulai sesi
const { data: session } = await db.sessions.start(taskId, userId, 'note opsional');

// Stop sesi (set ended_at = now)
await db.sessions.stop(session.id);

// Cek apakah ada sesi aktif
const { data: open } = await db.sessions.activeSession(userId);

// Total waktu per task
const totalSec = await db.sessions.totalForTask(taskId);
```

### `storage`
```js
// Upload file
const { url, path } = await storage.upload(taskId, file);

// Get public URL
const url = storage.getUrl(path);

// List file di task
const { data } = await storage.list(taskId);

// Hapus file
await storage.delete(path);
```

---

## 7. Row Level Security (RLS) Summary

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Semua auth user | Auth user (own) | Own / Lead | — |
| requests | Semua auth user | Siapa saja (public form) | Lead | — |
| tasks | Semua auth user | Lead | Designer (own) / Lead | — |
| work_sessions | Own / Lead / TL | Own | Own | — |
| comments | Semua auth user | Auth user | — | — |
| activity_log | Semua auth user | Auth user | — | — |
| notifications | Own | Auth user | Own | — |

---

## 8. Database Triggers (Otomatis)

| Trigger | Event | Fungsi |
|---------|-------|--------|
| `on_auth_user_created` | User signup | Auto-buat row di `profiles` |
| `trg_award_points` | Task → done | Hitung & tambah poin ke designer |
| `trg_notify_assign` | Task INSERT/UPDATE designer | Kirim notifikasi ke designer |
| `trg_restore_backlog` | Task → canceled | Kembalikan request ke backlog jika semua task canceled |
| `trg_*_updated_at` | Any UPDATE | Auto-set `updated_at = NOW()` |

---

## 9. Realtime Subscriptions

Semua hooks (`useTasks`, `useRequests`, `useNotifications`) sudah subscribe ke Supabase Realtime secara otomatis. Perubahan dari user lain akan langsung muncul tanpa refresh.

Untuk mengaktifkan Realtime di Supabase:
1. **Database** → **Replication**
2. Enable publication untuk tabel: `requests`, `tasks`, `notifications`, `comments`

---

## 10. Checklist Deployment

- [ ] `.env` file ada dan berisi URL + ANON_KEY yang benar
- [ ] `supabase_schema.sql` sudah dijalankan
- [ ] Bucket `task-files` sudah dibuat dengan policy public read
- [ ] Realtime enabled untuk tabel yang diperlukan
- [ ] User accounts sudah dibuat via Auth dashboard
- [ ] Role masing-masing user sudah di-set di tabel `profiles`
- [ ] `.env` tidak masuk ke Git (ada di `.gitignore`)

```bash
# .gitignore
.env
.env.local
.env.*.local
```
