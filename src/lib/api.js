import { supabase, currentUserId } from './supabase.js';

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export async function listMyGroups() {
  const uid = await currentUserId();
  const rows = check(
    await supabase.from('group_devices').select('group_id, member_id, groups(*)').eq('user_id', uid)
  );
  const groups = rows.filter((r) => r.groups);
  if (!groups.length) return [];
  const txs = check(
    await supabase.from('transactions').select('group_id, paid_by, split, fx_rate, date')
      .in('group_id', groups.map((g) => g.group_id))
  );
  return groups
    .map((r) => ({ ...r.groups, me: r.member_id, txs: txs.filter((t) => t.group_id === r.group_id) }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function createGroup({ name, emoji, currency, members, meIndex }) {
  return check(await supabase.rpc('create_group', {
    p_name: name, p_emoji: emoji, p_currency: currency, p_members: members, p_me: meIndex + 1,
  }));
}

export const joinGroup = async (id) => check(await supabase.rpc('join_group', { gid: id }));

export async function loadGroup(id) {
  const uid = await currentUserId();
  const [group, members, txs, device] = await Promise.all([
    supabase.from('groups').select('*').eq('id', id).single().then(check),
    supabase.from('members').select('*').eq('group_id', id).order('created_at').then(check),
    supabase.from('transactions').select('*').eq('group_id', id)
      .order('date', { ascending: false }).order('created_at', { ascending: false }).then(check),
    supabase.from('group_devices').select('member_id').eq('group_id', id).eq('user_id', uid).maybeSingle().then(check),
  ]);
  return { group, members, txs, me: device?.member_id || null };
}

export async function setMe(groupId, memberId) {
  const uid = await currentUserId();
  check(await supabase.from('group_devices').update({ member_id: memberId }).eq('group_id', groupId).eq('user_id', uid));
}

export async function leaveGroup(groupId) {
  const uid = await currentUserId();
  check(await supabase.from('group_devices').delete().eq('group_id', groupId).eq('user_id', uid));
}

export const addMember = async (groupId, name) =>
  check(await supabase.from('members').insert({ group_id: groupId, name }).select().single());

export const updateMember = async (id, patch) =>
  check(await supabase.from('members').update(patch).eq('id', id));

export const updateGroup = async (id, patch) =>
  check(await supabase.from('groups').update(patch).eq('id', id));

export async function saveTx(tx) {
  const row = { ...tx, updated_at: new Date().toISOString() };
  if (tx.id) return check(await supabase.from('transactions').update(row).eq('id', tx.id).select().single());
  return check(await supabase.from('transactions').insert(row).select().single());
}

export const deleteTx = async (id) => check(await supabase.from('transactions').delete().eq('id', id));

export async function logActivity(groupId, memberId, action, summary) {
  // Activity is a nice-to-have; never block the main action on it.
  await supabase.from('activity').insert({ group_id: groupId, member_id: memberId, action, summary });
}

export const loadActivity = async (groupId) =>
  check(await supabase.from('activity').select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(200));

export function subscribeGroup(groupId, onChange) {
  let t;
  const fire = () => { clearTimeout(t); t = setTimeout(onChange, 250); };
  const ch = supabase.channel(`group-${groupId}`);
  ['transactions', 'members', 'activity'].forEach((table) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, fire)
  );
  ch.subscribe();
  return () => { clearTimeout(t); supabase.removeChannel(ch); };
}
