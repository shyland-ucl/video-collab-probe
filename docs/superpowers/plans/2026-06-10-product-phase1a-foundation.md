# Phase 1a — Foundation (New Repo, Auth, Projects, Invites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new product repo with Supabase auth, a projects database with row-level security, and the creator→helper invite flow — so two people can sign up, share a project, and both see it.

**Architecture:** npm-workspaces monorepo (`web/` SPA + `server/` Express service) in a NEW repo `video-collab-app`, sibling to the probe repo. Supabase provides auth (magic link), Postgres (projects/members/invites with RLS), and RPC (`redeem_invite`). The Express service in 1a is a skeleton with JWT-validation middleware only — FFmpeg/Gemini arrive in Plan 1b. Realtime, video, and UI port arrive in 1b/1c.

**Tech Stack:** Vite + React 19 (JavaScript) + Tailwind v4 + react-router 7 + @supabase/supabase-js v2; Express 5; Vitest (+ @testing-library/react, supertest); Supabase CLI (via npm) for migrations.

**Spec:** `docs/superpowers/specs/2026-06-10-product-phase1-backend-design.md` (in the probe repo)

**Paths:** The new repo lives at `C:\Users\shyla\OneDrive\Документы\GitHub\video-collab-app`. All relative paths below are relative to that root unless marked "probe repo".

---

## File Structure

```
video-collab-app/
  package.json                  # workspaces root
  .gitignore
  README.md
  supabase/
    config.toml                 # from `npx supabase init`
    migrations/
      0001_projects_members_invites.sql
      0002_redeem_invite.sql
  web/
    package.json
    vite.config.js
    vitest.config.js? (config inside vite.config.js)
    .env.local                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored)
    .env.example
    index.html
    src/
      main.jsx
      App.jsx                   # router + providers + #sr-announcer
      lib/supabaseClient.js
      lib/inviteUrl.js          # buildInviteUrl() — pure, tested
      contexts/AuthContext.jsx
      components/RequireAuth.jsx
      pages/SignInPage.jsx
      pages/ProjectsPage.jsx
      pages/ProjectPage.jsx
      pages/JoinPage.jsx
      utils/announcer.js        # copied from probe repo
      test/setup.js
      lib/inviteUrl.test.js
      components/RequireAuth.test.jsx
  server/
    package.json
    .env                        # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT (gitignored)
    .env.example
    src/
      index.js                  # listen()
      app.js                    # express app (exported for tests)
      middleware/requireAuth.js
      middleware/requireAuth.test.js
      app.test.js
```

---

### Task 1: Create the new repo and monorepo skeleton

**Files:**
- Create: `package.json`, `.gitignore`, `README.md` (new repo root)

- [ ] **Step 1: Create directory and git init**

```powershell
New-Item -ItemType Directory "C:\Users\shyla\OneDrive\Документы\GitHub\video-collab-app"
Set-Location "C:\Users\shyla\OneDrive\Документы\GitHub\video-collab-app"
git init -b main
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "video-collab-app",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["web", "server"],
  "scripts": {
    "dev:web": "npm run dev -w web",
    "dev:server": "npm run dev -w server",
    "test": "npm run test -w web -- --run && npm run test -w server -- --run",
    "build": "npm run build -w web"
  },
  "devDependencies": {
    "supabase": "^2.0.0"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.env.*.local
supabase/.temp/
```

- [ ] **Step 4: Write `README.md`**

```markdown
# video-collab-app

Collaborative video editing for blind/low-vision creators and their sighted helpers.

Productized from the `video-collab-probe` research platform (kept frozen as the study artifact).
Design spec: see `video-collab-probe/docs/superpowers/specs/2026-06-10-product-phase1-backend-design.md`.

## Structure
- `web/` — Vite + React SPA (talks to Supabase directly; mobile-first)
- `server/` — Express service for FFmpeg + Gemini work (secrets live here, never in the browser)
- `supabase/` — database migrations

## Dev
1. `npm install`
2. Copy `web/.env.example` → `web/.env.local` and `server/.env.example` → `server/.env`, fill in values
3. `npm run dev:web` and `npm run dev:server`
```

- [ ] **Step 5: Install and commit**

```powershell
npm install
git add -A; git commit -m "chore: monorepo skeleton (web + server workspaces)"
```

---

### Task 2: Scaffold `web/` (Vite + React + Tailwind + Vitest)

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/src/main.jsx`, `web/src/App.jsx`, `web/src/index.css`, `web/src/test/setup.js`

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.13.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@vitejs/plugin-react": "^5.1.0",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.2.0",
    "vite": "^7.3.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Write `web/vite.config.js`** (Vitest config lives here too)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
```

- [ ] **Step 3: Write `web/src/test/setup.js`**

```js
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Write `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Video Collab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `web/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Write `web/src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 7: Write placeholder `web/src/App.jsx`** (routes filled in by later tasks)

```jsx
export default function App() {
  return <main className="p-4">video-collab-app</main>
}
```

- [ ] **Step 8: Install, verify dev server boots, commit**

```powershell
npm install
npm run dev -w web
```
Expected: Vite serves on http://localhost:5173 showing "video-collab-app". Stop it, then:

```powershell
git add -A; git commit -m "feat(web): scaffold Vite + React 19 + Tailwind 4 + Vitest"
```

---

### Task 3: Scaffold `server/` with tested JWT auth middleware

The middleware validates a Supabase access token from `Authorization: Bearer <jwt>` by calling `client.auth.getUser(token)`. It takes the client as a parameter so tests inject a fake.

**Files:**
- Create: `server/package.json`, `server/src/app.js`, `server/src/index.js`, `server/src/middleware/requireAuth.js`
- Test: `server/src/middleware/requireAuth.test.js`, `server/src/app.test.js`
- Create: `server/.env.example`

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file=.env src/index.js",
    "start": "node --env-file=.env src/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "cors": "^2.8.5",
    "express": "^5.2.0"
  },
  "devDependencies": {
    "supertest": "^7.1.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Write `server/.env.example`**

```
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
PORT=3001
WEB_ORIGIN=http://localhost:5173
```

- [ ] **Step 3: Write the failing middleware test** — `server/src/middleware/requireAuth.test.js`

```js
import { describe, it, expect, vi } from 'vitest'
import { makeRequireAuth } from './requireAuth.js'

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

describe('makeRequireAuth', () => {
  it('rejects requests with no Authorization header', async () => {
    const requireAuth = makeRequireAuth({ auth: { getUser: vi.fn() } })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: {} }, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects requests whose token Supabase does not recognise', async () => {
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad' } }) } }
    const requireAuth = makeRequireAuth(client)
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: { authorization: 'Bearer nope' } }, res, next)
    expect(client.auth.getUser).toHaveBeenCalledWith('nope')
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches req.user and calls next on a valid token', async () => {
    const user = { id: 'user-1', email: 'a@b.c' }
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
    const requireAuth = makeRequireAuth(client)
    const req = { headers: { authorization: 'Bearer good' } }
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(req.user).toEqual(user)
    expect(next).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```powershell
npm install
npm run test -w server -- --run
```
Expected: FAIL — `Cannot find module './requireAuth.js'`

- [ ] **Step 5: Write `server/src/middleware/requireAuth.js`**

```js
export function makeRequireAuth(supabaseClient) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'missing_token' })
    }
    const { data, error } = await supabaseClient.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: 'invalid_token' })
    }
    req.user = data.user
    next()
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```powershell
npm run test -w server -- --run
```
Expected: 3 tests PASS

- [ ] **Step 7: Write the failing app test** — `server/src/app.test.js`

```js
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { makeApp } from './app.js'

const user = { id: 'user-1', email: 'a@b.c' }
const fakeSupabase = {
  auth: {
    getUser: vi.fn(async (token) =>
      token === 'good'
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'bad' } }
    ),
  },
}

describe('app', () => {
  it('GET /health is public', async () => {
    const res = await request(makeApp(fakeSupabase)).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /api/me requires auth', async () => {
    const res = await request(makeApp(fakeSupabase)).get('/api/me')
    expect(res.status).toBe(401)
  })

  it('GET /api/me returns the user with a valid token', async () => {
    const res = await request(makeApp(fakeSupabase))
      .get('/api/me')
      .set('Authorization', 'Bearer good')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'user-1', email: 'a@b.c' })
  })
})
```

- [ ] **Step 8: Run to verify it fails**

```powershell
npm run test -w server -- --run
```
Expected: FAIL — `Cannot find module './app.js'`

- [ ] **Step 9: Write `server/src/app.js`**

```js
import express from 'express'
import cors from 'cors'
import { makeRequireAuth } from './middleware/requireAuth.js'

export function makeApp(supabaseClient) {
  const app = express()
  app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true }))
  app.use(express.json())

  app.get('/health', (_req, res) => res.json({ ok: true }))

  const requireAuth = makeRequireAuth(supabaseClient)
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ id: req.user.id, email: req.user.email })
  })

  return app
}
```

- [ ] **Step 10: Write `server/src/index.js`**

```js
import { createClient } from '@supabase/supabase-js'
import { makeApp } from './app.js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const port = process.env.PORT || 3001
makeApp(supabaseAdmin).listen(port, () => {
  console.log(`server listening on :${port}`)
})
```

- [ ] **Step 11: Run all server tests, commit**

```powershell
npm run test -w server -- --run
```
Expected: 6 tests PASS

```powershell
git add -A; git commit -m "feat(server): Express skeleton with tested Supabase JWT middleware"
```

---

### Task 4: Create the Supabase project (HUMAN STEP) and wire env files

**Files:**
- Create: `supabase/config.toml` (generated), `web/.env.example`, `web/.env.local`, `server/.env`

- [ ] **Step 1: HUMAN STEP — create the Supabase project.** Ask the user (Lan) to:
  1. Go to https://supabase.com/dashboard → New project (org: personal; name: `video-collab-app`; region: London/`eu-west-2`; generate a DB password and save it).
  2. From **Project Settings → Data API**, copy the **Project URL** and **anon (public) key**.
  3. From **Project Settings → API Keys**, copy the **service_role key** (secret).
  4. From **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` (production URL added in Task 10).
  5. Note the **project ref** (the subdomain of the project URL).

Do not proceed until these values are provided.

- [ ] **Step 2: Initialise Supabase CLI in the repo**

```powershell
npx supabase init
```
Expected: creates `supabase/config.toml`. (Answer "n" to IDE settings prompts if asked.)

- [ ] **Step 3: Link to the hosted project** (will prompt for login + DB password)

```powershell
npx supabase login
npx supabase link --project-ref <PROJECT-REF>
```

- [ ] **Step 4: Write `web/.env.example`**

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
VITE_SERVER_URL=http://localhost:3001
```

- [ ] **Step 5: Write `web/.env.local` and `server/.env` with the real values** (both gitignored — verify with `git status` that neither appears).

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "chore: supabase CLI init + env examples"
```

---

### Task 5: Migration 1 — projects, members, invites, RLS

The `is_project_member()` helper is `security definer` to avoid the classic RLS infinite-recursion problem on `project_members`. Membership rows are written only by a trigger (owner) and `redeem_invite` (Task 6) — there is deliberately no direct INSERT policy on `project_members`.

**Files:**
- Create: `supabase/migrations/0001_projects_members_invites.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Projects, membership, invites + RLS
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'helper')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  role text not null default 'helper' check (role in ('creator', 'helper')),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users (id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- security definer so policies on project_members can call it without recursing
create function public.is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invites enable row level security;

create policy "members or owner read projects" on public.projects
  for select using (owner_id = auth.uid() or public.is_project_member(id));
create policy "owner inserts own project" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "owner updates project" on public.projects
  for update using (owner_id = auth.uid());
create policy "owner deletes project" on public.projects
  for delete using (owner_id = auth.uid());

create policy "members read membership" on public.project_members
  for select using (public.is_project_member(project_id));

create policy "owner manages invites" on public.invites
  for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- owner automatically becomes a creator-member
create function public.handle_new_project()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'creator');
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();
```

- [ ] **Step 2: Apply to the hosted database**

```powershell
npx supabase db push
```
Expected: `Applying migration 0001_projects_members_invites.sql... Finished supabase db push.`

- [ ] **Step 3: Verify in dashboard** — Table Editor shows `projects`, `project_members`, `invites`, each with the RLS badge enabled.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations; git commit -m "feat(db): projects/members/invites schema with RLS"
```

---

### Task 6: Migration 2 — `redeem_invite` RPC

`security definer` because the redeeming helper is not yet a member, so RLS would otherwise hide the invite row from them. Single-use, but idempotent for the same user (re-clicking the link after joining is not an error).

**Files:**
- Create: `supabase/migrations/0002_redeem_invite.sql`

- [ ] **Step 1: Write the migration**

```sql
create function public.redeem_invite(invite_token uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  inv invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from invites where token = invite_token for update;
  if not found then
    raise exception 'invalid_invite';
  end if;
  if inv.expires_at < now() then
    raise exception 'expired_invite';
  end if;
  if inv.used_by is not null and inv.used_by <> auth.uid() then
    raise exception 'used_invite';
  end if;

  insert into project_members (project_id, user_id, role)
  values (inv.project_id, auth.uid(), inv.role)
  on conflict (project_id, user_id) do nothing;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;

  return inv.project_id;
end;
$$;

revoke execute on function public.redeem_invite(uuid) from anon, public;
grant execute on function public.redeem_invite(uuid) to authenticated;
```

- [ ] **Step 2: Apply and verify**

```powershell
npx supabase db push
```
Expected: migration applies cleanly. In dashboard SQL editor, `select proname from pg_proc where proname = 'redeem_invite';` returns one row.

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations; git commit -m "feat(db): redeem_invite RPC (security definer, single-use, idempotent per user)"
```

---

### Task 7: Web auth — Supabase client, AuthContext, sign-in page, route guard

Magic-link only (`signInWithOtp`). supabase-js's default `detectSessionInUrl` handles the redirect callback — no dedicated callback route needed. The screen-reader announcer is ported from the probe repo in this task because the sign-in flow must announce its status.

**Files:**
- Create: `web/src/lib/supabaseClient.js`, `web/src/contexts/AuthContext.jsx`, `web/src/components/RequireAuth.jsx`, `web/src/pages/SignInPage.jsx`
- Copy: probe repo `src/utils/announcer.js` → `web/src/utils/announcer.js`
- Modify: `web/src/App.jsx`
- Test: `web/src/components/RequireAuth.test.jsx`

- [ ] **Step 1: Copy the announcer from the probe repo**

```powershell
New-Item -ItemType Directory "web\src\utils" -Force
Copy-Item "..\video-collab-probe\src\utils\announcer.js" "web\src\utils\announcer.js"
```
Read the copied file; if it references anything probe-specific (e.g. EventLogger), strip those references so it only writes to `#sr-announcer`.

- [ ] **Step 2: Write `web/src/lib/supabaseClient.js`**

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

- [ ] **Step 3: Write `web/src/contexts/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still loading, null = signed out, object = session
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 4: Write the failing RequireAuth test** — `web/src/components/RequireAuth.test.jsx`

The guard must (a) render nothing while the session is loading, (b) redirect to `/signin` preserving the intended destination, (c) render children when signed in.

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let mockSession
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, user: mockSession?.user ?? null }),
}))

import RequireAuth from './RequireAuth'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signin" element={<div>sign in page</div>} />
        <Route path="/secret" element={<RequireAuth><div>secret content</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  it('renders nothing while session is loading', () => {
    mockSession = undefined
    renderAt('/secret')
    expect(screen.queryByText('secret content')).not.toBeInTheDocument()
    expect(screen.queryByText('sign in page')).not.toBeInTheDocument()
  })

  it('redirects to /signin when signed out', () => {
    mockSession = null
    renderAt('/secret')
    expect(screen.getByText('sign in page')).toBeInTheDocument()
  })

  it('renders children when signed in', () => {
    mockSession = { user: { id: 'u1' } }
    renderAt('/secret')
    expect(screen.getByText('secret content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run to verify it fails**

```powershell
npm run test -w web -- --run
```
Expected: FAIL — cannot resolve `./RequireAuth`

- [ ] **Step 6: Write `web/src/components/RequireAuth.jsx`**

```jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireAuth({ children }) {
  const { session } = useAuth()
  const location = useLocation()

  if (session === undefined) return null
  if (session === null) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signin?next=${next}`} replace />
  }
  return children
}
```

- [ ] **Step 7: Run to verify it passes**

```powershell
npm run test -w web -- --run
```
Expected: 3 tests PASS

- [ ] **Step 8: Write `web/src/pages/SignInPage.jsx`**

```jsx
import { useState } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { announce } from '../utils/announcer'

export default function SignInPage() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const next = params.get('next') || '/'

  if (session) return <Navigate to={next} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    announce('Sending sign-in link')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    })
    if (error) {
      setStatus('error')
      announce(`Sign-in failed: ${error.message}`)
    } else {
      setStatus('sent')
      announce('Check your email for the sign-in link')
    }
  }

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
      {status === 'sent' ? (
        <p role="status" className="text-lg">
          Check your email — we sent a sign-in link to {email}. Open it on this device.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label htmlFor="email" className="mb-2 block text-lg">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 block w-full rounded border border-gray-400 p-3 text-lg"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="min-h-12 w-full rounded bg-blue-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {status === 'error' && (
            <p role="alert" className="mt-3 text-red-700">
              Something went wrong sending the link. Check the address and try again.
            </p>
          )}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 9: Wire `web/src/App.jsx`** (placeholder pages for routes built in Tasks 8–9)

```jsx
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import RequireAuth from './components/RequireAuth'
import SignInPage from './pages/SignInPage'

function Placeholder({ name }) {
  return <main className="p-4">{name}</main>
}

export default function App() {
  return (
    <AuthProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/" element={<RequireAuth><Placeholder name="projects" /></RequireAuth>} />
        <Route path="/projects/:id" element={<RequireAuth><Placeholder name="project" /></RequireAuth>} />
        <Route path="/join/:token" element={<Placeholder name="join" />} />
      </Routes>
      <div id="sr-announcer" aria-live="polite" className="sr-only" />
    </AuthProvider>
  )
}
```

- [ ] **Step 10: Manual verification** — run `npm run dev -w web`, open http://localhost:5173, confirm: redirect to `/signin`, submit your own email, receive the magic-link email, click it, land back on `/` showing "projects".

- [ ] **Step 11: Commit**

```powershell
git add -A; git commit -m "feat(web): magic-link auth, AuthContext, RequireAuth guard, sr-announcer"
```

---

### Task 8: Projects list + create

**Files:**
- Create: `web/src/pages/ProjectsPage.jsx`
- Modify: `web/src/App.jsx` (swap placeholder)

- [ ] **Step 1: Write `web/src/pages/ProjectsPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { announce } from '../utils/announcer'

export default function ProjectsPage() {
  const { user, signOut } = useAuth()
  const [projects, setProjects] = useState(null) // null = loading
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, status, created_at, owner_id')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setProjects(data)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase
      .from('projects')
      .insert({ title, owner_id: user.id })
      .select()
      .single()
    setCreating(false)
    if (error) {
      setError(error.message)
      announce('Could not create project')
      return
    }
    setTitle('')
    announce(`Project ${data.title} created`)
    loadProjects()
  }

  return (
    <main id="main" className="mx-auto max-w-lg p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your projects</h1>
        <button onClick={signOut} className="min-h-12 rounded border border-gray-400 px-3">
          Sign out
        </button>
      </div>

      <form onSubmit={handleCreate} className="mb-6">
        <label htmlFor="title" className="mb-2 block text-lg">
          New project name
        </label>
        <div className="flex gap-2">
          <input
            id="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full rounded border border-gray-400 p-3 text-lg"
          />
          <button
            type="submit"
            disabled={creating}
            className="min-h-12 shrink-0 rounded bg-blue-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      {projects === null ? (
        <p role="status">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p>No projects yet. Create one above to get started.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block min-h-12 rounded border border-gray-300 p-3 text-lg"
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Swap into `web/src/App.jsx`** — replace the `/` placeholder:

```jsx
import ProjectsPage from './pages/ProjectsPage'
// ...
<Route path="/" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
```

- [ ] **Step 3: Manual verification** — signed in, create a project, see it in the list, refresh, still there. In the Supabase dashboard, confirm a `project_members` row with role `creator` was created by the trigger.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat(web): projects list and create"
```

---

### Task 9: Project page with invite creation, plus join page

**Files:**
- Create: `web/src/lib/inviteUrl.js`, `web/src/pages/ProjectPage.jsx`, `web/src/pages/JoinPage.jsx`
- Modify: `web/src/App.jsx`
- Test: `web/src/lib/inviteUrl.test.js`

- [ ] **Step 1: Write the failing inviteUrl test** — `web/src/lib/inviteUrl.test.js`

```js
import { describe, it, expect } from 'vitest'
import { buildInviteUrl } from './inviteUrl'

describe('buildInviteUrl', () => {
  it('builds an absolute /join URL from origin and token', () => {
    expect(buildInviteUrl('https://app.example.com', 'abc-123')).toBe(
      'https://app.example.com/join/abc-123'
    )
  })

  it('tolerates a trailing slash on the origin', () => {
    expect(buildInviteUrl('https://app.example.com/', 'abc-123')).toBe(
      'https://app.example.com/join/abc-123'
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npm run test -w web -- --run
```
Expected: FAIL — cannot resolve `./inviteUrl`

- [ ] **Step 3: Write `web/src/lib/inviteUrl.js`**

```js
export function buildInviteUrl(origin, token) {
  return `${origin.replace(/\/+$/, '')}/join/${token}`
}
```

- [ ] **Step 4: Run to verify it passes**

```powershell
npm run test -w web -- --run
```
Expected: PASS

- [ ] **Step 5: Write `web/src/pages/ProjectPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { buildInviteUrl } from '../lib/inviteUrl'
import { announce } from '../utils/announcer'

export default function ProjectPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [inviteLink, setInviteLink] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .select('id, title, owner_id')
        .eq('id', id)
        .single()
      if (projErr) {
        setError('Project not found, or you are not a member of it.')
        return
      }
      setProject(proj)
      const { data: mems } = await supabase
        .from('project_members')
        .select('user_id, role, created_at')
        .eq('project_id', id)
      setMembers(mems ?? [])
    }
    load()
  }, [id])

  async function handleInvite() {
    const { data, error } = await supabase
      .from('invites')
      .insert({ project_id: id, created_by: project.owner_id })
      .select('token')
      .single()
    if (error) {
      announce('Could not create invite')
      setError(error.message)
      return
    }
    const url = buildInviteUrl(window.location.origin, data.token)
    setInviteLink(url)
    announce('Invite link created')
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my video project', url })
      } catch {
        /* user cancelled the share sheet — link stays visible below */
      }
    } else {
      await navigator.clipboard.writeText(url)
      announce('Invite link copied to clipboard')
    }
  }

  if (error) {
    return (
      <main id="main" className="mx-auto max-w-lg p-4">
        <p role="alert">{error}</p>
        <Link to="/" className="underline">Back to projects</Link>
      </main>
    )
  }
  if (!project) return <main id="main" className="p-4"><p role="status">Loading…</p></main>

  return (
    <main id="main" className="mx-auto max-w-lg p-4">
      <Link to="/" className="mb-4 inline-block underline">← All projects</Link>
      <h1 className="mb-4 text-2xl font-bold">{project.title}</h1>

      <section aria-labelledby="members-heading" className="mb-6">
        <h2 id="members-heading" className="mb-2 text-xl font-semibold">
          People ({members.length})
        </h2>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.user_id} className="rounded border border-gray-300 p-2">
              {m.role === 'creator' ? 'Creator' : 'Helper'}
            </li>
          ))}
        </ul>
      </section>

      <button
        onClick={handleInvite}
        className="min-h-12 w-full rounded bg-blue-700 px-4 py-3 text-lg font-semibold text-white"
      >
        Invite a helper
      </button>
      {inviteLink && (
        <p className="mt-3 break-all rounded border border-gray-300 p-3" role="status">
          Share this link with your helper: {inviteLink}
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Write `web/src/pages/JoinPage.jsx`**

Signed-out users go to sign-in with `next=/join/<token>`, so the magic link returns them here.

```jsx
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { announce } from '../utils/announcer'

export default function JoinPage() {
  const { token } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const redeeming = useRef(false)

  useEffect(() => {
    if (!session || redeeming.current) return
    redeeming.current = true
    supabase.rpc('redeem_invite', { invite_token: token }).then(({ data, error }) => {
      if (error) {
        const messages = {
          invalid_invite: 'This invite link is not valid.',
          expired_invite: 'This invite link has expired. Ask for a new one.',
          used_invite: 'This invite link was already used by someone else.',
        }
        const key = Object.keys(messages).find((k) => error.message.includes(k))
        setError(messages[key] ?? 'Could not join the project. Please try again.')
        announce('Could not join the project')
      } else {
        announce('Joined project')
        navigate(`/projects/${data}`, { replace: true })
      }
    })
  }, [session, token, navigate])

  if (session === undefined) return null
  if (session === null) {
    return <Navigate to={`/signin?next=${encodeURIComponent(`/join/${token}`)}`} replace />
  }
  return (
    <main id="main" className="mx-auto max-w-lg p-4">
      {error ? (
        <>
          <p role="alert" className="mb-4 text-red-700">{error}</p>
          <Link to="/" className="underline">Go to your projects</Link>
        </>
      ) : (
        <p role="status" className="text-lg">Joining project…</p>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Wire both routes in `web/src/App.jsx`** — final route table:

```jsx
import ProjectPage from './pages/ProjectPage'
import JoinPage from './pages/JoinPage'
// ...
<Route path="/projects/:id" element={<RequireAuth><ProjectPage /></RequireAuth>} />
<Route path="/join/:token" element={<JoinPage />} />
```

- [ ] **Step 8: Run all web tests**

```powershell
npm run test -w web -- --run
```
Expected: 5 tests PASS (3 RequireAuth + 2 inviteUrl)

- [ ] **Step 9: Manual two-account verification** — sign in as yourself, create a project, create an invite link. Open the link in a private/incognito window, sign in with a second email address, confirm you land on the project page and the People list now shows Creator and Helper. Re-open the same link as the helper (should still land on the project, not error). Try the link in a third account (should show "already used").

- [ ] **Step 10: Commit**

```powershell
git add -A; git commit -m "feat(web): project page with invite links + join flow via redeem_invite"
```

---

### Task 10: Deploy (HUMAN STEPS + config)

**Files:**
- Create: `web/vercel.json`

- [ ] **Step 1: Write `web/vercel.json`** (SPA fallback so `/join/<token>` deep links work)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Commit it:

```powershell
git add web/vercel.json; git commit -m "chore: SPA rewrite config for Vercel"
```

- [ ] **Step 2: HUMAN STEP — push the repo to GitHub**

```powershell
gh repo create video-collab-app --private --source . --push
```
(or create it in the GitHub UI and `git remote add origin … ; git push -u origin main`)

- [ ] **Step 3: HUMAN STEP — deploy web to Vercel.** Import the GitHub repo at https://vercel.com/new, set **Root Directory** = `web`, framework auto-detects Vite. Add environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SERVER_URL` (the Railway URL from Step 4 — can be added after). Deploy and note the production URL.

- [ ] **Step 4: HUMAN STEP — deploy server to Railway.** At https://railway.app, new project → Deploy from GitHub repo → set **Root Directory** = `server`, start command `npm start`. Add env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_ORIGIN` (the Vercel URL). Note the public URL; verify `GET <url>/health` returns `{"ok":true}`.

- [ ] **Step 5: HUMAN STEP — Supabase URL config.** In Supabase **Authentication → URL Configuration**, set Site URL to the Vercel production URL and add `http://localhost:5173/**` and `https://<vercel-app>/**` to Redirect URLs.

- [ ] **Step 6: Production smoke test** (the Phase-1a slice of the spec's acceptance criteria) — on your phone: open the Vercel URL, sign up with email, create a project, generate an invite link, open it on a second device/account, confirm both accounts see the project and its member list. Confirm `view-source`/devtools shows no `service_role` key and no Gemini key anywhere.

- [ ] **Step 7: Commit any config tweaks; tag the milestone**

```powershell
git add -A
git commit -m "chore: deployment config" --allow-empty
git tag phase-1a
git push --tags
```

---

## After this plan

- **Plan 1b — Video processing:** storage buckets + TUS resumable uploads, Node service grows FFmpeg segmentation + Gemini descriptions (ported from probe repo `pipeline/services/`), `videos`/`segments`/`descriptions` tables, processing-status UI with announcements, VQA proxy endpoint.
- **Plan 1c — Collaboration & sync:** `project_state` table with versioned writes, Supabase Realtime channel (presence + postgres_changes), port of creator/helper UI components and `usePlaybackEngine`, two-browser Playwright smoke test.

Both will be written after 1a is executed and verified, against the code that actually exists.
