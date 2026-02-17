// Calibre Library API - List and manage books in Calibre library

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { 
  getBooks,
  getAllBookIds,
  deleteBook,
  CalibreError,
} from '@/app/lib/calibre';
import type { CalibreSettings } from '@/app/lib/types/calibre';

const PAGE_SIZE = 50;

/**
 * @swagger
 * /api/v1/calibre/library:
 *   get:
 *     summary: List books from Calibre library
 *     tags: [Calibre]
 *     parameters:
 *       - in: query
 *         name: settingsId
 *         schema:
 *           type: integer
 *         description: Calibre settings ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of books in Calibre library
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const calibreSettingsId = searchParams.get('settingsId');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10), 100);

    // Get Calibre settings
    let calibreSettings;
    if (calibreSettingsId) {
      calibreSettings = await prisma.calibreSettings.findUnique({
        where: { id: parseInt(calibreSettingsId, 10) },
      });
    } else {
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

    // Get all book IDs first
    const allIds = await getAllBookIds(settings);
    const totalCount = allIds.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Paginate
    const offset = (page - 1) * limit;
    const pageIds = allIds.slice(offset, offset + limit);

    if (pageIds.length === 0) {
      return NextResponse.json({
        books: [],
        page,
        limit,
        totalCount,
        totalPages,
      });
    }

    // Get book details for the current page
    const books = await getBooks(pageIds, settings);

    // Get local media files with matching calibreIds to show sync status
    const calibreIds = books.map(b => b.id);
    const localFiles = await prisma.mediaFile.findMany({
      where: {
        calibreId: { in: calibreIds },
      },
      select: {
        id: true,
        calibreId: true,
        path: true,
        seriesId: true,
      },
    });

    const localFileMap = new Map(
      localFiles.map(f => [f.calibreId, f])
    );

    // Combine with local data
    const enrichedBooks = books.map(book => {
      const localFile = localFileMap.get(book.id);
      return {
        ...book,
        localMediaFileId: localFile?.id ?? null,
        localPath: localFile?.path ?? null,
        localSeriesId: localFile?.seriesId ?? null,
        isLinked: localFile !== undefined,
      };
    });

    return NextResponse.json({
      books: enrichedBooks,
      page,
      limit,
      totalCount,
      totalPages,
    });
  } catch (error) {
    console.error('Error listing Calibre library:', error);
    if (error instanceof CalibreError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to list Calibre library' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove a book from Calibre library
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const calibreId = searchParams.get('calibreId');
    const calibreSettingsId = searchParams.get('settingsId');
    const unlinkOnly = searchParams.get('unlinkOnly') === 'true';

    if (!calibreId) {
      return NextResponse.json(
        { error: 'calibreId is required' },
        { status: 400 }
      );
    }

    const bookId = parseInt(calibreId, 10);
    if (isNaN(bookId)) {
      return NextResponse.json(
        { error: 'Invalid calibreId' },
        { status: 400 }
      );
    }

    // If only unlinking, just clear the calibreId from local media files
    if (unlinkOnly) {
      await prisma.mediaFile.updateMany({
        where: { calibreId: bookId },
        data: { 
          calibreId: null,
          calibreSyncedAt: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Unlinked media file from Calibre book',
      });
    }

    // Get Calibre settings for deletion
    let calibreSettings;
    if (calibreSettingsId) {
      calibreSettings = await prisma.calibreSettings.findUnique({
        where: { id: parseInt(calibreSettingsId, 10) },
      });
    } else {
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

    // Delete from Calibre
    await deleteBook(bookId, settings);

    // Clear the calibreId from local media files
    await prisma.mediaFile.updateMany({
      where: { calibreId: bookId },
      data: { 
        calibreId: null,
        calibreSyncedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deleted book from Calibre library',
    });
  } catch (error) {
    console.error('Error deleting from Calibre library:', error);
    if (error instanceof CalibreError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete from Calibre library' },
      { status: 500 }
    );
  }
}
