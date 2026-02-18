/**
 * Image Proxy API
 * 
 * Proxies external cover images through our backend to:
 * 1. Avoid rate limiting from metadata providers (MangaDex, AniList, etc.)
 * 2. Cache images locally for 90 days
 * 3. Provide consistent browser caching headers
 * 
 * This endpoint is called by the frontend when displaying cover images.
 * Images are also pre-fetched in the background by scheduled tasks and
 * during series refresh operations.
 * 
 * Cache location: data/.image-cache/
 * Cache TTL: 90 days (server) + 7 days (browser)
 * Rate limit: 500ms between requests to same domain
 * 
 * Security: Only whitelisted domains are allowed to prevent SSRF attacks.
 * 
 * @see {@link file://../../../lib/image-cache.ts} for prefetch utilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// Cache directory for images
const CACHE_DIR = join(process.cwd(), 'data', '.image-cache');

// Cache TTL in milliseconds (90 days - covers rarely change)
const CACHE_TTL = 90 * 24 * 60 * 60 * 1000;

// Rate limiting - track last request time per domain
const lastRequestTime = new Map<string, number>();
const MIN_REQUEST_INTERVAL = 500; // ms between requests to same domain (more conservative for batch operations)

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

// Get cached image if exists and not expired
function getCachedImage(cacheKey: string): { data: Buffer; contentType: string } | null {
  const cachePath = join(CACHE_DIR, cacheKey);
  const metaPath = join(CACHE_DIR, `${cacheKey}.meta`);

  if (!existsSync(cachePath) || !existsSync(metaPath)) {
    return null;
  }

  try {
    const stats = statSync(cachePath);
    const age = Date.now() - stats.mtimeMs;

    // Check if cache is still valid
    if (age > CACHE_TTL) {
      return null;
    }

    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const data = readFileSync(cachePath);

    return { data, contentType: meta.contentType || 'image/jpeg' };
  } catch {
    return null;
  }
}

// Save image to cache
function cacheImage(cacheKey: string, data: Buffer, contentType: string) {
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, cacheKey);
  const metaPath = join(CACHE_DIR, `${cacheKey}.meta`);

  try {
    writeFileSync(cachePath, data);
    writeFileSync(metaPath, JSON.stringify({ contentType }));
  } catch (error) {
    console.error('Failed to cache image:', error);
  }
}

// Rate limit requests to external domains
async function waitForRateLimit(domain: string) {
  const lastTime = lastRequestTime.get(domain) || 0;
  const elapsed = Date.now() - lastTime;

  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
  }

  lastRequestTime.set(domain, Date.now());
}

/**
 * @swagger
 * /api/v1/image-proxy:
 *   get:
 *     summary: Proxy external images with caching
 *     description: Fetches and caches external images to avoid rate limiting
 *     tags: [System]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL of the image to proxy
 *     responses:
 *       200:
 *         description: The proxied image
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: URL parameter missing
 *       502:
 *         description: Failed to fetch external image
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Only allow certain domains (security measure)
  const allowedDomains = [
    'uploads.mangadex.org',
    'mangadex.org',
    'cdn.myanimelist.net',
    's4.anilist.co',
    'media.kitsu.io',
    'comicvine.gamespot.com',
    'static.comicvine.com',
  ];

  if (!allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain))) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  const cacheKey = getCacheKey(url);

  // Try to get from cache first
  const cached = getCachedImage(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.data), {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=604800', // 7 days
        'X-Cache': 'HIT',
      },
    });
  }

  // Rate limit before fetching
  await waitForRateLimit(parsedUrl.hostname);

  // Fetch from external source
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Inkarr/1.0 (Media Server)',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      console.error(`Image proxy failed: ${response.status} for ${url}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    // Cache the image
    cacheImage(cacheKey, buffer, contentType);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800', // 7 days
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image' },
      { status: 502 }
    );
  }
}
