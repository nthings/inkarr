// Calibre Sync API - Sync media files to Calibre library

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { 
  syncToLibrary, 
  CalibreError,
  getBook,
} from '@/app/lib/calibre';
import type { CalibreSettings } from '@/app/lib/types/calibre';

interface SyncRequest {
  // Sync specific media file by ID
  mediaFileId?: number;
  // Sync all files for a series
  seriesId?: number;
  // Sync all files for a volume
  volumeId?: number;
  // Use specific Calibre settings by ID (optional, uses first enabled if not specified)
  calibreSettingsId?: number;
  // Force re-sync even if already synced
  force?: boolean;
}

/**
 * @swagger
 * /api/v1/calibre/sync:
 *   post:
 *     summary: Sync media files to Calibre library
 *     tags: [Calibre]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mediaFileId: { type: integer, description: Sync specific media file }
 *               seriesId: { type: integer, description: Sync all files for a series }
 *               volumeId: { type: integer, description: Sync all files for a volume }
 *               calibreSettingsId: { type: integer, description: Calibre settings to use }
 *               force: { type: boolean, description: Force re-sync }
 *     responses:
 *       200:
 *         description: Sync results
 */
export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json();

    // Get Calibre settings
    let calibreSettings;
    if (body.calibreSettingsId) {
      calibreSettings = await prisma.calibreSettings.findUnique({
        where: { id: body.calibreSettingsId },
      });
    } else {
      // Get first enabled Calibre settings
      calibreSettings = await prisma.calibreSettings.findFirst({
        where: { enable: true },
      });
    }

    if (!calibreSettings) {
      return NextResponse.json(
        { error: 'No Calibre settings configured' },
        { status: 400 }
      );
    }

    const settings: CalibreSettings = {
      host: calibreSettings.host,
      port: calibreSettings.port,
      urlBase: calibreSettings.urlBase ?? undefined,
      username: calibreSettings.username ?? undefined,
      password: calibreSettings.password ?? undefined,
      library: calibreSettings.library ?? undefined,
      outputFormat: calibreSettings.outputFormat ?? undefined,
      outputProfile: calibreSettings.outputProfile.toLowerCase() as CalibreSettings['outputProfile'],
      useSsl: calibreSettings.useSsl,
    };

    // Build query for media files to sync
    const where: {
      id?: number;
      seriesId?: number;
      volumeId?: number;
      calibreId?: null | { not: null };
    } = {};
    
    if (body.mediaFileId) {
      where.id = body.mediaFileId;
    } else if (body.seriesId) {
      where.seriesId = body.seriesId;
    } else if (body.volumeId) {
      where.volumeId = body.volumeId;
    }

    // Unless forcing, only sync files without calibreId
    if (!body.force) {
      where.calibreId = null;
    }

    // Get media files to sync
    const mediaFiles = await prisma.mediaFile.findMany({
      where,
      include: {
        series: true,
        volume: true,
        chapter: true,
      },
    });

    if (mediaFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No files to sync',
        synced: 0,
        failed: 0,
        results: [],
      });
    }

    // Process each file
    const results: Array<{
      mediaFileId: number;
      success: boolean;
      calibreId?: number;
      error?: string;
    }> = [];

    for (const file of mediaFiles) {
      try {
        // Build identifiers object, filtering out undefined values
        const identifiers: Record<string, string> = {};
        if (file.volume?.isbn) identifiers.isbn = file.volume.isbn;
        if (file.volume?.isbn13) identifiers.isbn13 = file.volume.isbn13;
        if (file.volume?.asin) identifiers.asin = file.volume.asin;

        // Build tags for organization
        const tags: string[] = file.series.genres ? JSON.parse(file.series.genres) : [];
        if (file.volume) {
          tags.push('Volume');
        } else if (file.chapter) {
          tags.push('Chapter');
        }
        // Add media type as tag
        if (file.series.mediaType) {
          tags.push(file.series.mediaType);
        }

        // Build title with volume/chapter number for better organization
        let title = file.volume?.title || file.chapter?.title || file.series.title;
        if (file.volume?.volumeNumber !== undefined && !title.toLowerCase().includes('vol')) {
          title = `${file.series.title} Vol. ${file.volume.volumeNumber}`;
        } else if (file.chapter?.chapterNumber !== undefined && !title.toLowerCase().includes('ch')) {
          title = `${file.series.title} Ch. ${file.chapter.chapterNumber}`;
        }

        // Build metadata for Calibre
        const metadata = {
          title,
          authors: [] as string[], // Could be populated from series creators
          series: file.series.title,
          seriesIndex: file.volume?.volumeNumber ?? file.chapter?.chapterNumber ?? undefined,
          publisher: file.series.publisher ?? undefined,
          releaseDate: file.volume?.releaseDate ?? file.chapter?.releaseDate ?? undefined,
          genres: tags,
          overview: file.volume?.overview ?? file.chapter?.overview ?? file.series.overview ?? undefined,
          identifiers: Object.keys(identifiers).length > 0 ? identifiers : undefined,
        };

        // Sync to Calibre
        const result = await syncToLibrary(
          file.path,
          metadata,
          settings,
          body.force ? file.calibreId ?? undefined : undefined
        );

        if (result.success && result.calibreId) {
          // Update media file with Calibre ID
          await prisma.mediaFile.update({
            where: { id: file.id },
            data: {
              calibreId: result.calibreId,
              calibreSyncedAt: new Date(),
            },
          });

          results.push({
            mediaFileId: file.id,
            success: true,
            calibreId: result.calibreId,
          });
        } else {
          results.push({
            mediaFileId: file.id,
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        results.push({
          mediaFileId: file.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const synced = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: failed === 0,
      message: `Synced ${synced} file(s), ${failed} failed`,
      synced,
      failed,
      results,
    });
  } catch (error) {
    console.error('Error syncing to Calibre:', error);
    if (error instanceof CalibreError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to sync to Calibre' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get sync status for media files
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const seriesId = searchParams.get('seriesId');
    const volumeId = searchParams.get('volumeId');

    const where: {
      seriesId?: number;
      volumeId?: number;
    } = {};

    if (seriesId) {
      where.seriesId = parseInt(seriesId, 10);
    }
    if (volumeId) {
      where.volumeId = parseInt(volumeId, 10);
    }

    const mediaFiles = await prisma.mediaFile.findMany({
      where,
      select: {
        id: true,
        path: true,
        calibreId: true,
        calibreSyncedAt: true,
      },
    });

    const synced = mediaFiles.filter(f => f.calibreId !== null).length;
    const unsynced = mediaFiles.filter(f => f.calibreId === null).length;

    return NextResponse.json({
      total: mediaFiles.length,
      synced,
      unsynced,
      files: mediaFiles.map(f => ({
        id: f.id,
        path: f.path,
        calibreId: f.calibreId,
        calibreSyncedAt: f.calibreSyncedAt,
        synced: f.calibreId !== null,
      })),
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
