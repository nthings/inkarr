// Series Refresh API - Fetch/update issues from metadata providers

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { prefetchImages } from '@/app/lib/image-cache';
import type { 
  ComicVineApiResponse, 
  ComicVineIssue,
  ComicVineVolume,
} from '@/app/lib/types';

const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY || '761affae16396d3da42c55139c60dc73c0e0314f';
const ANILIST_API = 'https://graphql.anilist.co';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface VolumeInfo {
  foreignId: string;
  title?: string;
  volumeNumber: number;
  releaseDate?: Date;
  imageUrl?: string;
}

interface IssueInfo {
  foreignId: string;
  title?: string;
  issueNumber?: string;
  chapterNumber?: number;
  overview?: string;
  releaseDate?: Date;
  pageCount?: number;
  imageUrl?: string;
}

interface RefreshResult {
  provider: string;
  volumes: VolumeInfo[];
  chapters: IssueInfo[];
}

/**
 * @swagger
 * /api/v1/series/{id}/refresh:
 *   post:
 *     summary: Refresh series metadata from external provider
 *     tags: [Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Series ID
 *     responses:
 *       200:
 *         description: Refresh results with added/updated volumes and chapters
 *       404:
 *         description: Series not found
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const seriesId = parseInt(id, 10);
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      );
    }

    // Get series from database
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        chapters: true,
        volumes: true,
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    let result: RefreshResult | null = null;
    let extractedAnilistId: string | undefined;
    let extractedCvId: string | undefined;

    // Determine which provider to use based on metadata IDs
    if (series.comicVineId) {
      // ComicVine for comics
      result = await fetchFromComicVine(series.comicVineId);
    } else if (series.foreignId?.startsWith('comicvine-')) {
      extractedCvId = series.foreignId.replace('comicvine-', '');
      result = await fetchFromComicVine(extractedCvId);
    } else {
      // For manga: Try MangaDex first (has unique volume covers), fall back to Anilist
      const isMangaSeries = series.malId || series.anilistId || series.foreignId?.startsWith('anilist-');
      
      if (isMangaSeries) {
        // Extract anilist ID if from foreignId
        if (series.foreignId?.startsWith('anilist-')) {
          extractedAnilistId = series.foreignId.replace('anilist-', '');
        }
        
        // Try MangaDex first - has better per-volume cover art
        console.log('=== TRYING MANGADEX (PRIMARY) ===');
        const mangaDexResult = await fetchFromMangaDex(
          series.title,
          series.malId || undefined
        );
        
        if (mangaDexResult && mangaDexResult.volumes.length > 0) {
          console.log(`MangaDex: Found ${mangaDexResult.volumes.length} volumes with unique covers`);
          result = mangaDexResult;
        } else {
          console.log('MangaDex: No volumes found, falling back to Anilist...');
          // Fall back to Anilist
          if (series.malId) {
            result = await fetchFromAnilist(series.malId, series.volumeCount || 0, series.chapterCount || 0);
          } else if (extractedAnilistId || series.anilistId) {
            const anilistId = extractedAnilistId || series.anilistId!;
            result = await fetchFromAnilistById(anilistId, series.volumeCount || 0, series.chapterCount || 0);
          }
        }
        console.log('=== END PROVIDER SELECTION ===');
      }
    }

    if (!result) {
      return NextResponse.json({
        message: 'No metadata provider configured for this series',
        series: series,
        volumesFound: 0,
        chaptersFound: 0,
      });
    }

    // DEBUG: Log what we got from the provider
    console.log('=== REFRESH DEBUG ===');
    console.log('Provider:', result.provider);
    console.log('Volumes received:', result.volumes.length);
    if (result.volumes.length > 0) {
      console.log('Sample volume data:', JSON.stringify(result.volumes.slice(0, 3), null, 2));
    }
    console.log('Chapters received:', result.chapters.length);
    if (result.chapters.length > 0) {
      console.log('Sample chapter data:', JSON.stringify(result.chapters.slice(0, 3), null, 2));
    }
    console.log('=== END DEBUG ===');

    // Sync volumes to database
    const volumeSyncResult = await syncVolumesToDatabase(seriesId, result.volumes, series.volumes);
    
    // Sync chapters to database
    const chapterSyncResult = await syncChaptersToDatabase(seriesId, result.chapters, series.chapters);

    // Update series last sync time, counts, and populate missing provider IDs
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        lastInfoSync: new Date(),
        volumeCount: result.volumes.length || series.volumeCount,
        chapterCount: result.chapters.length || series.chapterCount,
        // Populate provider IDs if they were extracted from foreignId
        ...(extractedAnilistId && !series.anilistId ? { anilistId: extractedAnilistId } : {}),
        ...(extractedCvId && !series.comicVineId ? { comicVineId: extractedCvId } : {}),
      },
    });

    // Pre-fetch cover images in background (don't await to not block response)
    const coverUrls = result.volumes
      .filter(v => v.imageUrl)
      .map(v => v.imageUrl!);
    if (coverUrls.length > 0) {
      console.log(`[Refresh] Pre-fetching ${coverUrls.length} cover images`);
      prefetchImages(coverUrls).then(result => {
        console.log(`[Refresh] Image cache: ${result.cached} cached, ${result.skipped} skipped, ${result.failed} failed`);
      }).catch(err => {
        console.error('[Refresh] Image prefetch error:', err);
      });
    }

    return NextResponse.json({
      message: `Refreshed from ${result.provider}: ${result.volumes.length} volumes, ${result.chapters.length} chapters`,
      provider: result.provider,
      volumesFound: result.volumes.length,
      chaptersFound: result.chapters.length,
      volumesAdded: volumeSyncResult.added,
      volumesUpdated: volumeSyncResult.updated,
      chaptersAdded: chapterSyncResult.added,
      chaptersUpdated: chapterSyncResult.updated,
      // DEBUG: Include sample data in response
      debug: {
        sampleVolumes: result.volumes.slice(0, 5),
        sampleChapters: result.chapters.slice(0, 5),
        note: result.provider === 'MyAnimeList' 
          ? 'MAL API only provides volume/chapter COUNTS, not individual details (no titles, covers, release dates). Consider using MangaDex or Anilist for richer metadata.'
          : 'ComicVine provides per-issue data including titles and cover images.',
      },
    });
  } catch (error) {
    console.error('Series refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh series' },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what would be fetched
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const seriesId = parseInt(id, 10);
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      );
    }

    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    let result: RefreshResult | null = null;

    if (series.comicVineId) {
      result = await fetchFromComicVine(series.comicVineId);
    } else if (series.foreignId?.startsWith('comicvine-')) {
      const cvId = series.foreignId.replace('comicvine-', '');
      result = await fetchFromComicVine(cvId);
    } else {
      // For manga: Try MangaDex first, fall back to Anilist
      const isMangaSeries = series.malId || series.anilistId || series.foreignId?.startsWith('anilist-');
      
      if (isMangaSeries) {
        const mangaDexResult = await fetchFromMangaDex(
          series.title,
          series.malId || undefined
        );
        
        if (mangaDexResult && mangaDexResult.volumes.length > 0) {
          result = mangaDexResult;
        } else {
          // Fall back to Anilist
          if (series.malId) {
            result = await fetchFromAnilist(series.malId, series.volumeCount || 0, series.chapterCount || 0);
          } else if (series.foreignId?.startsWith('anilist-')) {
            const anilistId = series.foreignId.replace('anilist-', '');
            result = await fetchFromAnilistById(anilistId, series.volumeCount || 0, series.chapterCount || 0);
          } else if (series.anilistId) {
            result = await fetchFromAnilistById(series.anilistId, series.volumeCount || 0, series.chapterCount || 0);
          }
        }
      }
    }

    if (!result) {
      return NextResponse.json({
        provider: null,
        volumesFound: 0,
        chaptersFound: 0,
      });
    }

    return NextResponse.json({
      provider: result.provider,
      volumesFound: result.volumes.length,
      chaptersFound: result.chapters.length,
      volumes: result.volumes,
      chapters: result.chapters,
    });
  } catch (error) {
    console.error('Series refresh preview error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PROVIDER FUNCTIONS
// =============================================================================

async function fetchFromComicVine(volumeId: string): Promise<RefreshResult> {
  const url = new URL('https://comicvine.gamespot.com/api/volume/4050-' + volumeId);
  url.searchParams.set('api_key', COMICVINE_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('field_list', 'issues');

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Inkarr/1.0' },
  });

  if (!response.ok) {
    throw new Error(`ComicVine API error: ${response.status}`);
  }

  const data: ComicVineApiResponse<ComicVineVolume> = await response.json();

  if (data.status_code !== 1) {
    throw new Error(`ComicVine API error: ${data.error}`);
  }

  const issues = data.results.issues || [];
  
  // ComicVine "volume" is actually a series, issues are chapters
  // For comics, we don't typically track volumes, just issues
  const chapters: IssueInfo[] = issues.map(issue => {
    const issueIdMatch = issue.api_detail_url.match(/4000-(\d+)/);
    const issueId = issueIdMatch ? issueIdMatch[1] : issue.id?.toString();
    
    // DEBUG: Log first few issues to see available fields
    if (issues.indexOf(issue) < 3) {
      console.log(`ComicVine issue #${issue.issue_number}:`, {
        name: issue.name,
        cover_date: issue.cover_date,
        image: issue.image,
        api_detail_url: issue.api_detail_url,
      });
    }
    
    return {
      foreignId: `comicvine-issue-${issueId}`,
      title: issue.name || undefined,
      issueNumber: issue.issue_number,
      chapterNumber: parseFloat(issue.issue_number) || undefined,
      releaseDate: issue.cover_date ? new Date(issue.cover_date) : undefined,
      imageUrl: issue.image?.medium_url,
    };
  });

  // Sort by issue number
  chapters.sort((a, b) => {
    const numA = a.chapterNumber || parseFloat(a.issueNumber || '0') || 0;
    const numB = b.chapterNumber || parseFloat(b.issueNumber || '0') || 0;
    return numA - numB;
  });

  return {
    provider: 'ComicVine',
    volumes: [], // ComicVine doesn't have sub-volumes
    chapters,
  };
}

async function fetchFromAnilist(
  malId: string, 
  knownVolumeCount: number, 
  knownChapterCount: number
): Promise<RefreshResult> {
  // GraphQL query to fetch manga by MAL ID
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: MANGA) {
        id
        title {
          romaji
          english
          native
        }
        volumes
        chapters
        coverImage {
          extraLarge
          large
          medium
        }
        bannerImage
        description
        status
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
      }
    }
  `;

  let volumeCount = knownVolumeCount;
  let chapterCount = knownChapterCount;
  let coverImage: string | undefined;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { malId: parseInt(malId) },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('=== ANILIST API RESPONSE ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('=== END ANILIST RESPONSE ===');
      
      const media = data.data?.Media;
      if (media) {
        volumeCount = media.volumes || knownVolumeCount;
        chapterCount = media.chapters || knownChapterCount;
        coverImage = media.coverImage?.extraLarge || media.coverImage?.large;
        console.log(`Anilist: Found ${volumeCount} volumes, ${chapterCount} chapters for MAL ID ${malId}`);
      }
    } else {
      console.error(`Anilist API error: ${response.status}`);
      const errorText = await response.text();
      console.error('Anilist error body:', errorText);
    }
  } catch (error) {
    console.error('Anilist API fetch error:', error);
  }

  // Generate volume placeholders with series cover as fallback
  const volumes: VolumeInfo[] = [];
  if (volumeCount > 0) {
    for (let i = 1; i <= volumeCount; i++) {
      volumes.push({
        foreignId: `anilist-volume-${malId}-${i}`,
        volumeNumber: i,
        imageUrl: coverImage, // Use series cover for all volumes
      });
    }
  }

  // Generate chapter placeholders
  const chapters: IssueInfo[] = [];
  if (chapterCount > 0) {
    for (let i = 1; i <= chapterCount; i++) {
      chapters.push({
        foreignId: `anilist-chapter-${malId}-${i}`,
        chapterNumber: i,
        issueNumber: i.toString(),
      });
    }
  }

  return {
    provider: 'Anilist',
    volumes,
    chapters,
  };
}

async function fetchFromAnilistById(
  anilistId: string, 
  knownVolumeCount: number, 
  knownChapterCount: number
): Promise<RefreshResult> {
  // GraphQL query to fetch manga by Anilist ID
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title {
          romaji
          english
          native
        }
        volumes
        chapters
        coverImage {
          extraLarge
          large
          medium
        }
        bannerImage
        description
        status
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
      }
    }
  `;

  let volumeCount = knownVolumeCount;
  let chapterCount = knownChapterCount;
  let coverImage: string | undefined;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: parseInt(anilistId) },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('=== ANILIST API RESPONSE (BY ID) ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('=== END ANILIST RESPONSE ===');
      
      const media = data.data?.Media;
      if (media) {
        volumeCount = media.volumes || knownVolumeCount;
        chapterCount = media.chapters || knownChapterCount;
        coverImage = media.coverImage?.extraLarge || media.coverImage?.large;
        console.log(`Anilist: Found ${volumeCount} volumes, ${chapterCount} chapters for Anilist ID ${anilistId}`);
      }
    } else {
      console.error(`Anilist API error: ${response.status}`);
      const errorText = await response.text();
      console.error('Anilist error body:', errorText);
    }
  } catch (error) {
    console.error('Anilist API fetch error:', error);
  }

  // Generate volume placeholders with series cover as fallback
  const volumes: VolumeInfo[] = [];
  if (volumeCount > 0) {
    for (let i = 1; i <= volumeCount; i++) {
      volumes.push({
        foreignId: `anilist-volume-${anilistId}-${i}`,
        volumeNumber: i,
        imageUrl: coverImage, // Use series cover for all volumes
      });
    }
  }

  // Generate chapter placeholders
  const chapters: IssueInfo[] = [];
  if (chapterCount > 0) {
    for (let i = 1; i <= chapterCount; i++) {
      chapters.push({
        foreignId: `anilist-chapter-${anilistId}-${i}`,
        chapterNumber: i,
        issueNumber: i.toString(),
      });
    }
  }

  return {
    provider: 'Anilist',
    volumes,
    chapters,
  };
}

// =============================================================================
// MANGADEX API - Richer volume/chapter metadata
// =============================================================================

async function fetchFromMangaDex(seriesTitle: string, malId?: string): Promise<RefreshResult | null> {
  try {
    // Search MangaDex for the manga by title
    const searchUrl = new URL('https://api.mangadex.org/manga');
    searchUrl.searchParams.set('title', seriesTitle);
    searchUrl.searchParams.set('limit', '5');
    searchUrl.searchParams.set('includes[]', 'cover_art');
    
    console.log('=== MANGADEX SEARCH ===');
    console.log('Searching for:', seriesTitle);
    
    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      console.error('MangaDex search failed:', searchRes.status);
      return null;
    }
    
    const searchData = await searchRes.json();
    if (!searchData.data || searchData.data.length === 0) {
      console.log('MangaDex: No results found for title');
      return null;
    }
    
    // Find best match (prefer exact title match or MAL ID link)
    let manga = searchData.data[0];
    for (const m of searchData.data) {
      const titles = m.attributes?.title || {};
      const altTitles = m.attributes?.altTitles || [];
      const allTitles = [
        ...Object.values(titles),
        ...altTitles.flatMap((t: Record<string, string>) => Object.values(t))
      ];
      
      // Check if MAL ID matches
      const links = m.attributes?.links || {};
      if (malId && links.mal === malId) {
        manga = m;
        console.log('MangaDex: Found exact MAL ID match');
        break;
      }
      
      // Check for exact title match
      if (allTitles.some((t: string) => t.toLowerCase() === seriesTitle.toLowerCase())) {
        manga = m;
        console.log('MangaDex: Found exact title match');
        break;
      }
    }
    
    const mangaId = manga.id;
    console.log('MangaDex: Using manga ID:', mangaId);
    console.log('MangaDex: Title:', manga.attributes?.title);
    
    // Fetch cover art for all volumes
    const coversUrl = new URL('https://api.mangadex.org/cover');
    coversUrl.searchParams.set('manga[]', mangaId);
    coversUrl.searchParams.set('limit', '100');
    coversUrl.searchParams.set('order[volume]', 'asc');
    
    const coversRes = await fetch(coversUrl.toString());
    const coversData = coversRes.ok ? await coversRes.json() : { data: [] };
    
    // Map volume number to cover URL
    const volumeCovers = new Map<string, string>();
    for (const cover of coversData.data || []) {
      const vol = cover.attributes?.volume;
      const filename = cover.attributes?.fileName;
      if (vol && filename) {
        volumeCovers.set(vol, `https://uploads.mangadex.org/covers/${mangaId}/${filename}`);
      }
    }
    console.log('MangaDex: Found covers for volumes:', Array.from(volumeCovers.keys()));
    
    // Build volumes directly from covers (don't rely on chapters)
    const volumes: VolumeInfo[] = [];
    for (const [volStr, coverUrl] of volumeCovers.entries()) {
      const volNum = parseInt(volStr);
      if (!isNaN(volNum)) {
        volumes.push({
          foreignId: `mangadex-volume-${mangaId}-${volNum}`,
          volumeNumber: volNum,
          imageUrl: coverUrl,
        });
      }
    }
    volumes.sort((a, b) => a.volumeNumber - b.volumeNumber);
    
    // Fetch chapters (try multiple languages if English fails)
    const chaptersUrl = new URL('https://api.mangadex.org/chapter');
    chaptersUrl.searchParams.set('manga', mangaId);
    chaptersUrl.searchParams.set('limit', '500');
    chaptersUrl.searchParams.set('order[chapter]', 'asc');
    // Try English first, then any language
    chaptersUrl.searchParams.append('translatedLanguage[]', 'en');
    
    let chaptersRes = await fetch(chaptersUrl.toString());
    let chaptersData = chaptersRes.ok ? await chaptersRes.json() : { data: [] };
    
    // If no English chapters, try without language filter
    if (!chaptersData.data || chaptersData.data.length === 0) {
      console.log('MangaDex: No English chapters, trying all languages...');
      chaptersUrl.searchParams.delete('translatedLanguage[]');
      chaptersRes = await fetch(chaptersUrl.toString());
      chaptersData = chaptersRes.ok ? await chaptersRes.json() : { data: [] };
    }
    
    console.log('MangaDex: Chapters API returned', chaptersData.data?.length || 0, 'results');
    
    // Build chapter list
    const chapterList: IssueInfo[] = [];
    
    for (const ch of chaptersData.data || []) {
      const attrs = ch.attributes || {};
      const chNum = attrs.chapter ? parseFloat(attrs.chapter) : null;
      
      // Add chapter
      if (chNum !== null) {
        chapterList.push({
          foreignId: `mangadex-chapter-${ch.id}`,
          title: attrs.title || undefined,
          chapterNumber: chNum,
          issueNumber: attrs.chapter,
          releaseDate: attrs.publishAt ? new Date(attrs.publishAt) : undefined,
        });
      }
    }
    
    // Deduplicate chapters (keep first occurrence of each chapter number)
    const seenChapters = new Set<number>();
    const chapters = chapterList.filter(ch => {
      if (ch.chapterNumber && seenChapters.has(ch.chapterNumber)) return false;
      if (ch.chapterNumber) seenChapters.add(ch.chapterNumber);
      return true;
    });
    
    console.log('MangaDex: Found', volumes.length, 'volumes,', chapters.length, 'unique chapters');
    console.log('Sample volume:', volumes[0]);
    console.log('=== END MANGADEX ===');
    
    return {
      provider: 'MangaDex',
      volumes,
      chapters,
    };
  } catch (error) {
    console.error('MangaDex fetch error:', error);
    return null;
  }
}

// =============================================================================
// DATABASE SYNC FUNCTIONS
// =============================================================================

interface SyncResult {
  added: number;
  updated: number;
}

async function syncVolumesToDatabase(
  seriesId: number,
  volumes: VolumeInfo[],
  existingVolumes: { id: number; foreignId: string | null; volumeNumber: number | null }[]
): Promise<SyncResult> {
  let added = 0;
  let updated = 0;

  const existingByForeignId = new Map(
    existingVolumes.filter(v => v.foreignId).map(v => [v.foreignId!, v])
  );

  const existingByNumber = new Map(
    existingVolumes.filter(v => v.volumeNumber !== null).map(v => [v.volumeNumber!, v])
  );

  for (const volume of volumes) {
    const existingByFid = existingByForeignId.get(volume.foreignId);
    const existingByNum = existingByNumber.get(volume.volumeNumber);
    const existing = existingByFid || existingByNum;

    if (existing) {
      // Update existing volume
      await prisma.volume.update({
        where: { id: existing.id },
        data: {
          foreignId: volume.foreignId,
          title: volume.title,
          volumeNumber: volume.volumeNumber,
          releaseDate: volume.releaseDate,
          imageUrl: volume.imageUrl,
        },
      });
      updated++;
    } else {
      // Create new volume
      await prisma.volume.create({
        data: {
          seriesId,
          foreignId: volume.foreignId,
          title: volume.title,
          volumeNumber: volume.volumeNumber,
          releaseDate: volume.releaseDate,
          imageUrl: volume.imageUrl,
          monitored: true,
        },
      });
      added++;
    }
  }

  return { added, updated };
}

async function syncChaptersToDatabase(
  seriesId: number, 
  chapters: IssueInfo[],
  existingChapters: { id: number; foreignId: string | null; chapterNumber: number | null }[]
): Promise<SyncResult> {
  let added = 0;
  let updated = 0;

  const existingByForeignId = new Map(
    existingChapters.filter(ch => ch.foreignId).map(ch => [ch.foreignId!, ch])
  );

  const existingByNumber = new Map(
    existingChapters.filter(ch => ch.chapterNumber !== null).map(ch => [ch.chapterNumber!, ch])
  );

  for (const chapter of chapters) {
    const existingByFid = existingByForeignId.get(chapter.foreignId);
    const existingByNum = chapter.chapterNumber 
      ? existingByNumber.get(chapter.chapterNumber) 
      : undefined;
    const existing = existingByFid || existingByNum;

    if (existing) {
      // Update existing chapter
      await prisma.chapter.update({
        where: { id: existing.id },
        data: {
          foreignId: chapter.foreignId,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          issueNumber: chapter.issueNumber,
          overview: chapter.overview,
          releaseDate: chapter.releaseDate,
          pageCount: chapter.pageCount,
          imageUrl: chapter.imageUrl,
        },
      });
      updated++;
    } else {
      // Create new chapter
      await prisma.chapter.create({
        data: {
          seriesId,
          foreignId: chapter.foreignId,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          issueNumber: chapter.issueNumber,
          overview: chapter.overview,
          releaseDate: chapter.releaseDate,
          pageCount: chapter.pageCount,
          imageUrl: chapter.imageUrl,
          monitored: true,
        },
      });
      added++;
    }
  }

  return { added, updated };
}
