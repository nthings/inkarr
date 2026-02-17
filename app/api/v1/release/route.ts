// Release Search API - Search indexers for releases

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import type { ReleaseInfo, SearchResponse, DownloadProtocol } from '@/app/lib/types';

// Debug logging helper - controlled by DEBUG_LOGGING env var
const debug = (...args: unknown[]) => {
  if (process.env.DEBUG_LOGGING === 'true') {
    console.log('[DEBUG]', ...args);
  }
};

/**
 * @swagger
 * /api/v1/release:
 *   get:
 *     summary: Search indexers for releases
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: seriesId
 *         schema:
 *           type: integer
 *         description: Filter by series ID
 *       - in: query
 *         name: volumeId
 *         schema:
 *           type: integer
 *         description: Filter by volume ID
 *       - in: query
 *         name: chapterId
 *         schema:
 *           type: integer
 *         description: Filter by chapter ID
 *       - in: query
 *         name: term
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Search results from indexers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 releases:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       guid: { type: string }
 *                       title: { type: string }
 *                       indexer: { type: string }
 *                       size: { type: integer }
 *                       protocol: { type: string }
 *                       downloadUrl: { type: string }
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const seriesId = searchParams.get('seriesId');
  const volumeId = searchParams.get('volumeId');
  const chapterId = searchParams.get('chapterId');
  const term = searchParams.get('term');
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

  try {
    // Get enabled indexers
    const indexers = await prisma.indexer.findMany({
      where: {
        enableInteractiveSearch: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    if (indexers.length === 0) {
      return NextResponse.json({ releases: [], message: 'No indexers configured' });
    }

    let searchTerm = term;
    let series = null;

    // If seriesId provided, get series info for search
    if (seriesId && !term) {
      series = await prisma.series.findUnique({
        where: { id: parseInt(seriesId, 10) },
        include: {
          volumes: volumeId ? {
            where: { id: parseInt(volumeId, 10) },
          } : false,
          chapters: chapterId ? {
            where: { id: parseInt(chapterId, 10) },
          } : false,
        },
      });

      if (!series) {
        return NextResponse.json({ error: 'Series not found' }, { status: 404 });
      }

      // Build search term from series
      searchTerm = series.title;
      if (volumeId && series.volumes?.[0]) {
        searchTerm += ` v${series.volumes[0].volumeNumber?.toString().padStart(2, '0')}`;
      }
      if (chapterId && series.chapters?.[0]) {
        searchTerm += ` ch${series.chapters[0].chapterNumber}`;
      }
    }

    if (!searchTerm) {
      return NextResponse.json(
        { error: 'Search term or series ID required' },
        { status: 400 }
      );
    }

    // Search all indexers in parallel
    const searchPromises = indexers.map(indexer => 
      searchIndexer(indexer, searchTerm!).catch(error => {
        console.error(`Error searching ${indexer.name}:`, error);
        return { releases: [], indexerId: indexer.id, indexerName: indexer.name };
      })
    );

    const results = await Promise.all(searchPromises);
    
    // Combine and sort releases
    const allReleases: ReleaseInfo[] = [];
    for (const result of results) {
      for (const release of result.releases) {
        release.indexerId = result.indexerId;
        release.indexer = result.indexerName;
        allReleases.push(release);
      }
    }

    // Sort by seeders (for torrents) or date
    allReleases.sort((a, b) => {
      if (a.seeders !== undefined && b.seeders !== undefined) {
        return b.seeders - a.seeders;
      }
      return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });

    return NextResponse.json({
      releases: allReleases,
      total: allReleases.length,
    });
  } catch (error) {
    console.error('Release search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

async function searchIndexer(
  indexer: any,
  term: string
): Promise<SearchResponse> {
  // Route to appropriate search method based on implementation
  switch (indexer.implementation) {
    case 'UNIT3D':
      return searchUnit3d(indexer, term);
    case 'Torznab':
    case 'Newznab':
    default:
      return searchTorznab(indexer, term);
  }
}

async function searchUnit3d(
  indexer: any,
  term: string
): Promise<SearchResponse> {
  const settings = JSON.parse(indexer.settings);
  const { baseUrl, apiKey, categories } = settings;

  // UNIT3D API endpoint: /api/torrents/filter
  const url = new URL(`${baseUrl}/api/torrents/filter`);
  url.searchParams.set('api_token', apiKey);
  
  if (term) {
    url.searchParams.set('name', term);
  }
  
  if (categories?.length > 0) {
    categories.forEach((cat: number) => {
      url.searchParams.append('categories[]', cat.toString());
    });
  }

  debug(`[${indexer.name}] UNIT3D URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Inkarr/1.0',
      'Accept': 'application/json',
    },
  });

  debug(`[${indexer.name}] Status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();
  debug(`[${indexer.name}] Found ${data.data?.length || 0} torrents`);
  
  const releases = parseUnit3dResponse(data, indexer, baseUrl);

  return {
    releases,
    indexerId: indexer.id,
    indexerName: indexer.name,
  };
}

function parseUnit3dResponse(data: any, indexer: any, baseUrl: string): ReleaseInfo[] {
  const releases: ReleaseInfo[] = [];
  
  if (!data.data || !Array.isArray(data.data)) {
    return releases;
  }

  for (const torrent of data.data) {
    const attr = torrent.attributes;
    if (!attr) continue;

    const release: ReleaseInfo = {
      guid: attr.details_link || `${baseUrl}/torrents/${torrent.id}`,
      title: attr.name,
      indexer: indexer.name,
      indexerId: indexer.id,
      downloadUrl: attr.download_link, // Use API-provided download link with passkey
      infoUrl: attr.details_link || `${baseUrl}/torrents/${torrent.id}`,
      publishDate: new Date(attr.created_at),
      size: attr.size || 0,
      protocol: 'TORRENT' as DownloadProtocol,
      seeders: attr.seeders || 0,
      leechers: attr.leechers || 0,
    };

    // Parse release info from title
    const parsed = parseReleaseTitle(attr.name);
    Object.assign(release, parsed);

    releases.push(release);
  }

  return releases;
}

async function searchTorznab(
  indexer: any,
  term: string
): Promise<SearchResponse> {
  const settings = JSON.parse(indexer.settings);
  const { baseUrl, apiPath, apiKey, categories } = settings;

  // Build search URL - use apiPath if provided, otherwise default to /api
  const path = apiPath !== undefined ? apiPath : '/api';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('t', 'search');
  url.searchParams.set('q', term);
  url.searchParams.set('limit', '100'); // Request max results
  
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }
  
  if (categories?.length > 0) {
    url.searchParams.set('cat', categories.join(','));
  }

  debug(`[${indexer.name}] Torznab URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Inkarr/1.0',
    },
  });

  debug(`[${indexer.name}] Status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const xml = await response.text();
  debug(`[${indexer.name}] Response (first 1000 chars):`, xml.substring(0, 1000));
  
  const releases = await parseReleases(xml, indexer.protocol as DownloadProtocol);
  debug(`[${indexer.name}] Parsed ${releases.length} releases`);

  return {
    releases,
    indexerId: indexer.id,
    indexerName: indexer.name,
  };
}

async function parseReleases(xml: string, protocol: DownloadProtocol): Promise<ReleaseInfo[]> {
  // Simple XML parsing for Newznab/Torznab responses
  const releases: ReleaseInfo[] = [];
  
  // Parse items from RSS feed
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const guid = extractTag(itemXml, 'guid') || '';
    const title = extractTag(itemXml, 'title') || '';
    const link = extractTag(itemXml, 'link') || '';
    const pubDate = extractTag(itemXml, 'pubDate') || '';
    const size = extractNewznabAttr(itemXml, 'size');
    const seeders = extractNewznabAttr(itemXml, 'seeders');
    const peers = extractNewznabAttr(itemXml, 'peers');
    const infoHash = extractNewznabAttr(itemXml, 'infohash');
    const comments = extractTag(itemXml, 'comments');

    if (title && (link || guid)) {
      const release: ReleaseInfo = {
        guid,
        title,
        indexer: '',
        indexerId: 0,
        downloadUrl: link || guid,
        infoUrl: comments?.replace(/#comments$/, ''),
        commentUrl: comments,
        publishDate: new Date(pubDate),
        size: size ? parseInt(size, 10) : 0,
        protocol,
      };

      if (protocol === 'TORRENT') {
        if (seeders) release.seeders = parseInt(seeders, 10);
        if (peers) release.leechers = parseInt(peers, 10) - (release.seeders || 0);
        if (infoHash) release.infoHash = infoHash;
      }

      // Parse release info from title
      const parsed = parseReleaseTitle(title);
      Object.assign(release, parsed);

      releases.push(release);
    }
  }

  return releases;
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? (match[1] || match[2])?.trim() : undefined;
}

function extractNewznabAttr(xml: string, name: string): string | undefined {
  const regex = new RegExp(`<newznab:attr\\s+name="${name}"\\s+value="([^"]*)"`, 'i');
  const match = regex.exec(xml);
  if (!match) {
    // Try torznab namespace
    const torznabRegex = new RegExp(`<torznab:attr\\s+name="${name}"\\s+value="([^"]*)"`, 'i');
    const torznabMatch = torznabRegex.exec(xml);
    return torznabMatch?.[1];
  }
  return match?.[1];
}

function parseReleaseTitle(title: string): Partial<ReleaseInfo> {
  const result: Partial<ReleaseInfo> = {};

  // Extract volume number: v01, vol.1, volume 1
  const volumeMatch = title.match(/\bv(?:ol(?:ume)?\.?\s*)?(\d+)\b/i);
  if (volumeMatch) {
    result.volumeNumber = parseInt(volumeMatch[1], 10);
  }

  // Extract chapter numbers: ch01, ch.1-5, chapter 1
  const chapterMatch = title.match(/\bch(?:apter)?\.?\s*(\d+)(?:\s*-\s*(\d+))?\b/i);
  if (chapterMatch) {
    const start = parseInt(chapterMatch[1], 10);
    const end = chapterMatch[2] ? parseInt(chapterMatch[2], 10) : start;
    result.chapterNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  // Extract release group: [Group]
  const groupMatch = title.match(/^\[([^\]]+)\]/);
  if (groupMatch) {
    result.releaseGroup = groupMatch[1];
  }

  // Extract quality indicators
  const qualityIndicators = ['digital', 'scan', 'raw', 'webrip', 'c2c'];
  for (const q of qualityIndicators) {
    if (title.toLowerCase().includes(q)) {
      result.quality = q.toUpperCase();
      break;
    }
  }

  return result;
}
