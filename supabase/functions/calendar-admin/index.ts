// =====================================================================
//  calendar-admin - server-side actions for the Organizational Calendar
//
//  Public:
//    register_org     a new company signs up: name, logo, first super admin
//  Super admin of a company (always limited to THEIR company):
//    create_user, update_user, reset_password, set_active, delete_user,
//    last_logins, update_org
//  App owner (platform_admins table):
//    platform_list_orgs, platform_set_plan
//
//  Deploy with "Verify JWT" OFF: sign-up runs before anyone is signed in,
//  and every other action checks the caller's token itself.
//
//  This function uses the service role, which skips row level security,
//  so EVERY lookup of a person below is filtered by the caller's org_id
//  (see targetInOrg). The database's composite keys are a second net.
// =====================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (error: string, status = 400, code?: string) => json({ error, code }, status);

const ROLES = ['super_admin', 'group_admin', 'user'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const initialsOf = (name: string) => {
  const p = String(name).trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
};
const cleanEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();
const cleanText = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function b64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/^data:[^,]+,/, '')), (c) => c.charCodeAt(0));
}

async function uploadLogo(admin: SupabaseClient, orgId: string, logo: { base64?: string; mime?: string } | null | undefined) {
  if (!logo?.base64) return null;
  const mime = String(logo.mime ?? '').toLowerCase();
  const ext = LOGO_TYPES[mime];
  if (!ext) throw new Error('The logo must be a PNG, JPG or WebP image.');
  const bytes = b64ToBytes(String(logo.base64));
  if (bytes.length > 2 * 1024 * 1024) throw new Error('The logo must be smaller than 2 MB.');
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from('branding').upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`The logo could not be uploaded: ${error.message}`);
  return admin.storage.from('branding').getPublicUrl(path).data.publicUrl;
}

async function orgPlan(admin: SupabaseClient, orgId: string) {
  const { data } = await admin
    .from('organizations')
    .select('plan, plan_expires_at, user_limit')
    .eq('id', orgId)
    .single();
  const today = new Date().toISOString().slice(0, 10);
  const pro = data?.plan === 'pro' && (!data.plan_expires_at || data.plan_expires_at >= today);
  const { count } = await admin
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true);
  return { pro, limit: data?.user_limit ?? 10, active: count ?? 0 };
}

const limitReached = (limit: number) =>
  fail(`The free plan includes up to ${limit} people. Upgrade to Pro ($50/year) to add more.`, 402, 'USER_LIMIT');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('POST only', 405);

  const URL_ = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: { action?: string; payload?: Record<string, any> };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid request.');
  }
  const action = body.action;
  const payload = body.payload ?? {};

  try {
    // ======================= public: company sign-up =======================
    if (action === 'register_org') {
      const orgName = cleanText(payload.org_name, 120);
      const fullName = cleanText(payload.full_name, 120);
      const email = cleanEmail(payload.email);
      const password = String(payload.password ?? '');

      if (!orgName) return fail('Enter your organization’s name.');
      if (!fullName) return fail('Enter your full name.');
      if (!EMAIL_RE.test(email)) return fail('Enter a valid email address.');
      if (password.length < 8) return fail('Use a password of at least 8 characters.');

      const { data: org, error: oErr } = await admin.from('organizations').insert({ name: orgName }).select('id').single();
      if (oErr || !org) return fail('Your organization could not be created. Try again.', 500);
      const dropOrg = () => admin.from('organizations').delete().eq('id', org.id);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (cErr || !created?.user) {
        await dropOrg();
        const taken = /already|registered|exists/i.test(cErr?.message ?? '');
        return fail(taken ? 'An account with this email already exists. Sign in instead.' : cErr?.message ?? 'The account could not be created.', taken ? 409 : 400);
      }

      const { error: pErr } = await admin.from('user_profiles').insert({
        id: created.user.id,
        org_id: org.id,
        email,
        full_name: fullName,
        initials: initialsOf(fullName),
        role: 'super_admin',
        group_id: null,
        is_active: true,
        must_change_password: false,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        await dropOrg();
        return fail('Your account could not be set up. Try again.', 500);
      }

      try {
        const logoUrl = await uploadLogo(admin, org.id, payload.logo);
        if (logoUrl) await admin.from('organizations').update({ logo_url: logoUrl }).eq('id', org.id);
      } catch {
        // The company exists; the logo can be added later in Admin.
        return json({ ok: true, logo_failed: true });
      }
      return json({ ok: true });
    }

    // ======================= everything else: signed in =======================
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return fail('Sign in again to continue.', 401);
    const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authErr } = await asCaller.auth.getUser();
    if (authErr || !caller) return fail('Sign in again to continue.', 401);

    // ---------------- app owner actions ----------------
    if (action === 'platform_list_orgs' || action === 'platform_set_plan') {
      const { data: owner } = await admin.from('platform_admins').select('user_id').eq('user_id', caller.id).maybeSingle();
      if (!owner) return fail('Not allowed.', 403);

      if (action === 'platform_list_orgs') {
        const { data: orgs, error } = await admin
          .from('organizations')
          .select('id, name, plan, plan_expires_at, user_limit, created_at')
          .order('created_at', { ascending: false });
        if (error) return fail(error.message);
        const { data: people } = await admin.from('user_profiles').select('org_id, is_active, role, email, full_name');
        const rows = (orgs ?? []).map((o) => {
          const members = (people ?? []).filter((p) => p.org_id === o.id);
          const owners = members.filter((p) => p.role === 'super_admin' && p.is_active);
          return {
            ...o,
            active_users: members.filter((p) => p.is_active).length,
            contact: owners[0] ? { name: owners[0].full_name, email: owners[0].email } : null,
          };
        });
        return json({ ok: true, orgs: rows });
      }

      const orgId = String(payload.org_id ?? '');
      if (!UUID_RE.test(orgId)) return fail('Missing organization.');
      const plan = payload.plan === 'pro' ? 'pro' : 'free';
      const expires = plan === 'pro' ? String(payload.expires ?? '') : null;
      if (plan === 'pro' && !/^\d{4}-\d{2}-\d{2}$/.test(expires ?? '')) return fail('Pick an end date for Pro.');
      const { error } = await admin.from('organizations').update({ plan, plan_expires_at: expires }).eq('id', orgId);
      return error ? fail(error.message) : json({ ok: true });
    }

    // ---------------- company super admin actions ----------------
    const { data: me } = await admin
      .from('user_profiles')
      .select('org_id, role, is_active')
      .eq('id', caller.id)
      .maybeSingle();
    if (!me?.is_active || me.role !== 'super_admin') return fail('Only a super admin can do this.', 403);
    const orgId: string = me.org_id;

    // Every person this function touches must belong to the caller's company.
    const targetInOrg = async (id: unknown) => {
      if (!UUID_RE.test(String(id ?? ''))) return null;
      const { data } = await admin
        .from('user_profiles')
        .select('id, role, group_id, email, is_active')
        .eq('id', String(id))
        .eq('org_id', orgId)
        .maybeSingle();
      return data;
    };
    const teamInOrg = async (id: unknown) => {
      if (!UUID_RE.test(String(id ?? ''))) return null;
      const { data } = await admin.from('groups').select('id').eq('id', String(id)).eq('org_id', orgId).maybeSingle();
      return data;
    };
    const isLastSuper = async (id: string) => {
      const { count } = await admin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .neq('id', id);
      return (count ?? 0) === 0;
    };
    const managerClash = async (groupId: string, exceptId?: string) => {
      let q = admin
        .from('user_profiles')
        .select('full_name')
        .eq('org_id', orgId)
        .eq('role', 'group_admin')
        .eq('group_id', groupId)
        .eq('is_active', true);
      if (exceptId) q = q.neq('id', exceptId);
      const { data } = await q.limit(1).maybeSingle();
      return data?.full_name as string | undefined;
    };

    switch (action) {
      case 'create_user': {
        const fullName = cleanText(payload.full_name, 120);
        const email = cleanEmail(payload.email);
        const password = String(payload.password ?? '');
        const role = String(payload.role ?? 'user');
        if (!fullName || !email || !password) return fail('Name, email and a temporary password are all required.');
        if (!EMAIL_RE.test(email)) return fail('That email is not valid.');
        if (password.length < 6) return fail('The temporary password must be at least 6 characters.');
        if (!ROLES.includes(role)) return fail('Unknown role.');

        let groupId: string | null = null;
        if (role !== 'super_admin') {
          const team = await teamInOrg(payload.group_id);
          if (!team) return fail('Pick a team for this person.');
          groupId = team.id as string;
          if (role === 'group_admin') {
            const clash = await managerClash(team.id as string);
            if (clash) return fail(`${clash} already manages that team.`, 409);
          }
        }

        const plan = await orgPlan(admin, orgId);
        if (!plan.pro && plan.active >= plan.limit) return limitReached(plan.limit);

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (cErr || !created?.user) {
          const taken = /already|registered|exists/i.test(cErr?.message ?? '');
          return fail(taken ? 'Someone already has an account with this email.' : cErr?.message ?? 'The account could not be created.', taken ? 409 : 400);
        }

        const { error: pErr } = await admin.from('user_profiles').insert({
          id: created.user.id,
          org_id: orgId,
          email,
          full_name: fullName,
          initials: initialsOf(fullName),
          title: cleanText(payload.title, 120) || null,
          group_id: groupId,
          role,
          is_active: true,
          must_change_password: true,
          created_by: caller.id,
        });
        if (pErr) {
          await admin.auth.admin.deleteUser(created.user.id);
          if (pErr.message.includes('USER_LIMIT')) return limitReached(plan.limit);
          return fail(pErr.message);
        }
        return json({ ok: true, id: created.user.id });
      }

      case 'update_user': {
        const target = await targetInOrg(payload.id);
        if (!target) return fail('Person not found.', 404);

        const patch: Record<string, unknown> = {};
        const nextRole = payload.role !== undefined ? String(payload.role) : target.role;
        if (!ROLES.includes(nextRole)) return fail('Unknown role.');
        if (target.role === 'super_admin' && nextRole !== 'super_admin' && (await isLastSuper(target.id)))
          return fail('This is the only super admin left. Make someone else a super admin first.', 409);

        let nextGroup: string | null = target.group_id;
        if (payload.group_id !== undefined) {
          const team = payload.group_id ? await teamInOrg(payload.group_id) : null;
          if (payload.group_id && !team) return fail('That team no longer exists.');
          nextGroup = team?.id ?? null;
        }
        if (nextRole === 'super_admin') nextGroup = null;
        else if (!nextGroup) return fail('Pick a team for this person.');
        if (nextRole === 'group_admin' && nextGroup) {
          const clash = await managerClash(nextGroup, target.id);
          if (clash) return fail(`${clash} already manages that team.`, 409);
        }
        patch.role = nextRole;
        patch.group_id = nextGroup;

        if (payload.full_name !== undefined) {
          const name = cleanText(payload.full_name, 120);
          if (!name) return fail('Name cannot be empty.');
          patch.full_name = name;
          patch.initials = initialsOf(name);
        }
        if (payload.title !== undefined) patch.title = cleanText(payload.title, 120) || null;

        if (payload.email !== undefined) {
          const email = cleanEmail(payload.email);
          if (!EMAIL_RE.test(email)) return fail('That email is not valid.');
          if (email !== String(target.email ?? '').toLowerCase()) {
            const { error } = await admin.auth.admin.updateUserById(target.id, { email, email_confirm: true });
            if (error) return fail(/already|exists/i.test(error.message) ? 'Someone already has an account with this email.' : error.message);
            patch.email = email;
          }
        }

        const { error } = await admin.from('user_profiles').update(patch).eq('id', target.id).eq('org_id', orgId);
        return error ? fail(error.message) : json({ ok: true });
      }

      case 'reset_password': {
        const target = await targetInOrg(payload.id);
        if (!target) return fail('Person not found.', 404);
        const password = String(payload.password ?? '');
        if (password.length < 6) return fail('The temporary password must be at least 6 characters.');
        const { error } = await admin.auth.admin.updateUserById(target.id, { password });
        if (error) return fail(error.message);
        await admin.from('user_profiles').update({ must_change_password: true }).eq('id', target.id).eq('org_id', orgId);
        return json({ ok: true });
      }

      case 'set_active': {
        const target = await targetInOrg(payload.id);
        if (!target) return fail('Person not found.', 404);
        const active = !!payload.is_active;
        if (target.id === caller.id) return fail('You cannot deactivate your own account.', 409);
        if (!active && target.role === 'super_admin' && (await isLastSuper(target.id)))
          return fail('This is the only super admin left.', 409);
        if (active && !target.is_active) {
          const plan = await orgPlan(admin, orgId);
          if (!plan.pro && plan.active >= plan.limit) return limitReached(plan.limit);
        }
        const { error: uErr } = await admin.from('user_profiles').update({ is_active: active }).eq('id', target.id).eq('org_id', orgId);
        if (uErr) return uErr.message.includes('USER_LIMIT') ? limitReached((await orgPlan(admin, orgId)).limit) : fail(uErr.message);
        const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: active ? 'none' : '876000h' });
        return error ? fail(error.message) : json({ ok: true });
      }

      case 'delete_user': {
        const target = await targetInOrg(payload.id);
        if (!target) return fail('Person not found.', 404);
        if (target.id === caller.id) return fail('You cannot delete your own account.', 409);
        if (target.role === 'super_admin' && (await isLastSuper(target.id))) return fail('This is the only super admin left.', 409);
        const { error } = await admin.auth.admin.deleteUser(target.id);
        return error ? fail(error.message) : json({ ok: true });
      }

      case 'last_logins': {
        const { data: members } = await admin.from('user_profiles').select('id').eq('org_id', orgId);
        const out: Record<string, string | null> = {};
        for (const m of members ?? []) {
          const { data } = await admin.auth.admin.getUserById(m.id);
          out[m.id] = data?.user?.last_sign_in_at ?? null;
        }
        return json({ ok: true, logins: out });
      }

      case 'update_org': {
        const patch: Record<string, unknown> = {};
        if (payload.name !== undefined) {
          const name = cleanText(payload.name, 120);
          if (!name) return fail('The organization name cannot be empty.');
          patch.name = name;
        }
        if (payload.remove_logo) patch.logo_url = null;
        if (payload.logo) {
          try {
            patch.logo_url = await uploadLogo(admin, orgId, payload.logo);
          } catch (e) {
            return fail((e as Error).message);
          }
        }
        if (!Object.keys(patch).length) return json({ ok: true });
        const { error } = await admin.from('organizations').update(patch).eq('id', orgId);
        return error ? fail(error.message) : json({ ok: true });
      }

      default:
        return fail('Unknown action.');
    }
  } catch (e) {
    console.error(e);
    return fail('Something went wrong on the server. Try again.', 500);
  }
});
