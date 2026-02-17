// Series Lookup API - Search external providers (ComicVine, Anilist)

import { NextRequest, NextResponse } from 'next/server';
import type { 
  MetadataSearchResult, 
  ComicVineApiResponse, 
  ComicVineSearchResult,
} from '@/app/lib/types';
import { 
  MediaType, 
  PublicationStatus,
  inferMediaTypeFromPublisher,
} from '@/app/lib/types';

// Environment variables for API keys
const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY || '761affae16396d3da42c55139c60dc73c0e0314f';
const ANILIST_API = 'https://graphql.anilist.co';

/**
 * @swagger
 * /api/v1/series/lookup:
 *   get:
 *     summary: Search for series from external metadata providers
 *     tags: [Series]
 *     parameters:
 *       - in: query
 *         name: term
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [all, comicvine, mal, anilist]
 *           default: all
 *         description: Metadata provider to search
 *     responses:
 *       200:
 *         description: Search results from metadata providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       foreignId: { type: string }
 *                       title: { type: string }
 *                       year: { type: integer }
 *                       overview: { type: string }
 *                       provider: { type: string }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Missing search term
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const term = searchParams.get('term');
  const provider = searchParams.get('provider') || 'all'; // comicvine, mal, all

  if (!term) {
    return NextResponse.json(
      { error: 'Search term is required' },
      { status: 400 }
    );
  }

  const results: MetadataSearchResult[] = [];
  const errors: string[] = [];

  try {
    // Search ComicVine
    if (provider === 'all' || provider === 'comicvine') {
      try {
        const comicVineResults = await searchComicVine(term);
        results.push(...comicVineResults);
      } catch (error) {
        console.error('ComicVine search error:', error);
        errors.push('ComicVine search failed');
      }
    }

    // Search Anilist (replaces MyAnimeList)
    if (provider === 'all' || provider === 'mal' || provider === 'anilist') {
      try {
        const anilistResults = await searchAnilist(term);
        results.push(...anilistResults);
      } catch (error) {
        console.error('Anilist search error:', error);
        errors.push('Anilist search failed');
      }
    }

    return NextResponse.json({
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

async function searchComicVine(term: string): Promise<MetadataSearchResult[]> {
  const url = new URL('https://comicvine.gamespot.com/api/search/');
  url.searchParams.set('api_key', COMICVINE_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', term);
  url.searchParams.set('resources', 'volume');
  url.searchParams.set('limit', '20');
  url.searchParams.set('field_list', 'id,name,start_year,publisher,count_of_issues,image,deck,description,aliases');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Inkarr/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`ComicVine API error: ${response.status}`);
  }

  const data: ComicVineApiResponse<ComicVineSearchResult[]> = await response.json();

  if (data.status_code !== 1) {
    throw new Error(`ComicVine API error: ${data.error}`);
  }

  return data.results.map((volume): MetadataSearchResult => ({
    foreignId: `comicvine-${volume.id}`,
    provider: 'ComicVine',
    title: volume.name,
    sortTitle: volume.name.replace(/^(The|A|An)\s+/i, ''),
    alternateTitles: volume.aliases ? volume.aliases.split('\n').filter(Boolean) : undefined,
    overview: volume.deck || volume.description?.replace(/<[^>]*>/g, '').slice(0, 500),
    mediaType: inferMediaTypeFromPublisher(volume.publisher?.name),
    status: PublicationStatus.CONTINUING, // ComicVine doesn't provide status
    year: volume.start_year ? parseInt(volume.start_year, 10) : undefined,
    publisher: volume.publisher?.name,
    imageUrl: volume.image?.medium_url,
    volumeCount: volume.count_of_issues,
    externalIds: {
      comicVineId: volume.id.toString(),
    },
  }));
}

async function searchAnilist(term: string): Promise<MetadataSearchResult[]> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 20) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          synonyms
          description(asHtml: false)
          format
          status
          startDate {
            year
            month
            day
          }
          genres
          averageScore
          coverImage {
            extraLarge
            large
            medium
          }
          volumes
          chapters
          staff(page: 1, perPage: 5) {
            edges {
              role
              node {
                id
                name {
                  full
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { search: term },
    }),
  });

  if (!response.ok) {
    throw new Error(`Anilist API error: ${response.status}`);
  }

  const data = await response.json();
  const mediaList = data.data?.Page?.media || [];

  return mediaList.map((media: any): MetadataSearchResult => {
    // Map Anilist format to our MediaType
    const formatMap: Record<string, MediaType> = {
      'MANGA': MediaType.MANGA,
      'NOVEL': MediaType.MANGA, // Light novels treated as manga
      'ONE_SHOT': MediaType.MANGA,
    };

    // Map Anilist status to our PublicationStatus
    const statusMap: Record<string, PublicationStatus> = {
      'FINISHED': PublicationStatus.ENDED,
      'RELEASING': PublicationStatus.CONTINUING,
      'NOT_YET_RELEASED': PublicationStatus.CONTINUING,
      'CANCELLED': PublicationStatus.ENDED,
      'HIATUS': PublicationStatus.CONTINUING,
    };

    const title = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown';

    return {
      // Always use Anilist ID for foreignId
      foreignId: `anilist-${media.id}`,
      provider: 'AniList',
      title,
      sortTitle: title.replace(/^(The|A|An)\s+/i, ''),
      alternateTitles: [
        media.title?.romaji,
        media.title?.english,
        media.title?.native,
        ...(media.synonyms || []),
      ].filter((t: string | undefined): t is string => !!t && t !== title),
      overview: media.description?.replace(/<[^>]*>/g, '').slice(0, 1000),
      mediaType: formatMap[media.format] || MediaType.MANGA,
      status: statusMap[media.status] || PublicationStatus.CONTINUING,
      year: media.startDate?.year,
      genres: media.genres,
      ratings: media.averageScore ? { anilist: media.averageScore / 10 } : undefined,
      imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium,
      volumeCount: media.volumes,
      chapterCount: media.chapters,
      externalIds: {
        malId: media.idMal?.toString(),
        anilistId: media.id.toString(),
      },
      creators: media.staff?.edges?.map((edge: any) => ({
        foreignId: `anilist-staff-${edge.node.id}`,
        name: edge.node.name?.full || 'Unknown',
        role: edge.role?.toLowerCase().includes('art') ? 'artist' as const : 'author' as const,
      })),
    };
  });
}
