import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSongs, normalizeYouTubeChannelId, sortSongsNewestFirst } from '../lib/music-utils.mjs';

test('normalizes valid channel IDs and canonical channel URLs', () => {
  const id = 'UC' + 'a'.repeat(22);
  assert.equal(normalizeYouTubeChannelId(id), id);
  assert.equal(normalizeYouTubeChannelId('https://www.youtube.com/channel/' + id), id);
  assert.equal(normalizeYouTubeChannelId('https://youtube.com/channel/' + id + '?feature=shared'), id);
});

test('rejects handles, malformed IDs and unrelated URLs rather than guessing', () => {
  assert.equal(normalizeYouTubeChannelId('@artist'), null);
  assert.equal(normalizeYouTubeChannelId('UC-too-short'), null);
  assert.equal(normalizeYouTubeChannelId('https://example.com/channel/UC' + 'a'.repeat(22)), null);
});

test('sorts newest songs first and keeps invalid dates last', () => {
  const songs = [
    { title: 'old', published_at: '2025-01-01T00:00:00Z' },
    { title: 'new', published_at: '2026-01-01T00:00:00Z' },
    { title: 'unknown', published_at: null },
  ];
  assert.deepEqual(sortSongsNewestFirst(songs).map(song => song.title), ['new', 'old', 'unknown']);
  assert.equal(songs[0].title, 'old', 'sorting must not mutate the source array');
});

test('filters songs by case-insensitive title/artist and selected artist', () => {
  const songs = [
    { title: 'New Song', artist_name: 'Artist One' },
    { title: 'Another Track', artist_name: 'Artist Two' },
    { title: 'new remix', artist_name: 'Artist Two' },
  ];
  assert.deepEqual(filterSongs(songs, 'NEW', 'all').map(song => song.title), ['New Song', 'new remix']);
  assert.deepEqual(filterSongs(songs, '', 'Artist Two').map(song => song.title), ['Another Track', 'new remix']);
});
