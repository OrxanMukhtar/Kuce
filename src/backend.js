(() => {
  const config = window.GAME_CONFIG || {};
  let client, channel, ownId, timer, authListenerBound = false, latestPosition = { x: 0, depth: .78, name: 'Qonaq', avatar: '#e28b68' };
  const playerListeners = new Set(), postListeners = new Set(), emoteListeners = new Set();
  const emit = (listeners, value) => listeners.forEach(fn => fn(value));
  const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  async function connect() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return { configured: false };
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data: { session } } = await client.auth.getSession();
    return { configured: true, session, user: session?.user || null };
  }
  async function signUp(email, password, displayName) {
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) throw error; return data;
  }
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error; return data;
  }
  async function signOut() { await disconnect(); const { error } = await client.auth.signOut(); if (error) throw error; }
  async function syncProfile(name, avatar) {
    const { data: { user } } = await client.auth.getUser(); if (!user) return null;
    const { error } = await client.from('street_profiles').upsert({ id: user.id, display_name: name.slice(0, 18), avatar_color: avatar, updated_at: new Date().toISOString() });
    if (error) throw error; return user;
  }
  async function connectWorld(name, avatar, onAuth) {
    const { data: { user } } = await client.auth.getUser(); if (!user) return null;
    ownId = user.id; await syncProfile(name, avatar);
    channel = client.channel('nar-ciceyi-main', { config: { presence: { key: user.id }, broadcast: { self: false } } });
    channel.on('presence', { event: 'sync' }, () => {
      const all = Object.values(channel.presenceState()).flat().filter(p => p.user_id !== ownId);
      emit(playerListeners, all);
    }).on('broadcast', { event: 'emote' }, ({ payload }) => emit(emoteListeners, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'street_posts' }, () => refreshPosts());
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: ownId, name, avatar, x: latestPosition.x, depth: latestPosition.depth, online_at: new Date().toISOString() });
      }
    });
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (channel && ownId) channel.track({ user_id: ownId, name, avatar, x: latestPosition.x, depth: latestPosition.depth, online_at: new Date().toISOString() }); }, 1800);
    if (!authListenerBound) { client.auth.onAuthStateChange((event, session) => onAuth?.(event, session)); authListenerBound = true; }
    await refreshPosts(); return user;
  }
  async function disconnect() {
    if (timer) clearInterval(timer); timer = null;
    if (channel && client) await client.removeChannel(channel);
    channel = null; ownId = null; emit(playerListeners, []);
  }
  async function refreshPosts() {
    if (!client) return [];
    const { data, error } = await client.from('street_posts').select('id,author_id,display_name,body,image_url,created_at').eq('spot_id', 'wall').order('created_at', { ascending: false }).limit(40);
    if (error) throw error;
    const posts = data || [];
    if (posts.length) {
      const { data: likes, error: likesError } = await client.from('street_likes').select('post_id').in('post_id', posts.map(post => post.id));
      if (likesError) throw likesError;
      const counts = new Map(); (likes || []).forEach(row => counts.set(row.post_id, (counts.get(row.post_id) || 0) + 1));
      posts.forEach(post => { post.like_count = counts.get(post.id) || 0; });
    }
    emit(postListeners, posts); return posts;
  }
  function currentPlayers() {
    if (!channel) return [];
    return Object.values(channel.presenceState()).flat().filter(p => p.user_id !== ownId);
  }
  async function createPost(body, file, displayName) {
    const { data: { user } } = await client.auth.getUser(); if (!user) throw new Error('Paylaşmaq üçün əvvəlcə hesaba daxil ol.');
    let imageUrl = null;
    if (file) {
      const ext = file.type === 'image/png' ? 'png' : 'jpg', path = `${user.id}/${makeId()}.${ext}`;
      const { error: uploadError } = await client.storage.from('street-posts').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data } = client.storage.from('street-posts').getPublicUrl(path); imageUrl = data.publicUrl;
    }
    const { data, error } = await client.from('street_posts').insert({ author_id: user.id, display_name: displayName.slice(0, 18), body: body.slice(0, 180), image_url: imageUrl, spot_id: 'wall' }).select().single();
    if (error) throw error; await refreshPosts(); return data;
  }
  async function report(kind, targetId, reason) {
    const { error } = await client.from('street_reports').insert({ reporter_id: ownId, target_type: kind, target_id: targetId, reason: reason.slice(0, 240) });
    if (error) throw error;
  }
  async function block(userId) {
    if (!ownId || ownId === userId) throw new Error('Bu istifadəçini bloklamaq mümkün deyil.');
    const { error } = await client.from('street_blocks').upsert({ blocker_id: ownId, blocked_id: userId }); if (error) throw error;
  }
  async function addFriend(userId) {
    if (!ownId || ownId === userId) return;
    const { error } = await client.from('street_friendships').insert({ user_id: ownId, friend_id: userId }); if (error && error.code !== '23505') throw error;
  }
  async function getBlocks() {
    if (!ownId) return [];
    const { data, error } = await client.from('street_blocks').select('blocked_id').eq('blocker_id', ownId);
    if (error) throw error; return (data || []).map(row => row.blocked_id);
  }
  async function getFriends() {
    if (!ownId) return [];
    const { data, error } = await client.from('street_friendships').select('friend_id').eq('user_id', ownId);
    if (error) throw error; return (data || []).map(row => row.friend_id);
  }
  async function toggleLike(postId) {
    const { data: existing, error: readError } = await client.from('street_likes').select('post_id').eq('post_id', postId).eq('user_id', ownId).maybeSingle();
    if (readError) throw readError;
    if (existing) { const { error } = await client.from('street_likes').delete().eq('post_id', postId).eq('user_id', ownId); if (error) throw error; return false; }
    const { error } = await client.from('street_likes').insert({ post_id: postId, user_id: ownId }); if (error) throw error; return true;
  }
  function move(position) { latestPosition = { ...latestPosition, ...position }; }
  function emote(icon) { if (channel) channel.send({ type: 'broadcast', event: 'emote', payload: { user_id: ownId, icon } }); }
  window.StreetBackend = {
    connect, signUp, signIn, signOut, connectWorld, disconnect, syncProfile, createPost, report, block, addFriend, getBlocks, getFriends, toggleLike, move, emote,
    onPlayers: fn => { playerListeners.add(fn); fn(currentPlayers()); return () => playerListeners.delete(fn); },
    onPosts: fn => { postListeners.add(fn); if (ownId) refreshPosts().catch(() => {}); return () => postListeners.delete(fn); },
    onEmote: fn => { emoteListeners.add(fn); return () => emoteListeners.delete(fn); },
    get configured() { return !!(config.supabaseUrl && config.supabaseAnonKey); },
    get signedIn() { return !!ownId; }
  };
})();
