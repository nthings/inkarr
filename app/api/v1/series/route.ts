// Series API - GET all series, POST new series

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import type { AddSeriesOptions, Series } from '@/app/lib/types';

/**
 * @swagger
 * /api/v1/series:
 *   get:
 *     summary: Get all series
 *     tags: [Series]
 *     parameters:
 *       - in: query
 *         name: includeVolumes
 *         schema:
 *           type: boolean
 *         description: Include volumes in response
 *       - in: query
 *         name: includeChapters
 *         schema:
 *           type: boolean
 *         description: Include chapters in response
 *       - in: query
 *         name: includeCreators
 *         schema:
 *           type: boolean
 *         description: Include creators in response
 *     responses:
 *       200:
 *         description: List of series
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Series'
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeVolumes = searchParams.get('includeVolumes') === 'true';
    const includeChapters = searchParams.get('includeChapters') === 'true';
    const includeCreators = searchParams.get('includeCreators') === 'true';
    
    const series = await prisma.series.findMany({
      include: {
        volumes: includeVolumes,
        chapters: includeChapters,
        creators: includeCreators ? {
          include: {
            creator: {
              include: {
                metadata: true,
              },
            },
          },
        } : false,
        qualityProfile: true,
        metadataProfile: true,
        _count: {
          select: {
            volumes: true,
            chapters: true,
            mediaFiles: true,
          },
        },
      },
      orderBy: {
        sortTitle: 'asc',
      },
    });

    return NextResponse.json(series);
  } catch (error) {
    console.error('Error fetching series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch series' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/series:
 *   post:
 *     summary: Add a new series
 *     tags: [Series]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - foreignId
 *               - title
 *               - path
 *             properties:
 *               foreignId: { type: string }
 *               title: { type: string }
 *               path: { type: string }
 *               sortTitle: { type: string }
 *               overview: { type: string }
 *               year: { type: integer }
 *               monitored: { type: boolean }
 *               qualityProfileId: { type: integer }
 *               metadataProfileId: { type: integer }
 *     responses:
 *       201:
 *         description: Series created successfully
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Series already exists
 *       500:
 *         description: Server error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      foreignId,
      title,
      sortTitle,
      cleanTitle,
      alternateTitles,
      overview,
      mediaType,
      status,
      year,
      publisher,
      genres,
      imageUrl,
      bannerUrl,
      volumeCount,
      chapterCount,
      comicVineId,
      malId,
      anilistId,
      mangadexId,
      options,
    }: {
      foreignId?: string;
      title: string;
      sortTitle?: string;
      cleanTitle?: string;
      alternateTitles?: string[];
      overview?: string;
      mediaType?: string;
      status?: string;
      year?: number;
      publisher?: string;
      genres?: string[];
      imageUrl?: string;
      bannerUrl?: string;
      volumeCount?: number;
      chapterCount?: number;
      comicVineId?: string;
      malId?: string;
      anilistId?: string;
      mangadexId?: string;
      options?: AddSeriesOptions;
    } = body;

    // Check if series already exists
    if (foreignId) {
      const existing = await prisma.series.findUnique({
        where: { foreignId },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Series already exists', series: existing },
          { status: 409 }
        );
      }
    }

    const generatedSortTitle = sortTitle || title.replace(/^(The|A|An)\s+/i, '');
    const generatedCleanTitle = cleanTitle || title.toLowerCase().replace(/[^a-z0-9]/g, '');

    const series = await prisma.series.create({
      data: {
        foreignId,
        title,
        sortTitle: generatedSortTitle,
        cleanTitle: generatedCleanTitle,
        alternateTitles: alternateTitles ? JSON.stringify(alternateTitles) : null,
        overview,
        mediaType: mediaType as any || 'MANGA',
        status: status as any || 'CONTINUING',
        year,
        publisher,
        genres: genres ? JSON.stringify(genres) : null,
        imageUrl,
        bannerUrl,
        volumeCount,
        chapterCount,
        comicVineId,
        malId,
        anilistId,
        mangadexId,
        monitored: options?.monitored ?? true,
        monitorStatus: options?.monitorStatus as any || 'ALL',
        qualityProfileId: options?.qualityProfileId,
        metadataProfileId: options?.metadataProfileId,
        rootFolderPath: options?.rootFolderPath,
        tags: options?.tags ? JSON.stringify(options.tags) : null,
      },
      include: {
        qualityProfile: true,
        metadataProfile: true,
      },
    });

    // Optionally trigger search for missing content
    if (options?.searchForMissingContent) {
      // TODO: Queue search command
    }

    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    console.error('Error creating series:', error);
    return NextResponse.json(
      { error: 'Failed to create series' },
      { status: 500 }
    );
  }
}
