const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * Accept a YouTube channel ID or a canonical /channel/ URL.
 * Handles and display names are intentionally not guessed into IDs.
 */
export function normalizeYouTubeChannelId(value) {
  const input = String(value ?? '').trim();
  if (CHANNEL_ID_PATTERN.test(input)) return input;

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\\./, '');
    if (!['youtube.com', 'm.youtube.com'].includes(host)) return null;
    const match = url.pathname.match(/^\\/channel\\/(UC[A-Za-z0-9_-]{22})\\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** @param {Array<{published_at?: string|null}>} songs */
export function sortSongsNewestFirst(songs) {
  return [...songs].sort((left, right) => {
    const leftTime = left.published_at ? Date.parse(left.published_at) : Number.NaN;
    const rightTime = right.published_at ? Date.parse(right.published_at) : Number.NaN;
    const validLeft = Number.isFinite(leftTime);
    const validRight = Number.isFinite(rightTime);
    if (validLeft && validRight) return rightTime - leftTime;
    if (validLeft) return -1;
    if (validRight) return 1;
    return 0;
  });
}

/**
 * @template {{title?: string, artist_name?: string}} T
 * @param {T[]} songs
 * @param {string} query
 * @param {string} artist
 * @returns {T[]}
 */
export function filterSongs(songs, query, artist) {
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase();
  return songs.filter(song => {
    const matchesArtist = artist === 'all' || song.artist_name === artist;
    const searchable = `${song.title ?? ''} ${song.artist_name ?? ''}`.toLocaleLowerCase();
    return matchesArtist && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}
