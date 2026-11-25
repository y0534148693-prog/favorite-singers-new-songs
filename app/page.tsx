'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Artist = { id: string; channel_id: string; artist_name: string; channel_title: string | null; thumbnail_url: string | null; channel_url?: string | null };
type Song = { youtube_video_id: string; title: string; artist_name: string; thumbnail_url: string | null; published_at: string | null; video_url: string; official_confidence?: string; official_label?: string };

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [tab, setTab] = useState<'songs' | 'artists' | 'favorites' | 'recommendations' | 'connect'>('songs');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteRows, setFavoriteRows] = useState<Song[]>([]);
  const [artistName, setArtistName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [channelResults, setChannelResults] = useState<Array<{channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}>>([]);
  const [recommendations, setRecommendations] = useState<Array<{channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}>>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [youtubeSubscriptions, setYoutubeSubscriptions] = useState<Array<{channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}>>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['he']);
  const [search, setSearch] = useState('');
  const [filterArtist, setFilterArtist] = useState('all');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [feedError, setFeedError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      void loadArtists();
      void loadFavorites();
      void loadPreferences();
    } else {
      setArtists([]); setSongs([]); setFavorites([]); setFavoriteRows([]);
      setRecommendations([]);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (tab === 'recommendations' && session?.user) void loadRecommendations();
  }, [tab, session?.user?.id, artists]);

  async function signInWithGoogle() {
    setLoading(true); setNotice('');
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (result.error) setNotice(result.error.message);
  }

  async function connectYouTubeAccount() {
    setLoading(true); setNotice('');
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/youtube.readonly',
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    setLoading(false);
    if (error) setNotice(error.message);
  }

  async function importYouTubeSubscriptions() {
    setSubscriptionsLoading(true); setNotice('');
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      const googleToken = (current as (typeof current & { provider_token?: string }) | null)?.provider_token;
      const endpoint = process.env.NEXT_PUBLIC_YOUTUBE_SUBSCRIPTIONS_URL;
      if (!current || !googleToken || !endpoint) {
        throw new Error('לא נמצא אסימון Google פעיל. חבר תחילה את חשבון YouTube עם הרשאת קריאת מינויים.');
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${current.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
        body: JSON.stringify({ google_access_token: googleToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'ייבוא המינויים נכשל.');
      setYoutubeSubscriptions(body.items ?? []);
      if (!(body.items ?? []).length) setNotice('לא נמצאו מינויים בערוץ YouTube הזה.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'שגיאה בייבוא המינויים.');
    } finally { setSubscriptionsLoading(false); }
  }

  async function importSubscription(channel: {channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}) {
    const added = await addFoundChannel(channel);
    if (added) setYoutubeSubscriptions(items => items.filter(item => item.channel_id !== channel.channel_id));
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setNotice('');
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) setNotice(result.error.message);
    else if (authMode === 'signup') setNotice('נשלח אליך מייל לאימות החשבון, אם אימות המייל מופעל בפרויקט.');
  }

  async function loadArtists() {
    const { data, error } = await supabase.from('user_artists').select('id,channel_id,artist_name,channel_title,thumbnail_url').eq('user_id', session.user.id).order('added_at', { ascending: false });
    if (error) setNotice(error.message); else setArtists((data ?? []) as Artist[]);
  }

  async function loadFavorites() {
    const { data, error } = await supabase.from('favorite_songs').select('youtube_video_id,title,artist_name,thumbnail_url,published_at,video_url').eq('user_id', session.user.id);
    if (error) { setNotice(error.message); return; }
    setFavorites((data ?? []).map((x: any) => x.youtube_video_id));
    setFavoriteRows((data ?? []).map((x: any) => ({ ...x, official_confidence: 'low' })));
  }

  async function addArtist(e: React.FormEvent) {
    e.preventDefault();
    if (!artistName.trim() || !channelId.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('user_artists').insert({
      user_id: session.user.id, artist_name: artistName.trim(), channel_id: channelId.trim(),
      channel_url: `https://www.youtube.com/channel/${channelId.trim()}`
    });
    setLoading(false);
    if (error) setNotice(error.code === '23505' ? 'האמן כבר נמצא ברשימה.' : error.message);
    else { setArtistName(''); setChannelId(''); setNotice('האמן נוסף בהצלחה.'); await loadArtists(); }
  }

  async function searchYouTubeChannels(e: React.FormEvent) {
    e.preventDefault();
    if (!channelQuery.trim()) return;
    setLoading(true); setNotice('');
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      const endpoint = process.env.NEXT_PUBLIC_YOUTUBE_SEARCH_URL;
      if (!endpoint || !current) throw new Error('חסר חיבור לחיפוש YouTube. בדוק את הגדרות האתר.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        body: JSON.stringify({ query: channelQuery.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'החיפוש נכשל');
      setChannelResults(body.items ?? []);
      if (!(body.items ?? []).length) setNotice('לא נמצאו ערוצים מתאימים. נסה ניסוח אחר.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'שגיאה בחיפוש');
    } finally { setLoading(false); }
  }

  async function addFoundChannel(channel: {channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}) {
    setLoading(true);
    const { error } = await supabase.from('user_artists').insert({
      user_id: session.user.id, artist_name: channel.title, channel_id: channel.channel_id,
      channel_title: channel.title, thumbnail_url: channel.thumbnail_url,
      channel_url: channel.channel_url,
    });
    setLoading(false);
    if (error) {
      setNotice(error.code === '23505' ? 'הערוץ כבר נמצא ברשימה.' : error.message);
      return false;
    }
    setNotice(channel.title + ' נוסף לרשימת הזמרים.');
    setChannelResults(old => old.filter(item => item.channel_id !== channel.channel_id));
    await loadArtists();
    return true;
  }

  async function loadPreferences() {
    const { data, error } = await supabase.from('music_preferences')
      .select('genres,language_preferences')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) { setNotice(error.message); return; }
    if (data) {
      setSelectedGenres(data.genres ?? []);
      setSelectedLanguages(data.language_preferences ?? ['he']);
    }
  }

  async function savePreferences() {
    setLoading(true);
    const { error } = await supabase.from('music_preferences').upsert({
      user_id: session.user.id,
      genres: selectedGenres,
      language_preferences: selectedLanguages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setLoading(false);
    if (error) setNotice(error.message);
    else setNotice('העדפות המוזיקה נשמרו.');
  }

  async function loadRecommendations() {
    if (!artists.length && !selectedGenres.length) { setRecommendations([]); return; }
    const endpoint = process.env.NEXT_PUBLIC_YOUTUBE_SEARCH_URL;
    if (!endpoint) { setNotice('חסר חיבור לשירות חיפוש YouTube.'); return; }
    setLoading(true);
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current) return;
      const seed = [
        ...artists.slice(0, 3).map(a => a.artist_name),
        ...selectedGenres,
        ...selectedLanguages.map(language => language === 'he' ? 'עברית' : 'English'),
      ].join(' ');
      const query = ((seed || 'זמרים ישראלים') + ' זמרים').slice(0, 100);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'לא ניתן לטעון הצעות כרגע.');
      const { data: dismissedRows, error: dismissedError } = await supabase
        .from('dismissed_artists')
        .select('channel_id')
        .eq('user_id', current.user.id);
      if (dismissedError) throw dismissedError;
      const savedDismissed = (dismissedRows ?? []).map((row: { channel_id: string }) => row.channel_id);
      setDismissedIds(savedDismissed);
      const existing = new Set(artists.map(a => a.channel_id));
      setRecommendations((body.items ?? []).filter((item: {channel_id:string}) => !existing.has(item.channel_id) && !savedDismissed.includes(item.channel_id)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'שגיאה בטעינת הצעות.');
    } finally { setLoading(false); }
  }

  async function dismissRecommendation(channelId: string, artistName: string) {
    if (dismissedIds.includes(channelId)) return;
    const { error } = await supabase.from('dismissed_artists').insert({
      user_id: session.user.id,
      channel_id: channelId,
      artist_name: artistName,
    });
    if (error) { setNotice(error.message); return; }
    setDismissedIds(ids => [...ids, channelId]);
    setRecommendations(items => items.filter(item => item.channel_id !== channelId));
  }

  async function addRecommendedChannel(channel: {channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}) {
    const added = await addFoundChannel(channel);
    if (added) setRecommendations(items => items.filter(item => item.channel_id !== channel.channel_id));
  }

  async function removeArtist(id: string) {
    const { error } = await supabase.from('user_artists').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) setNotice(error.message); else await loadArtists();
  }

  async function loadFeed() {
    setLoading(true); setFeedError(''); setNotice('');
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      const endpoint = process.env.NEXT_PUBLIC_YOUTUBE_FEED_URL;
      if (!endpoint || !current) throw new Error('חסר חיבור תקין לשירות.');
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${current.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'לא ניתן לטעון שירים כרגע.');
      setSongs(body.items ?? []);
      if (body.errors?.length) setFeedError('חלק מהערוצים לא נטענו. אפשר לנסות שוב מאוחר יותר.');
    } catch (error) {
      setSongs([]);
      setFeedError(error instanceof Error ? error.message : 'לא ניתן לטעון שירים כרגע.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite(song: Song) {
    const isSaved = favorites.includes(song.youtube_video_id);
    if (isSaved) {
      const { error } = await supabase.from('favorite_songs').delete().eq('user_id', session.user.id).eq('youtube_video_id', song.youtube_video_id);
      if (error) setNotice(error.message); else { setFavorites(favorites.filter(id => id !== song.youtube_video_id)); setFavoriteRows(favoriteRows.filter(item => item.youtube_video_id !== song.youtube_video_id)); }
    } else {
      const { error } = await supabase.from('favorite_songs').insert({
        user_id: session.user.id, youtube_video_id: song.youtube_video_id, title: song.title,
        artist_name: song.artist_name, thumbnail_url: song.thumbnail_url, published_at: song.published_at,
        video_url: song.video_url
      });
      if (error) setNotice(error.message); else { setFavorites([...favorites, song.youtube_video_id]); setFavoriteRows([...favoriteRows, song]); }
    }
  }

  const visibleSongs = useMemo(() => songs.filter(song =>
    (filterArtist === 'all' || song.artist_name === filterArtist) &&
    `${song.title} ${song.artist_name}`.toLowerCase().includes(search.toLowerCase())
  ), [songs, filterArtist, search]);
  const favoriteSongs = favoriteRows;

  if (!session) return <main className="auth-shell">
    <section className="auth-card">
      <div className="brand-mark">♫</div>
      <p className="eyebrow">המקום של המוזיקה שלך</p>
      <h1>המוזיקה שלי</h1>
      <p className="muted">כל השירים החדשים מהאמנים שאתה אוהב, במקום אחד.</p>
      <button type="button" className="secondary" onClick={signInWithGoogle} disabled={loading}>התחברות באמצעות Google</button>
      <p className="fine">הכניסה באמצעות Google משמשת לאימות המשתמש בלבד. חיבור לקריאת מינויים ב-YouTube יוגדר בנפרד, לאחר הפעלת ההרשאות.</p>
      <form onSubmit={signIn} className="stack">
        <label>כתובת אימייל<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" /></label>
        <label>סיסמה<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="לפחות 6 תווים" /></label>
        <button className="primary" disabled={loading}>{loading ? 'רק רגע…' : authMode === 'login' ? 'כניסה לחשבון' : 'יצירת חשבון'}</button>
      </form>
      <button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
        {authMode === 'login' ? 'אין לך חשבון? יצירת חשבון' : 'כבר יש לך חשבון? כניסה'}
      </button>
      {notice && <p className="notice">{notice}</p>}
    </section>
  </main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark small">♫</span><div><strong>המוזיקה שלי</strong><small>הספרייה האישית שלך</small></div></div>
      <nav>
        <button className={tab === 'songs' ? 'active' : ''} onClick={() => setTab('songs')}>◉　שירים חדשים</button>
        <button className={tab === 'artists' ? 'active' : ''} onClick={() => setTab('artists')}>♬　הזמרים שלי</button>
        <button className={tab === 'favorites' ? 'active' : ''} onClick={() => setTab('favorites')}>♡　מועדפים</button>
        <button className={tab === 'recommendations' ? 'active' : ''} onClick={() => setTab('recommendations')}>✦　אולי תאהב</button>
        <button className={tab === 'connect' ? 'active' : ''} onClick={() => setTab('connect')}>⌁　חיבורים והגדרות</button>
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /> החשבון מחובר<button className="logout" onClick={() => supabase.auth.signOut()}>התנתקות</button></div>
    </aside>

    <section className="content">
      <header className="topbar"><div><p className="eyebrow">שלום, וברוך הבא</p><h1>{tab === 'songs' ? 'השירים החדשים שלך' : tab === 'artists' ? 'הזמרים שלי' : tab === 'favorites' ? 'השירים שאהבת' : tab === 'recommendations' ? 'אולי תאהב' : 'חיבורים והגדרות'}</h1></div><div className="avatar">{(session.user.email?.[0] ?? 'מ').toUpperCase()}</div></header>
      {notice && <div className="notice inline-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {tab === 'songs' && <>
        <div className="hero">
          <div><span className="hero-tag">העדכונים שלך</span><h2>אל תפספס אף שיר חדש</h2><p>קליפים ושירים חדשים מהערוצים שהוספת לרשימה.</p></div>
          <button className="primary" onClick={loadFeed} disabled={loading}>{loading ? 'טוען…' : '↻　רענן שירים'}</button>
        </div>
        <div className="toolbar"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שיר או אמן…" /><select value={filterArtist} onChange={e => setFilterArtist(e.target.value)}><option value="all">כל האמנים</option>{artists.map(a => <option key={a.id} value={a.artist_name}>{a.artist_name}</option>)}</select></div>
        {feedError && <div className="empty-state"><strong>עדיין לא ניתן להציג שירים</strong><p>{feedError}</p><small>לאחר הוספת מפתח YouTube API בשירות Edge Function, התוצאות יופיעו כאן.</small></div>}
        {!songs.length && !feedError && <div className="empty-state"><div className="empty-icon">♫</div><strong>הפיד שלך מחכה לשיר הראשון</strong><p>הוסף אמנים ואז לחץ על „רענן שירים”.</p><button className="secondary" onClick={() => setTab('artists')}>הוספת אמנים</button></div>}
        <div className="song-grid">{visibleSongs.map(song => <article className="song-card" key={song.youtube_video_id}>
          <a href={song.video_url} target="_blank" rel="noreferrer" className="thumb">{song.thumbnail_url ? <img src={song.thumbnail_url} alt="" /> : <div className="thumb-fallback">♫</div>}<span className="play">▶</span></a>
          <div className="song-info"><div><h3>{song.title}</h3><p>{song.artist_name}</p></div><button className={`heart ${favorites.includes(song.youtube_video_id) ? 'saved' : ''}`} onClick={() => toggleFavorite(song)} aria-label="שמירה למועדפים">{favorites.includes(song.youtube_video_id) ? '♥' : '♡'}</button></div>
          <div className="song-meta"><span>{song.published_at ? new Date(song.published_at).toLocaleDateString('he-IL') : 'תאריך לא זמין'}</span><span className="confidence">{song.official_label ?? 'לא אומת כרשמי'}</span></div>
        </article>)}</div>
      </>}

      {tab === 'artists' && <>
        <div className="section-intro"><h2>האמנים שמהם נביא עדכונים</h2><p>הוסף ערוץ YouTube לפי Channel ID כדי לקבל את השירים החדשים שלו.</p></div>
        <form className="add-form" onSubmit={searchYouTubeChannels}><label>חיפוש ערוץ YouTube<input value={channelQuery} onChange={e => setChannelQuery(e.target.value)} required placeholder="חפש שם אמן או ערוץ…" /></label><button className="primary" disabled={loading}>חפש ערוצים</button></form>
        {channelResults.length > 0 && <div className="artist-list">{channelResults.map(channel => <div className="artist-row" key={channel.channel_id}><div className="artist-avatar">{channel.thumbnail_url ? <img src={channel.thumbnail_url} alt="" /> : '♫'}</div><div className="artist-copy"><strong>{channel.title}</strong><small>{channel.channel_id}</small></div><a href={channel.channel_url} target="_blank" rel="noreferrer">בדוק ערוץ ↗</a><button className="primary" disabled={loading || artists.some(a => a.channel_id === channel.channel_id)} onClick={() => addFoundChannel(channel)}>{artists.some(a => a.channel_id === channel.channel_id) ? 'כבר נוסף' : 'הוסף לרשימה'}</button></div>)}</div>}
        <form className="add-form" onSubmit={addArtist}><label>שם האמן<input value={artistName} onChange={e => setArtistName(e.target.value)} required placeholder="לדוגמה: אמן אהוב" /></label><label>מזהה ערוץ YouTube<input value={channelId} onChange={e => setChannelId(e.target.value)} required placeholder="UCxxxxxxxxxxxxxxxx" /></label><button className="primary" disabled={loading}>＋ הוסף לרשימה</button></form>
        <div className="artist-list">{artists.map(a => <div className="artist-row" key={a.id}><div className="artist-avatar">{a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : '♫'}</div><div className="artist-copy"><strong>{a.artist_name}</strong><small>{a.channel_id}</small></div><a href={a.channel_url ?? `https://www.youtube.com/channel/${a.channel_id}`} target="_blank" rel="noreferrer">פתיחת הערוץ ↗</a><button className="remove" onClick={() => removeArtist(a.id)}>הסר</button></div>)}{!artists.length && <div className="empty-state"><strong>הרשימה עדיין ריקה</strong><p>הוסף את ערוצי האמנים שאתה אוהב.</p></div>}</div>
      </>}

      {tab === 'favorites' && <><div className="section-intro"><h2>המועדפים שלך</h2><p>שירים ששמרת מהפיד.</p></div><div className="song-grid">{favoriteSongs.map(song => <article className="song-card" key={song.youtube_video_id}><a href={song.video_url} target="_blank" rel="noreferrer" className="thumb">{song.thumbnail_url && <img src={song.thumbnail_url} alt="" />}<span className="play">▶</span></a><div className="song-info"><div><h3>{song.title}</h3><p>{song.artist_name}</p></div><button className="heart saved" onClick={() => toggleFavorite(song)}>♥</button></div></article>)}</div>{!favorites.length && <div className="empty-state"><strong>עוד אין לך מועדפים</strong><p>שמור שירים מהמסך „שירים חדשים”.</p></div>}</>}

      {tab === 'recommendations' && <>
        <div className="section-intro"><h2>ערוצים שאולי יתאימו לטעם שלך</h2><p>ההצעות מבוססות על חיפוש YouTube לפי שמות האמנים שכבר הוספת. זו התאמת חיפוש ראשונית, לא דירוג פופולריות או אימות רשמי.</p></div>
        <div className="toolbar"><button className="secondary" onClick={loadRecommendations} disabled={loading}>{loading ? 'מחפש…' : '↻ רענן הצעות'}</button></div>
        {!artists.length && !selectedGenres.length && <div className="empty-state"><strong>כדאי לבחור סגנון מוזיקלי או להוסיף אמן</strong><p>אפשר לשמור העדפות במסך החיבורים וההגדרות.</p><button className="secondary" onClick={() => setTab('connect')}>בחירת העדפות</button></div>}
        {artists.length > 0 && !recommendations.length && <div className="empty-state"><strong>אין כרגע הצעות חדשות</strong><p>אפשר לרענן את החיפוש בהמשך.</p></div>}
        <div className="artist-list">{recommendations.map(channel => <div className="artist-row" key={channel.channel_id}><div className="artist-avatar">{channel.thumbnail_url ? <img src={channel.thumbnail_url} alt="" /> : '♫'}</div><div className="artist-copy"><strong>{channel.title}</strong><small>{channel.channel_id}</small></div><a href={channel.channel_url} target="_blank" rel="noreferrer">בדוק ערוץ ↗</a><button className="primary" disabled={loading} onClick={() => addRecommendedChannel(channel)}>הוסף</button><button className="remove" onClick={() => dismissRecommendation(channel.channel_id, channel.title)}>לא מעוניין</button></div>)}</div>
      </>}

      {tab === 'connect' && <div className="settings-grid"><article className="settings-card"><span className="settings-icon">♫</span><h2>העדפות מוזיקה</h2><p>בחר סגנונות ושפות כדי להתאים את חיפוש ההמלצות.</p><div className="preference-group"><strong>סגנונות</strong>{['פופ','מזרחית','ים תיכוני','חסידי','רוק','היפ הופ','אלקטרוני','אקוסטי'].map(genre => <label key={genre}><input type="checkbox" checked={selectedGenres.includes(genre)} onChange={e => setSelectedGenres(old => e.target.checked ? [...old, genre] : old.filter(item => item !== genre))} />{genre}</label>)}</div><div className="preference-group"><strong>שפות</strong>{[{value:'he',label:'עברית'},{value:'en',label:'אנגלית'}].map(language => <label key={language.value}><input type="checkbox" checked={selectedLanguages.includes(language.value)} onChange={e => setSelectedLanguages(old => e.target.checked ? [...old, language.value] : old.filter(item => item !== language.value))} />{language.label}</label>)}</div><button className="primary" onClick={savePreferences} disabled={loading}>שמור העדפות</button></article><article className="settings-card"><span className="settings-icon">▶</span><h2>YouTube Data API</h2><p>חיבור רשמי להצגת שירים חדשים לפי ערוצי האמנים.</p><span className="pill warning">ממתין למפתח API</span><ol><li>צור פרויקט ב-Google Cloud.</li><li>הפעל YouTube Data API v3.</li><li>צור API Key והוסף אותו ב-Supabase → Edge Functions → Secrets בשם <code>YOUTUBE_API_KEY</code>.</li></ol></article><article className="settings-card"><span className="settings-icon">G</span><h2>חיבור חשבון YouTube</h2><p>קישור חשבון Google לחשבון האתר, עם הרשאה לקריאת רשימת המינויים שלך ב-YouTube.</p><span className="pill warning">דורש הגדרת Google OAuth</span><button className="primary" onClick={connectYouTubeAccount} disabled={loading}>חבר חשבון Google</button><button className="secondary" onClick={importYouTubeSubscriptions} disabled={subscriptionsLoading}>{subscriptionsLoading ? 'טוען מינויים…' : 'ייבא מינויים מ-YouTube'}</button><p className="fine">יש להגדיר Google Provider ב-Supabase ולהפעיל Manual Identity Linking. ההרשאה המבוקשת היא youtube.readonly. אסימון Google נשלח לפונקציית שרת מאומתת ואינו נשמר במסד הנתונים.</p></article></div>}
      {tab === 'connect' && youtubeSubscriptions.length > 0 && <section className="subscriptions-panel"><div className="section-intro"><h2>המינויים שלך ב-YouTube</h2><p>בחר ערוצים להוספה לרשימת האמנים באתר.</p></div><div className="artist-list">{youtubeSubscriptions.map(channel => <div className="artist-row" key={channel.channel_id}><div className="artist-avatar">{channel.thumbnail_url ? <img src={channel.thumbnail_url} alt="" /> : '♫'}</div><div className="artist-copy"><strong>{channel.title}</strong><small>{channel.channel_id}</small></div><a href={channel.channel_url} target="_blank" rel="noreferrer">פתיחת הערוץ ↗</a><button className="primary" onClick={() => importSubscription(channel)} disabled={loading || artists.some(a => a.channel_id === channel.channel_id)}>{artists.some(a => a.channel_id === channel.channel_id) ? 'כבר נוסף' : 'הוסף לאמנים'}</button></div>)}</div></section>}
      <footer>המוזיקה שלי · התוצאות מגיעות מ-YouTube הרשמי · הממשק בעברית</footer>
    </section>
  </main>;
}
