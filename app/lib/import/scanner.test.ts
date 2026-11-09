// Run: npx tsx --test app/lib/import/scanner.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilename, applyContextHints } from './scanner';
import { replaceTokens, DEFAULT_NAMING_CONFIG, type NamingConfig } from '../naming';

const pick = (f: string, hint?: string) => {
  const p = parseFilename(f, hint);
  return { title: p.seriesTitle, vol: p.volumeNumber, ch: p.chapterNumber };
};

test('chapter filenames are chapters, not volumes', () => {
  assert.deepEqual(pick('Naruto - Chapter 100.cbz'), { title: 'Naruto', vol: undefined, ch: 100 });
  assert.deepEqual(pick('Naruto Ch 12.5.cbz'), { title: 'Naruto', vol: undefined, ch: 12.5 });
  assert.deepEqual(pick('Dandadan - Vol.004 - Ch.010.cbz'), { title: 'Dandadan', vol: 4, ch: 10 });
  assert.deepEqual(pick('Dandadan - Vol.004.cbz'), { title: 'Dandadan', vol: 4, ch: undefined });
});

test('bare trailing number is an issue for comics, a volume otherwise', () => {
  assert.deepEqual(pick('The Walking Dead - 001.pdf', 'COMIC'), { title: 'The Walking Dead', vol: undefined, ch: 1 });
  assert.deepEqual(pick('Dandadan - 004.cbz', 'MANGA'), { title: 'Dandadan', vol: 4, ch: undefined });
});

test('ComicInfo <Number> is a chapter unless the release is a volume', () => {
  const chapterFile = parseFilename('Naruto - Chapter 100.cbz');
  applyContextHints(chapterFile, { number: '100' });
  assert.equal(chapterFile.volumeNumber, undefined);
  assert.equal(chapterFile.chapterNumber, 100);

  const volumeFile = parseFilename('Dandadan - Vol.004.cbz');
  applyContextHints(volumeFile, { number: '4', title: 'Volume 004' });
  assert.equal(volumeFile.volumeNumber, 4);
  assert.equal(volumeFile.chapterNumber, undefined);

  const explicit = parseFilename('whatever.cbz');
  applyContextHints(explicit, { volume: 3, number: '21' });
  assert.equal(explicit.volumeNumber, 3);
  assert.equal(explicit.chapterNumber, 21);
});

test('"volumes" outside the pack range are loose chapters', () => {
  const folder = 'Dandadan [Vol.1 - Vol.18][Worms-Organization][CBZ]';
  const loose = parseFilename('Dandadan - Vol.159.cbz');
  applyContextHints(loose, undefined, folder);
  assert.equal(loose.volumeNumber, undefined);
  assert.equal(loose.chapterNumber, 159);

  const inRange = parseFilename('Dandadan - Vol.004.cbz');
  applyContextHints(inRange, undefined, folder);
  assert.equal(inRange.volumeNumber, 4);
});

test('default naming is unambiguous and round-trips through the parser', () => {
  const cfg = { id: 1, ...DEFAULT_NAMING_CONFIG } as NamingConfig;
  const fmt = cfg.standardFileFormat;
  const vol = replaceTokens(fmt, { seriesTitle: 'Dandadan', volumeNumber: 4 }, cfg);
  const ch = replaceTokens(fmt, { seriesTitle: 'The Walking Dead', chapterNumber: 1 }, cfg);
  const both = replaceTokens(fmt, { seriesTitle: 'Dandadan', volumeNumber: 4, chapterNumber: 10.5 }, cfg);
  assert.equal(vol, 'Dandadan - Vol.004');
  assert.equal(ch, 'The Walking Dead - Ch.001');
  assert.equal(both, 'Dandadan - Vol.004 - Ch.10.5');
  assert.deepEqual(pick(vol + '.cbz'), { title: 'Dandadan', vol: 4, ch: undefined });
  assert.deepEqual(pick(ch + '.pdf'), { title: 'The Walking Dead', vol: undefined, ch: 1 });
  assert.deepEqual(pick(both + '.cbz'), { title: 'Dandadan', vol: 4, ch: 10.5 });
});
