import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';
import { serializeBigInt } from '@/app/lib/utils/serialize';
import AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Image file extensions to consider as pages
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

// Count pages in archive without extracting them
function countPagesInArchive(filePath: string, format: string): number | null {
  try {
    switch (format) {
      case 'CBZ': {
        const zip = new AdmZip(filePath);
        return zip.getEntries().filter(e => !e.isDirectory && isImageFile(e.entryName)).length;
      }
      case 'CBR': {
        const output = execSync(`unrar lb "${filePath}"`, { encoding: 'utf8', timeout: 30000 });
        return output.split('\n').filter(f => f.trim() && isImageFile(f.trim())).length;
      }
      case 'CB7': {
        const output = execSync(`7z l -slt "${filePath}"`, { encoding: 'utf8', timeout: 30000 });
        let count = 0;
        for (const line of output.split('\n')) {
          if (line.startsWith('Path = ') && isImageFile(line.substring(7).trim())) {
            count++;
          }
        }
        return count;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

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

    // Add convenience URLs for Tachiyomi/reader integration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: Record<string, any> = serializeBigInt(mediaFile);
    response.pagesUrl = `/api/v1/mediafile/${numericId}/pages`;
    response.pageUrlTemplate = `/api/v1/mediafile/${numericId}/page/{page}`;

    // Compute pageCount dynamically if not stored in database
    if (!response.pageCount) {
      const localPath = resolveToLocal(mediaFile.path);
      if (existsSync(localPath)) {
        const count = countPagesInArchive(localPath, mediaFile.format);
        if (count !== null) {
          response.pageCount = count;
          // Update database with computed pageCount for future requests
          prisma.mediaFile.update({
            where: { id: numericId },
            data: { pageCount: count },
          }).catch(err => console.error('Failed to cache pageCount:', err));
        }
      }
    }

    return NextResponse.json(response);
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
