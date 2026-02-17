// Automatic Search Service
// Handles searching for missing items and automatic grabbing

import prisma from '@/app/lib/db';
import type { ReleaseInfo, DownloadProtocol } from '@/app/lib/types';

interface SearchResult {
  seriesId: number;
  seriesTitle: string;
  volumeId?: number;
  volumeNumber?: number;
  searchTerm: string;
  releases: ReleaseInfo[];
  grabbed: boolean;
  grabbedRelease?: ReleaseInfo;
  error?: string;
}

interface AutoSearchOptions {
  /** Maximum releases to search for in one run */
  maxSearches?: number;
  /** Minimum delay between searches (ms) */
  searchDelayMs?: number;
  /** Whether to auto-grab best matches */
  autoGrab?: boolean;
}

const DEFAULT_OPTIONS: Required<AutoSearchOptions> = {
  maxSearches: 10,
  searchDelayMs: 2000,
  autoGrab: true,
};

/**
 * Search for a single volume and optionally grab the best match
 */
export async function searchVolume(
  series: { id: number; title: string },
  volume: { id: number; volumeNumber: number | null },
  autoGrab: boolean = true
): Promise<SearchResult> {
  const searchTerm = buildSearchTerm(series.title, volume.volumeNumber);
  
  const result: SearchResult = {
    seriesId: series.id,
    seriesTitle: series.title,
    volumeId: volume.id,
    volumeNumber: volume.volumeNumber ?? undefined,
    searchTerm,
    releases: [],
    grabbed: false,
  };
  
  try {
    // Get enabled indexers for automatic search
    const indexers = await prisma.indexer.findMany({
      where: { enableAutomaticSearch: true },
      orderBy: { priority: 'asc' },
    });
    
    if (indexers.length === 0) {
      result.error = 'No indexers configured for automatic search';
      return result;
    }
    
    // Search all indexers
    const allReleases: ReleaseInfo[] = [];
    
    for (const indexer of indexers) {
      try {
        const releases = await searchIndexer(indexer, searchTerm);
        allReleases.push(...releases);
      } catch (error) {
        console.error(`[AutoSearch] Search failed for ${indexer.name}:`, error);
      }
    }
    
    result.releases = allReleases;
    
    // Sort by seeders (descending) for torrents
    allReleases.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
    
    // Auto-grab best match if enabled and releases found
    if (autoGrab && allReleases.length > 0) {
      const bestRelease = selectBestRelease(allReleases, series.title, volume.volumeNumber);
      
      if (bestRelease) {
        const grabbed = await grabRelease(bestRelease, series.id, volume.id);
        if (grabbed) {
          result.grabbed = true;
          result.grabbedRelease = bestRelease;
        }
      }
    }
    
    return result;
  } catch (error) {
    result.error = String(error);
    return result;
  }
}

/**
 * Search for all missing volumes across monitored series
 */
export async function searchAllMissing(options: AutoSearchOptions = {}): Promise<{
  searched: number;
  grabbed: number;
  results: SearchResult[];
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: SearchResult[] = [];
  let grabbed = 0;
  
  // Get monitored series with their volumes and media files
  const monitoredSeries = await prisma.series.findMany({
    where: {
      monitored: true,
      monitorStatus: { not: 'NONE' },
    },
    include: {
      volumes: {
        where: { monitored: true },
        orderBy: { volumeNumber: 'asc' },
      },
      mediaFiles: {
        select: { volumeId: true },
      },
    },
  });
  
  let searchCount = 0;
  
  for (const series of monitoredSeries) {
    if (searchCount >= opts.maxSearches) break;
    
    // Find volumes without media files
    const existingVolumeIds = new Set(
      series.mediaFiles
        .filter(mf => mf.volumeId !== null)
        .map(mf => mf.volumeId)
    );
    
    const missingVolumes = series.volumes.filter(
      vol => !existingVolumeIds.has(vol.id)
    );
    
    for (const volume of missingVolumes) {
      if (searchCount >= opts.maxSearches) break;
      
      const result = await searchVolume(
        { id: series.id, title: series.title },
        { id: volume.id, volumeNumber: volume.volumeNumber },
        opts.autoGrab
      );
      
      results.push(result);
      
      if (result.grabbed) {
        grabbed++;
      }
      
      searchCount++;
      
      // Delay between searches to avoid rate limiting
      if (searchCount < opts.maxSearches) {
        await sleep(opts.searchDelayMs);
      }
    }
  }
  
  return {
    searched: searchCount,
    grabbed,
    results,
  };
}

/**
 * Build search term from series title and volume number
 */
function buildSearchTerm(seriesTitle: string, volumeNumber: number | null): string {
  let term = seriesTitle;
  
  if (volumeNumber !== null) {
    // Add volume number in common formats
    const volStr = volumeNumber.toString().padStart(2, '0');
    term += ` v${volStr}`;
  }
  
  return term;
}

/**
 * Search a single indexer
 */
async function searchIndexer(indexer: any, term: string): Promise<ReleaseInfo[]> {
  const settings = JSON.parse(indexer.settings);
  
  switch (indexer.implementation) {
    case 'UNIT3D':
      return searchUnit3d(indexer, settings, term);
    case 'Torznab':
    case 'Newznab':
    default:
      return searchTorznab(indexer, settings, term);
  }
}

async function searchTorznab(indexer: any, settings: any, term: string): Promise<ReleaseInfo[]> {
  const { baseUrl, apiPath, apiKey, categories } = settings;
  
  const path = apiPath ?? '/api';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('t', 'search');
  url.searchParams.set('q', term);
  url.searchParams.set('limit', '50');
  
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }
  
  if (categories?.length > 0) {
    url.searchParams.set('cat', categories.join(','));
  }
  
  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Inkarr/1.0' },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const text = await response.text();
  return parseTorznabResponse(text, indexer);
}

async function searchUnit3d(indexer: any, settings: any, term: string): Promise<ReleaseInfo[]> {
  const { baseUrl, apiKey, categories } = settings;
  
  const url = new URL(`${baseUrl}/api/torrents/filter`);
  url.searchParams.set('api_token', apiKey);
  url.searchParams.set('name', term);
  
  if (categories?.length > 0) {
    categories.forEach((cat: number) => {
      url.searchParams.append('categories[]', cat.toString());
    });
  }
  
  const response = await fetch(url.toString(), {
    headers: { 
      'User-Agent': 'Inkarr/1.0',
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  return parseUnit3dResponse(data, indexer, baseUrl);
}

function parseTorznabResponse(xml: string, indexer: any): ReleaseInfo[] {
  // Simple XML parsing - in production would use xml2js
  const releases: ReleaseInfo[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const guid = extractTag(item, 'guid') || link;
    const pubDate = extractTag(item, 'pubDate');
    const size = extractAttr(item, 'size') || extractAttr(item, 'length');
    const seeders = extractAttr(item, 'seeders');
    const leechers = extractAttr(item, 'peers');
    
    if (title && link) {
      releases.push({
        guid: guid || link,
        title,
        indexer: indexer.name,
        indexerId: indexer.id,
        downloadUrl: link,
        publishDate: pubDate ? new Date(pubDate) : new Date(),
        size: parseInt(size || '0', 10),
        protocol: indexer.protocol as DownloadProtocol,
        seeders: seeders ? parseInt(seeders, 10) : undefined,
        leechers: leechers ? parseInt(leechers, 10) : undefined,
      });
    }
  }
  
  return releases;
}

function parseUnit3dResponse(data: any, indexer: any, baseUrl: string): ReleaseInfo[] {
  const releases: ReleaseInfo[] = [];
  
  if (!data.data || !Array.isArray(data.data)) {
    return releases;
  }
  
  for (const torrent of data.data) {
    const attr = torrent.attributes;
    if (!attr) continue;
    
    releases.push({
      guid: attr.details_link || `${baseUrl}/torrents/${torrent.id}`,
      title: attr.name,
      indexer: indexer.name,
      indexerId: indexer.id,
      downloadUrl: attr.download_link,
      infoUrl: attr.details_link,
      publishDate: new Date(attr.created_at),
      size: attr.size || 0,
      protocol: 'TORRENT' as DownloadProtocol,
      seeders: attr.seeders || 0,
      leechers: attr.leechers || 0,
    });
  }
  
  return releases;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`);
  const match = xml.match(regex);
  return match ? (match[1] || match[2] || null) : null;
}

function extractAttr(xml: string, attr: string): string | null {
  const regex = new RegExp(`<newznab:attr name="${attr}" value="([^"]*)"`, 'i');
  const match = xml.match(regex);
  if (match) return match[1];
  
  // Also try torznab namespace
  const torznabRegex = new RegExp(`<torznab:attr name="${attr}" value="([^"]*)"`, 'i');
  const torznabMatch = xml.match(torznabRegex);
  return torznabMatch ? torznabMatch[1] : null;
}

/**
 * Select the best release from a list of candidates
 */
function selectBestRelease(
  releases: ReleaseInfo[],
  seriesTitle: string,
  volumeNumber: number | null
): ReleaseInfo | null {
  if (releases.length === 0) return null;
  
  // Score each release
  const scored = releases.map(release => ({
    release,
    score: scoreRelease(release, seriesTitle, volumeNumber),
  }));
  
  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);
  
  // Return best match if score is above threshold
  const best = scored[0];
  if (best && best.score >= 50) {
    return best.release;
  }
  
  return null;
}

/**
 * Score a release based on how well it matches what we're looking for
 */
function scoreRelease(
  release: ReleaseInfo,
  seriesTitle: string,
  volumeNumber: number | null
): number {
  let score = 0;
  const titleLower = release.title.toLowerCase();
  const searchLower = seriesTitle.toLowerCase();
  
  // Title match
  if (titleLower.includes(searchLower)) {
    score += 50;
  } else {
    // Partial match - check words
    const searchWords = searchLower.split(/\s+/);
    const matchedWords = searchWords.filter(w => titleLower.includes(w));
    score += (matchedWords.length / searchWords.length) * 40;
  }
  
  // Volume number match
  if (volumeNumber !== null) {
    const volPatterns = [
      new RegExp(`v${volumeNumber}\\b`, 'i'),
      new RegExp(`vol\\.?\\s*${volumeNumber}\\b`, 'i'),
      new RegExp(`volume\\s*${volumeNumber}\\b`, 'i'),
      new RegExp(`v${volumeNumber.toString().padStart(2, '0')}\\b`, 'i'),
    ];
    
    if (volPatterns.some(p => p.test(release.title))) {
      score += 30;
    }
  }
  
  // Prefer releases with more seeders (for torrents)
  if (release.seeders !== undefined && release.seeders > 0) {
    score += Math.min(release.seeders / 10, 10);
  }
  
  // Penalize if title contains unwanted terms
  const unwantedTerms = ['raw', 'raws', 'webrip', 'hdtv', 'hardsub'];
  if (unwantedTerms.some(t => titleLower.includes(t))) {
    score -= 10;
  }
  
  // Prefer CBZ format
  if (titleLower.includes('cbz')) {
    score += 5;
  }
  
  return score;
}

/**
 * Grab a release by sending it to a download client
 */
async function grabRelease(
  release: ReleaseInfo,
  seriesId: number,
  volumeId?: number
): Promise<boolean> {
  try {
    // Find an enabled download client for the protocol
    const downloadClient = await prisma.downloadClient.findFirst({
      where: {
        enable: true,
        protocol: release.protocol,
      },
      orderBy: { priority: 'asc' },
    });
    
    if (!downloadClient) {
      console.error(`[AutoSearch] No download client for protocol ${release.protocol}`);
      return false;
    }
    
    const settings = JSON.parse(downloadClient.settings);
    
    // Send to download client
    let success = false;
    
    switch (downloadClient.implementation) {
      case 'qBittorrent':
        success = await sendToQBittorrent(settings, release.downloadUrl);
        break;
      case 'Transmission':
        success = await sendToTransmission(settings, release.downloadUrl);
        break;
      default:
        console.log(`[AutoSearch] Download client ${downloadClient.implementation} not supported for auto-grab`);
        return false;
    }
    
    if (success) {
      // Create queue item
      await prisma.queueItem.create({
        data: {
          seriesId,
          volumeId,
          downloadClientId: downloadClient.id,
          title: release.title,
          size: BigInt(release.size),
          status: 'QUEUED',
          protocol: release.protocol as any,
          indexer: release.indexer,
          downloadId: release.guid,
        },
      });
      
      // Create history entry for grab
      await prisma.history.create({
        data: {
          seriesId,
          volumeId,
          sourceTitle: release.title,
          eventType: 'GRABBED',
          downloadId: release.guid,
          data: JSON.stringify({
            indexer: release.indexer,
            size: release.size,
            downloadUrl: release.downloadUrl,
          }),
        },
      });
      
      console.log(`[AutoSearch] Grabbed: ${release.title}`);
    }
    
    return success;
  } catch (error) {
    console.error(`[AutoSearch] Failed to grab ${release.title}:`, error);
    return false;
  }
}

async function sendToQBittorrent(settings: any, url: string): Promise<boolean> {
  try {
    const baseUrl = `${settings.useSsl ? 'https' : 'http'}://${settings.host}:${settings.port}`;
    
    // Authenticate
    const loginRes = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: settings.username || '',
        password: settings.password || '',
      }),
    });
    
    if (!loginRes.ok) return false;
    const cookies = loginRes.headers.get('set-cookie');
    
    // Add torrent
    const formData = new FormData();
    formData.append('urls', url);
    formData.append('category', settings.category || 'inkarr');
    formData.append('tags', 'inkarr');
    
    const addRes = await fetch(`${baseUrl}/api/v2/torrents/add`, {
      method: 'POST',
      headers: cookies ? { Cookie: cookies } : {},
      body: formData,
    });
    
    return addRes.ok;
  } catch {
    return false;
  }
}

async function sendToTransmission(settings: any, url: string): Promise<boolean> {
  try {
    const baseUrl = `${settings.useSsl ? 'https' : 'http'}://${settings.host}:${settings.port}/transmission/rpc`;
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.username && settings.password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
    }
    
    // Get session ID
    const sessionRes = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method: 'session-get' }),
    });
    
    let sessionId = '';
    if (sessionRes.status === 409) {
      sessionId = sessionRes.headers.get('x-transmission-session-id') || '';
    }
    
    if (sessionId) {
      headers['X-Transmission-Session-Id'] = sessionId;
    }
    
    // Add torrent
    const addRes = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        method: 'torrent-add',
        arguments: {
          filename: url,
          labels: ['inkarr'],
        },
      }),
    });
    
    if (!addRes.ok) return false;
    const data = await addRes.json();
    return data.result === 'success';
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
