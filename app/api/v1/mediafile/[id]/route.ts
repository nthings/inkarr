import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { serializeBigInt } from '@/app/lib/utils/serialize';

/**
 * @swagger
 * /api/v1/mediafile/{id}:
 *   get:
 *     summary: Get a media file by ID
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Media file details
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Unlink a media file from database (keeps file on disk)
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Media file unlinked
 *       404:
 *         description: Not found
 */
// GET - Get a specific media file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid media file ID' }, { status: 400 });
    }

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: numericId },
      include: {
        series: { select: { id: true, title: true } },
        volume: { select: { id: true, volumeNumber: true } },
        chapter: { select: { id: true, chapterNumber: true } },
      },
    });

    if (!mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
    }

    return NextResponse.json(serializeBigInt(mediaFile));
  } catch (error) {
    console.error('Error fetching media file:', error);
    return NextResponse.json({ error: 'Failed to fetch media file' }, { status: 500 });
  }
}

// DELETE - Unlink a media file (removes from database, keeps file on disk)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid media file ID' }, { status: 400 });
    }

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: numericId },
    });

    if (!mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
    }

    // Delete the media file record (file on disk is kept)
    await prisma.mediaFile.delete({
      where: { id: numericId },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'File unlinked successfully. The file remains on disk.',
      path: mediaFile.path 
    });
  } catch (error) {
    console.error('Error unlinking media file:', error);
    return NextResponse.json({ error: 'Failed to unlink media file' }, { status: 500 });
  }
}
