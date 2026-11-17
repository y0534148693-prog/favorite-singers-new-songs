'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Artist = { id: string; channel_id: string; artist_name: string; channel_title: string | null; thumbnail_url: string | null };
type Song = { youtube_video_id: string; title: string; artist_name: string; thumbnail_url: string | null; published_at: string | null; video_url: string; official_confidence?: string; official_label?: string };

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [tab, setTab] = useState<'songs' | 'artists' | 'favorites' | 'connect'>('songs');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteRows, setFavoriteRows] = useState<Song[]>([]);
  const [artistName, setArtistName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [channelResults, setChannelResults] = useState<Array<{channel_id:string;title:string;thumbnail_url:string|null;channel_url:string}>>([]);
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
    } else {
      setArtists([]); setSongs([]); setFavorites([]); setFavoriteRows([]);
    }
  }, [session?.user?.id]);

  async function signInWithGoogle() {
    setLoading(true); setNotice('');
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/youtube.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    setLoading(false);
    if (result.error) setNotice(result.error.message);
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
    const { data, error } = await supabase.from('user_artists').select('id,channel_id,artist_name,channel_title,thumbnail_url').order('added_at', { ascending: false });
    if (error) setNotice(error.message); else setArtists((data ?? []) as Artist[]);
  }

  async function loadFavorites() {
    const { data, error } = await supabase.from('favorite_songs').select('youtube_video_id,title,artist_name,thumbnail_url,published_at,video_url');
    if (!error) {
      setFavorites((data ?? []).map((x: any) => x.youtube_video_id));
      setFavoriteRows((data ?? []).map((x: any) => ({ ...x, official_confidence: 'low' })));
    }
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.access_token}` },
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
    if (error) setNotice(error.code === '23505' ? 'הערוץ כבר נמצא ברשימה.' : error.message);
    else {
      setNotice(channel.title + ' נוסף לרשימת הזמרים.');
      setChannelResults(old => old.filter(item => item.channel_id !== channel.channel_id));
      await loadArtists();
    }
  }

  async function removeArtist(id: string) {
    const { error } = await supabase.from('user_artists').delete().eq('id', id);
    if (error) setNotice(error.message); else await loadArtists();
  }

  async function loadFeed() {
    setLoading(true); setFeedError(''); setNotice('');
    const { data: { session: current } } = await supabase.auth.getSession();
    const endpoint = process.env.NEXT_PUBLIC_YOUTUBE_FEED_URL;
    if (!endpoint || !current) { setLoading(false); setFeedError('חסר חיבור תקין לשירות.'); return; }
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${current.access_token}` } });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) { setFeedError(body.message || 'לא ניתן לטעון שירים כרגע.'); setSongs([]); return; }
    setSongs(body.items ?? []);
    if (body.errors?.length) setFeedError('חלק מהערוצים לא נטענו. אפשר לנסות שוב מאוחר יותר.');
  }

  async function toggleFavorite(song: Song) {
    const isSaved = favorites.includes(song.youtube_video_id);
    if (isSaved) {
      const { error } = await supabase.from('favorite_songs').delete().eq('youtube_video_id', song.youtube_video_id);
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
      <button type="button" className="secondary" onClick={signInWithGoogle} disabled={loading}>התחברות באמצעות Google ו-YouTube</button>
      <p className="fine">חיבור YouTube מבקש הרשאת קריאה בלבד למינויים. שינוי התראות או הרשמה לערוץ יתבצעו ב-YouTube.</p>
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
        <button className={tab === 'connect' ? 'active' : ''} onClick={() => setTab('connect')}>⌁　חיבורים והגדרות</button>
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /> החשבון מחובר<button className="logout" onClick={() => supabase.auth.signOut()}>התנתקות</button></div>
    </aside>

    <section className="content">
      <header className="topbar"><div><p className="eyebrow">שלום, וברוך הבא</p><h1>{tab === 'songs' ? 'השירים החדשים שלך' : tab === 'artists' ? 'הזמרים שלי' : tab === 'favorites' ? 'השירים שאהבת' : 'חיבורים והגדרות'}</h1></div><div className="avatar">{(session.user.email?.[0] ?? 'מ').toUpperCase()}</div></header>
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

      {tab === 'connect' && <div className="settings-grid"><article className="settings-card"><span className="settings-icon">▶</span><h2>YouTube Data API</h2><p>חיבור רשמי להצגת שירים חדשים לפי ערוצי האמנים.</p><span className="pill warning">ממתין למפתח API</span><ol><li>צור פרויקט ב-Google Cloud.</li><li>הפעל YouTube Data API v3.</li><li>צור API Key והוסף אותו ב-Supabase → Edge Functions → Secrets בשם <code>YOUTUBE_API_KEY</code>.</li></ol></article><article className="settings-card"><span className="settings-icon">G</span><h2>Google OAuth</h2><p>חיבור חשבון Google לצפייה במינויים ולפעולות הרשמה מורשות.</p><span className="pill warning">טרם הוגדר</span><p className="fine">יש להגדיר OAuth Client ב-Google Cloud ולהוסיף את Client ID וה-Secret כסודות שרת. אין להזין סודות בדפדפן.</p></article></div>}
      <footer>המוזיקה שלי · התוצאות מגיעות מ-YouTube הרשמי · הממשק בעברית</footer>
    </section>
  </main>;
}
