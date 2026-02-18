/**
 * Image Cache Utilities
 * 
 * Pre-fetches and caches external images to avoid rate limiting from metadata
 * providers (MangaDex, AniList, ComicVine, etc.) when loading cover images.
 * 
 * Features:
 * - Local file cache with 90-day TTL
 * - Rate limiting (500ms between requests per domain)
 * - Security whitelist for allowed domains
 * - Background batch prefetching for scheduled tasks
 * 
 * Usage:
 * ```typescript
 * import { prefetchImages, prefetchSeriesCovers, isImageCached } from '@/app/lib/image-cache';
 * 
 * // Check if image is cached
 * if (!isImageCached(url)) {
 *   await prefetchImages([url]);
 * }
 * 
 * // Prefetch all covers for a series
 * await prefetchSeriesCovers({ imageUrl: '...', volumes: [...] });
 * ```
 * 
 * Cache Location: data/.image-cache/
 * 
 * @module image-cache
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// Cache directory for images
const CACHE_DIR = join(process.cwd(), 'data', '.image-cache');

// Cache TTL in milliseconds (90 days - covers rarely change)
const CACHE_TTL = 90 * 24 * 60 * 60 * 1000;

// Rate limiting - delay between requests to avoid rate limiting
const FETCH_DELAY_MS = 500;

// Allowed domains for security
const ALLOWED_DOMAINS = [
  'uploads.mangadex.org',
  'mangadex.org',
  'cdn.myanimelist.net',
  's4.anilist.co',
  'media.kitsu.io',
  'comicvine.gamespot.com',
  'static.comicvine.com',
];

// Ensure cache directory exists
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Generate cache key from URL
function getCacheKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Check if image is already cached and valid
export function isImageCached(url: string): boolean {
  const cacheKey = getCacheKey(url);
  const cachePath = join(CACHE_DIR, cacheKey);
  const metaPath = join(CACHE_DIR, `${cacheKey}.meta`);

  if (!existsSync(cachePath) || !existsSync(metaPath)) {
    return false;
  }

  try {
    const stats = statSync(cachePath);
    const age = Date.now() - stats.mtimeMs;
    return age <= CACHE_TTL;
  } catch {
    return false;
  }
}

// Fetch and cache a single image
async function fetchAndCacheImage(url: string): Promise<boolean> {
  const cacheKey = getCacheKey(url);
  const cachePath = join(CACHE_DIR, cacheKey);
  const metaPath = join(CACHE_DIR, `${cacheKey}.meta`);

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    
    // Security check
    if (!ALLOWED_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain))) {
      console.log(`[ImageCache] Domain not allowed: ${parsedUrl.hostname}`);
      return false;
    }

    // Fetch image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Inkarr/1.0 (Media Server)',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      console.log(`[ImageCache] Failed to fetch (${response.status}): ${url}`);
      return false;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    // Ensure cache dir exists
    ensureCacheDir();

    // Write to cache
    writeFileSync(cachePath, buffer);
    writeFileSync(metaPath, JSON.stringify({ contentType, url }));

    return true;
  } catch (error) {
    console.error(`[ImageCache] Error caching ${url}:`, error);
    return false;
  }
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-fetch and cache multiple images with rate limiting
 * Returns the number of images successfully cached
 */
export async function prefetchImages(urls: string[]): Promise<{ cached: number; skipped: number; failed: number }> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (const url of urls) {
    if (!url) {
      continue;
    }

    // Skip if already cached
    if (isImageCached(url)) {
      skipped++;
      continue;
    }

    // Fetch and cache with delay
    const success = await fetchAndCacheImage(url);
    if (success) {
      cached++;
    } else {
      failed++;
    }

    // Rate limit delay between requests
    await sleep(FETCH_DELAY_MS);
  }

  return { cached, skipped, failed };
}

/**
 * Pre-fetch covers for a series (main cover + all volume covers)
 */
export async function prefetchSeriesCovers(series: {
  imageUrl?: string | null;
  volumes?: Array<{ imageUrl?: string | null }>;
}): Promise<{ cached: number; skipped: number; failed: number }> {
  const urls: string[] = [];

  // Add series cover
  if (series.imageUrl) {
    urls.push(series.imageUrl);
  }

  // Add volume covers
  for (const volume of series.volumes || []) {
    if (volume.imageUrl) {
      urls.push(volume.imageUrl);
    }
  }

  console.log(`[ImageCache] Pre-fetching ${urls.length} images for series`);
  return prefetchImages(urls);
}
