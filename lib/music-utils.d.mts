export type MusicSong = {
  title?: string;
  artist_name?: string;
  published_at?: string | null;
};
export function normalizeYouTubeChannelId(value: string): string | null;
export function sortSongsNewestFirst<T extends MusicSong>(songs: T[]): T[];
export function filterSongs<T extends MusicSong>(songs: T[], query: string, artist: string): T[];
