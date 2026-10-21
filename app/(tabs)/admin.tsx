import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { UpgradeCard } from '@/components/UpgradeCard';
import { eventPalette } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import {
  initialsFor,
  isSuperAdmin,
  roleLabel,
  useCalendar,
  type CalendarGroup,
  type CalendarPerson,
  type Role,
} from '@/lib/calendar-context';
import { pickLogo } from '@/lib/logo-picker';
import { AdminError, callAdmin, supabase } from '@/lib/supabase';
import { FREE_USER_LIMIT, proYearlyTotal } from '@/lib/supabase-config';
import { dateLocale, forwardIcon, t, tn } from '@/lib/i18n';

type Colors = ReturnType<typeof useColors>;

const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, org } = useCalendar();
  const superAdmin = isSuperAdmin(profile);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: (insets.top > 0 ? insets.top : 40) + 12, paddingBottom: 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text numberOfLines={1} style={[styles.kicker, { color: colors.primary }]}>
            {(org?.name ?? '').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('Admin')}</Text>
        </View>
        {superAdmin ? (
          <>
            <OrganizationSection colors={colors} />
            <PlanSection colors={colors} />
            <TeamsSection colors={colors} />
            <PeopleSection colors={colors} />
          </>
        ) : null}
        {org?.is_platform_admin ? <OwnerConsole colors={colors} /> : null}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------- shared bits

function SectionHeader({ title, meta, action, colors }: { title: string; meta?: string; action?: React.ReactNode; colors: Colors }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {meta ? <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>{meta}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function SmallButton({ label, icon, onPress, colors, testID, tone = 'primary', disabled }: {
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  colors: Colors;
  testID?: string;
  tone?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
}) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.destructive : colors.accent;
  const fg = tone === 'primary' ? colors.primaryForeground : tone === 'danger' ? colors.destructiveForeground : colors.primary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.smallButton, { backgroundColor: bg, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
    >
      {icon ? <Feather name={icon} size={14} color={fg} /> : null}
      <Text style={[styles.smallButtonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Banner({ text, tone, colors }: { text: string; tone: 'error' | 'success'; colors: Colors }) {
  if (!text) return null;
  const fg = tone === 'error' ? colors.warning : colors.success;
  const bg = tone === 'error' ? colors.warningSurface : colors.successSurface;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Feather name={tone === 'error' ? 'alert-circle' : 'check-circle'} size={15} color={fg} />
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function Field({ label, colors, ...input }: React.ComponentProps<typeof TextInput> & { label: string; colors: Colors }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...input}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
    </View>
  );
}

function Chips<T extends string>({ options, value, onChange, colors }: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: Colors;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.card },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            {option.color ? <View style={[styles.dot, { backgroundColor: option.color }]} /> : null}
            <Text numberOfLines={1} style={[styles.chipText, { color: selected ? colors.primary : colors.secondaryForeground }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sheet({ visible, title, onClose, children, colors }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  colors: Colors;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 14, 24, 0.48)' }]} onPress={onClose} accessibilityLabel={t('Close')} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <KeyboardAwareScrollViewCompat style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} bottomOffset={60} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close')} hitSlop={10}>
                <Feather name="x" size={21} color={colors.secondaryForeground} />
              </Pressable>
            </View>
            {children}
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- organization

function OrganizationSection({ colors }: { colors: Colors }) {
  const { org, refresh } = useCalendar();
  const [name, setName] = useState(org?.name ?? '');
  const [busy, setBusy] = useState<'' | 'name' | 'logo'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const saveName = async () => {
    if (!name.trim()) return setError(t('The organization name cannot be empty.'));
    setBusy('name');
    setError('');
    setDone('');
    try {
      await callAdmin('update_org', { name: name.trim() });
      await refresh();
      setDone(t('Name saved.'));
    } catch (cause) {
      setError(errorText(cause, t('The name could not be saved.')));
    } finally {
      setBusy('');
    }
  };

  const changeLogo = async (remove = false) => {
    setError('');
    setDone('');
    try {
      const picked = remove ? null : await pickLogo();
      if (!remove && !picked) return;
      setBusy('logo');
      await callAdmin('update_org', remove ? { remove_logo: true } : { logo: { base64: picked!.base64, mime: picked!.mime } });
      await refresh();
      setDone(remove ? t('Logo removed.') : t('Logo updated.'));
    } catch (cause) {
      setError(errorText(cause, t('The logo could not be updated.')));
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SectionHeader title={t('Organization')} meta={t('Your name and logo appear across the calendar.')} colors={colors} />
      <Banner text={error} tone="error" colors={colors} />
      <Banner text={done} tone="success" colors={colors} />
      <View style={styles.logoRow}>
        <BrandMark name={org?.name} logoUrl={org?.logo_url} size={60} />
        <View style={{ gap: 8, flex: 1 }}>
          <SmallButton testID="admin-change-logo" label={org?.logo_url ? t('Change logo') : t('Upload logo')} icon="image" tone="quiet" onPress={() => void changeLogo()} colors={colors} disabled={!!busy} />
          {org?.logo_url ? <SmallButton label={t('Remove logo')} icon="trash-2" tone="quiet" onPress={() => void changeLogo(true)} colors={colors} disabled={!!busy} /> : null}
        </View>
        {busy === 'logo' ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      <Field label={t('Organization name')} colors={colors} testID="admin-org-name" value={name} onChangeText={setName} maxLength={120} autoCapitalize="words" />
      <View style={styles.rowEnd}>
        <SmallButton testID="admin-save-name" label={busy === 'name' ? t('Saving…') : t('Save name')} icon="check" onPress={() => void saveName()} colors={colors} disabled={!!busy || name.trim() === org?.name} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- plan

function PlanSection({ colors }: { colors: Colors }) {
  const { org } = useCalendar();
  if (!org) return null;
  const pro = org.pro_active;
  const used = org.active_users;
  const limit = org.user_limit || FREE_USER_LIMIT;
  const pct = Math.min(1, used / limit);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SectionHeader
        title={t('Plan')}
        meta={pro ? t('Pro until {date}', { date: org.plan_expires_at ?? '—' }) : t('Free plan')}
        action={
          <View style={[styles.planBadge, { backgroundColor: pro ? colors.successSurface : colors.accent }]}>
            <Text style={[styles.planBadgeText, { color: pro ? colors.success : colors.primary }]}>{pro ? 'PRO' : t('Free').toUpperCase()}</Text>
          </View>
        }
        colors={colors}
      />
      {pro ? (
        <Text style={[styles.body, { color: colors.secondaryForeground }]}>
          {tn(used, '{n} active person', '{n} active people')} · {t('unlimited · manager approval is on for events from members.')}
        </Text>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.secondaryForeground }]}>
            {t('{used} of {limit} people used · events are published without approval.', { used, limit })}
          </Text>
          <View style={[styles.meter, { backgroundColor: colors.muted }]}>
            <View style={[styles.meterFill, { width: `${pct * 100}%`, backgroundColor: used >= limit ? colors.warning : colors.primary }]} />
          </View>
          <UpgradeCard reason={used >= limit ? t('You have reached the {limit}-person limit of the free plan.', { limit }) : undefined} />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- teams

function TeamsSection({ colors }: { colors: Colors }) {
  const { groups, people, events, refresh } = useCalendar();
  const [editing, setEditing] = useState<CalendarGroup | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(eventPalette[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = (team: CalendarGroup | 'new') => {
    setEditing(team);
    setName(team === 'new' ? '' : team.name);
    setColor(team === 'new' ? eventPalette[groups.length % eventPalette.length] : team.color || eventPalette[0]);
    setError('');
    setConfirmDelete(false);
  };

  const save = async () => {
    if (!name.trim()) return setError(t('Give the team a name.'));
    setBusy(true);
    setError('');
    try {
      const result =
        editing === 'new'
          ? await supabase.from('groups').insert({ name: name.trim(), color, sort_order: groups.length })
          : await supabase.from('groups').update({ name: name.trim(), color }).eq('id', (editing as CalendarGroup).id);
      if (result.error) {
        throw new Error(/duplicate|unique/i.test(result.error.message) ? t('You already have a team with that name.') : result.error.message);
      }
      await refresh();
      setEditing(null);
    } catch (cause) {
      setError(errorText(cause, t('The team could not be saved.')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    setBusy(true);
    setError('');
    try {
      const { error: delError } = await supabase.from('groups').delete().eq('id', editing.id);
      if (delError) {
        throw new Error(/foreign key/i.test(delError.message) ? t('This team still has events. Move or delete them first.') : delError.message);
      }
      await refresh();
      setEditing(null);
    } catch (cause) {
      setError(errorText(cause, t('The team could not be deleted.')));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const target = editing && editing !== 'new' ? editing : null;
  const memberCount = (id: string) => people.filter((p) => p.group_id === id && p.is_active).length;
  const eventCount = (id: string) => events.filter((e) => e.group_id === id).length;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SectionHeader
        title={t('Teams')}
        meta={groups.length ? tn(groups.length, '{n} team', '{n} teams') : t('Create teams to group people and events.')}
        action={<SmallButton testID="add-team" label={t('Add team')} icon="plus" onPress={() => open('new')} colors={colors} />}
        colors={colors}
      />
      {groups.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('No teams yet. Add your first one, for example “Sales” or “Marketing”.')}</Text>
      ) : (
        groups.map((team) => (
          <Pressable
            key={team.id}
            testID={`team-${team.name}`}
            onPress={() => open(team)}
            style={({ pressed }) => [styles.listRow, { borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
          >
            <View style={[styles.teamSwatch, { backgroundColor: team.color || colors.primary }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{team.name}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                {tn(memberCount(team.id), '{n} person', '{n} people')} · {tn(eventCount(team.id), '{n} event', '{n} events')}
              </Text>
            </View>
            <Feather name={forwardIcon()} size={17} color={colors.mutedForeground} />
          </Pressable>
        ))
      )}

      <Sheet visible={!!editing} title={editing === 'new' ? t('New team') : t('Edit team')} onClose={() => setEditing(null)} colors={colors}>
        <Banner text={error} tone="error" colors={colors} />
        <Field label={t('Team name')} colors={colors} testID="team-name" value={name} onChangeText={setName} placeholder={t('e.g. Marketing')} maxLength={80} autoCapitalize="words" />
        <Text style={[styles.fieldLabel, { color: colors.secondaryForeground, marginTop: 14 }]}>{t('Color')}</Text>
        <View style={styles.colorRow}>
          {eventPalette.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.colorChoice, { backgroundColor: c }, color === c && { borderColor: colors.foreground, borderWidth: 2 }]}
              accessibilityRole="button"
              accessibilityLabel={t('Team color')}
              accessibilityState={{ selected: color === c }}
            >
              {color === c ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
            </Pressable>
          ))}
        </View>
        {confirmDelete && target ? (
          <View style={[styles.confirmBox, { backgroundColor: colors.warningSurface }]}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>Delete {target.name}?</Text>
            <Text style={[styles.rowMeta, { color: colors.secondaryForeground }]}>
              Its {memberCount(target.id)} people will have no team until you move them.
            </Text>
            <View style={styles.actions}>
              <SmallButton label={t('Keep team')} tone="quiet" onPress={() => setConfirmDelete(false)} colors={colors} />
              <SmallButton testID="confirm-delete-team" label={t('Delete')} tone="danger" onPress={() => void remove()} colors={colors} disabled={busy} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            {target ? <SmallButton label={t('Delete')} icon="trash-2" tone="quiet" onPress={() => setConfirmDelete(true)} colors={colors} /> : null}
            <View style={{ flex: 1 }} />
            <SmallButton testID="save-team" label={busy ? t('Saving…') : t('Save team')} icon="check" onPress={() => void save()} colors={colors} disabled={busy} />
          </View>
        )}
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- people

interface PersonDraft {
  full_name: string;
  email: string;
  title: string;
  role: Role;
  group_id: string;
  password: string;
}

function PeopleSection({ colors }: { colors: Colors }) {
  const { people, groups, org, userId, refresh } = useCalendar();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CalendarPerson | 'new' | null>(null);
  const [draft, setDraft] = useState<PersonDraft>({ full_name: '', email: '', title: '', role: 'user', group_id: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limitHit, setLimitHit] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'' | 'delete' | 'deactivate'>('');
  const [resetPassword, setResetPassword] = useState('');

  const logins = useQuery({
    queryKey: ['last-logins', org?.id, people.length],
    queryFn: async () => (await callAdmin<{ logins: Record<string, string | null> }>('last_logins')).logins,
    enabled: !!org,
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [people, search]);

  const teamName = (id: string | null) => groups.find((g) => g.id === id)?.name;
  const atLimit = !!org && !org.pro_active && org.active_users >= org.user_limit;

  const open = (person: CalendarPerson | 'new') => {
    setEditing(person);
    setError('');
    setLimitHit(false);
    setConfirm('');
    setResetPassword('');
    setDraft(
      person === 'new'
        ? { full_name: '', email: '', title: '', role: 'user', group_id: groups[0]?.id ?? '', password: tempPassword() }
        : { full_name: person.full_name, email: person.email, title: person.title ?? '', role: person.role, group_id: person.group_id ?? groups[0]?.id ?? '', password: '' },
    );
  };

  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const after = async (message: string) => {
    await refresh();
    void queryClient.invalidateQueries({ queryKey: ['last-logins'] });
    setNotice(message);
    setEditing(null);
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setLimitHit(false);
    try {
      await fn();
      await after(success);
    } catch (cause) {
      if (cause instanceof AdminError && cause.code === 'USER_LIMIT') setLimitHit(true);
      setError(errorText(cause, t('That did not work. Try again.')));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft.full_name.trim()) return setError(t('Enter their name.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return setError(t('Enter a valid email address.'));
    if (draft.role !== 'super_admin' && !draft.group_id) return setError(groups.length ? t('Choose a team.') : t('Create a team first.'));
    if (editing === 'new') {
      if (draft.password.length < 6) return setError(t('The temporary password must be at least 6 characters.'));
      return run(
        () => callAdmin('create_user', { ...draft, group_id: draft.role === 'super_admin' ? null : draft.group_id }),
        t('{name} was added. Share their email and temporary password: {password}', { name: draft.full_name.trim(), password: draft.password }),
      );
    }
    const person = editing as CalendarPerson;
    return run(
      () =>
        callAdmin('update_user', {
          id: person.id,
          full_name: draft.full_name,
          email: draft.email,
          title: draft.title,
          role: draft.role,
          group_id: draft.role === 'super_admin' ? null : draft.group_id,
        }),
      t('Changes saved.'),
    );
  };

  const target = editing && editing !== 'new' ? editing : null;
  const roleOptions: { value: Role; label: string }[] = [
    { value: 'user', label: t('Member') },
    { value: 'group_admin', label: t('Team manager') },
    { value: 'super_admin', label: t('Super admin') },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SectionHeader
        title={t('People')}
        meta={org && !org.pro_active ? t('{n} active of {limit}', { n: org.active_users, limit: org.user_limit }) : t('{n} active', { n: org?.active_users ?? 0 })}
        action={<SmallButton testID="add-person" label={t('Add person')} icon="user-plus" onPress={() => open('new')} colors={colors} />}
        colors={colors}
      />
      <Banner text={notice} tone="success" colors={colors} />
      {atLimit ? <UpgradeCard compact reason={t('You have {n} people, the most the free plan allows.', { n: org?.user_limit ?? 10 })} /> : null}
      {people.length > 6 ? (
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('Search people')}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
      ) : null}
      {filtered.map((person) => (
        <Pressable
          key={person.id}
          testID={`person-${person.email}`}
          onPress={() => open(person)}
          style={({ pressed }) => [styles.listRow, { borderTopColor: colors.border, opacity: pressed ? 0.8 : person.is_active ? 1 : 0.6 }]}
          accessibilityRole="button"
        >
          <View style={[styles.avatar, { backgroundColor: groups.find((g) => g.id === person.group_id)?.color || colors.primary }]}>
            <Text style={styles.avatarText}>{person.initials || initialsFor(person.full_name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>
              {person.full_name}
              {person.id === userId ? ` (${t('you')})` : ''}
            </Text>
            <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              {roleLabel(person.role)}
              {teamName(person.group_id) ? ` · ${teamName(person.group_id)}` : person.role === 'super_admin' ? '' : ` · ${t('No team')}`}
              {!person.is_active ? ` · ${t('Deactivated')}` : ''}
            </Text>
            <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              {person.email}
              {logins.data ? ` · ${logins.data[person.id] ? t('last seen {date}', { date: new Date(logins.data[person.id]!).toLocaleDateString(dateLocale()) }) : t('never signed in')}` : ''}
            </Text>
          </View>
          <Feather name={forwardIcon()} size={17} color={colors.mutedForeground} />
        </Pressable>
      ))}

      <Sheet visible={!!editing} title={editing === 'new' ? t('Add person') : t('Edit person')} onClose={() => setEditing(null)} colors={colors}>
        <Banner text={error} tone="error" colors={colors} />
        {limitHit ? <View style={{ marginBottom: 12 }}><UpgradeCard compact /></View> : null}
        <Field label={t('Full name')} colors={colors} testID="person-name" value={draft.full_name} onChangeText={(v) => set('full_name', v)} autoCapitalize="words" maxLength={120} />
        <Field label={t('Email')} colors={colors} testID="person-email" value={draft.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field label={t('Job title (optional)')} colors={colors} testID="person-title" value={draft.title} onChangeText={(v) => set('title', v)} maxLength={120} />
        <Text style={[styles.fieldLabel, { color: colors.secondaryForeground, marginTop: 14 }]}>{t('Role')}</Text>
        <Chips options={roleOptions} value={draft.role} onChange={(v) => set('role', v)} colors={colors} />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {draft.role === 'super_admin'
            ? t('Can manage the whole organization, its teams and people.')
            : draft.role === 'group_admin'
              ? t('Manages one team’s events and approves them on Pro.')
              : t('Adds and sees their own and shared events.')}
        </Text>
        {draft.role !== 'super_admin' ? (
          <>
            <Text style={[styles.fieldLabel, { color: colors.secondaryForeground, marginTop: 14 }]}>{t('Team')}</Text>
            {groups.length ? (
              <Chips options={groups.map((g) => ({ value: g.id, label: g.name, color: g.color }))} value={draft.group_id} onChange={(v) => set('group_id', v)} colors={colors} />
            ) : (
              <Text style={[styles.hint, { color: colors.warning }]}>{t('Create a team first.')}</Text>
            )}
          </>
        ) : null}
        {editing === 'new' ? (
          <>
            <Field label={t('Temporary password')} colors={colors} testID="person-password" value={draft.password} onChangeText={(v) => set('password', v)} autoCapitalize="none" autoCorrect={false} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('Share it with them. They choose their own password the first time they sign in.')}</Text>
          </>
        ) : null}

        {target ? (
          <View style={[styles.subCard, { borderColor: colors.border }]}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('Access')}</Text>
            {resetPassword ? (
              <>
                <Field label={t('New temporary password')} colors={colors} value={resetPassword} onChangeText={setResetPassword} autoCapitalize="none" autoCorrect={false} />
                <View style={styles.actions}>
                  <SmallButton label={t('Cancel')} tone="quiet" onPress={() => setResetPassword('')} colors={colors} />
                  <SmallButton
                    label={t('Set password')}
                    onPress={() => void run(() => callAdmin('reset_password', { id: target.id, password: resetPassword }), `Password reset. Share the new temporary password: ${resetPassword}`)}
                    colors={colors}
                    disabled={busy}
                  />
                </View>
              </>
            ) : confirm ? (
              <>
                <Text style={[styles.rowMeta, { color: colors.secondaryForeground }]}>
                  {confirm === 'delete'
                    ? t('Delete {name}? Their events are deleted too. This cannot be undone.', { name: target.full_name })
                    : t('Deactivate {name}? They can no longer sign in, and their seat is freed.', { name: target.full_name })}
                </Text>
                <View style={styles.actions}>
                  <SmallButton label={t('Cancel')} tone="quiet" onPress={() => setConfirm('')} colors={colors} />
                  <SmallButton
                    testID={`confirm-${confirm}`}
                    label={confirm === 'delete' ? t('Delete') : t('Deactivate')}
                    tone="danger"
                    onPress={() =>
                      void run(
                        () => (confirm === 'delete' ? callAdmin('delete_user', { id: target.id }) : callAdmin('set_active', { id: target.id, is_active: false })),
                        confirm === 'delete' ? t('Person deleted.') : t('Person deactivated.'),
                      )
                    }
                    colors={colors}
                    disabled={busy}
                  />
                </View>
              </>
            ) : target.id === userId ? (
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{t('This is your own account.')}</Text>
            ) : (
              <View style={styles.wrapActions}>
                <SmallButton label={t('Reset password')} icon="key" tone="quiet" onPress={() => setResetPassword(tempPassword())} colors={colors} />
                {target.is_active ? (
                  <SmallButton testID="deactivate-person" label={t('Deactivate')} icon="user-x" tone="quiet" onPress={() => setConfirm('deactivate')} colors={colors} />
                ) : (
                  <SmallButton label={t('Reactivate')} icon="user-check" tone="quiet" onPress={() => void run(() => callAdmin('set_active', { id: target.id, is_active: true }), t('Person reactivated.'))} colors={colors} disabled={busy} />
                )}
                <SmallButton label={t('Delete')} icon="trash-2" tone="quiet" onPress={() => setConfirm('delete')} colors={colors} />
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.actions}>
          <SmallButton label={t('Cancel')} tone="quiet" onPress={() => setEditing(null)} colors={colors} />
          <View style={{ flex: 1 }} />
          <SmallButton testID="save-person" label={busy ? t('Saving…') : editing === 'new' ? t('Add person') : t('Save changes')} icon="check" onPress={() => void save()} colors={colors} disabled={busy} />
        </View>
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- owner console

interface OwnerOrg {
  id: string;
  name: string;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  active_users: number;
  created_at: string;
  contact: { name: string; email: string } | null;
}

function OwnerConsole({ colors }: { colors: Colors }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const orgs = useQuery({
    queryKey: ['owner-orgs'],
    queryFn: async () => (await callAdmin<{ orgs: OwnerOrg[] }>('platform_list_orgs')).orgs,
  });

  const setPlan = async (org: OwnerOrg, plan: 'free' | 'pro') => {
    setBusyId(org.id);
    setError('');
    try {
      const base = org.plan === 'pro' && org.plan_expires_at && org.plan_expires_at > new Date().toISOString().slice(0, 10)
        ? new Date(org.plan_expires_at)
        : new Date();
      base.setFullYear(base.getFullYear() + 1);
      await callAdmin('platform_set_plan', { org_id: org.id, plan, expires: plan === 'pro' ? base.toISOString().slice(0, 10) : null });
      await orgs.refetch();
    } catch (cause) {
      setError(errorText(cause, t('The plan could not be changed.')));
    } finally {
      setBusyId('');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <SectionHeader
        title={t('Owner console')}
        meta={t('Only you see this. Companies, sizes and plans — never their calendars.')}
        action={<SmallButton label={t('Refresh')} icon="refresh-cw" tone="quiet" onPress={() => void orgs.refetch()} colors={colors} />}
        colors={colors}
      />
      <Banner text={error || (orgs.error ? errorText(orgs.error, t('Could not load companies.')) : '')} tone="error" colors={colors} />
      {orgs.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {(orgs.data ?? []).map((o) => {
        const pro = o.plan === 'pro' && (!o.plan_expires_at || o.plan_expires_at >= today);
        return (
          <View key={o.id} style={[styles.listRow, { borderTopColor: colors.border, alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{o.name}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                {tn(o.active_users, '{n} person', '{n} people')} · {pro ? t('Pro until {date}', { date: o.plan_expires_at ?? '' }) : o.active_users >= 10 ? t('Free · at limit') : t('Free')} · {t('since {date}', { date: o.created_at.slice(0, 10) })}
                {pro ? ` · ${t('{total} per year', { total: proYearlyTotal(o.active_users) })}` : ''}
              </Text>
              {o.contact ? (
                <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                  {o.contact.name} · {o.contact.email}
                </Text>
              ) : null}
            </View>
            {busyId === o.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={{ gap: 6 }}>
                <SmallButton label={pro ? '+1 year Pro' : t('Make Pro')} onPress={() => void setPlan(o, 'pro')} colors={colors} />
                {pro ? <SmallButton label={t('Set Free')} tone="quiet" onPress={() => void setPlan(o, 'free')} colors={colors} /> : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  kicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  title: { fontSize: 25, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  sectionMeta: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  body: { fontSize: 13, lineHeight: 19 },
  empty: { fontSize: 12, lineHeight: 18 },
  smallButton: { minHeight: 36, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  smallButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  banner: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, alignItems: 'flex-start' },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  field: { marginTop: 12 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 34, maxWidth: 220, borderWidth: 1, borderRadius: 17, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
  planBadge: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  planBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  meter: { height: 8, borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4 },
  listRow: { borderTopWidth: 1, paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  teamSwatch: { width: 12, height: 32, borderRadius: 4 },
  rowTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, lineHeight: 16 },
  avatar: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  colorChoice: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  confirmBox: { borderRadius: 12, padding: 13, marginTop: 16, gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18 },
  wrapActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, marginTop: 18 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '93%', alignSelf: 'center', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#8298AE', opacity: 0.45, alignSelf: 'center', marginTop: 9, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
});
