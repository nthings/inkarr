import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';
import AdmZip from 'adm-zip';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

// Image file extensions to consider as pages
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

// Natural sort comparator for page ordering
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Check if a filename is an image
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Get page list from a CBZ file (ZIP archive)
 */
function getPageListFromCbz(filePath: string): string[] {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    // Filter to only image files and sort naturally
    return entries
      .filter(entry => !entry.isDirectory && isImageFile(entry.entryName))
      .map(entry => entry.entryName)
      .sort(naturalCompare);
  } catch (error) {
    console.error(`Error reading CBZ file ${filePath}:`, error);
    return [];
  }
}

/**
 * Get page list from a CBR file (RAR archive)
 */
function getPageListFromCbr(filePath: string): string[] {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'inkarr-list-'));
  
  try {
    // List files in archive
    const output = execSync(`unrar lb "${filePath}"`, {
      encoding: 'utf8',
      timeout: 30000,
    });

    const files = output.split('\n')
      .map(f => f.trim())
      .filter(f => f && isImageFile(f))
      .sort(naturalCompare);

    return files;
  } catch (error) {
    console.error(`Error reading CBR file ${filePath}:`, error);
    return [];
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Get page list from a CB7 file (7z archive)
 */
function getPageListFromCb7(filePath: string): string[] {
  try {
    // List files in archive
    const output = execSync(`7z l -slt "${filePath}"`, {
      encoding: 'utf8',
      timeout: 30000,
    });

    // Parse 7z list output to get filenames
    const files: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('Path = ')) {
        const filename = line.substring(7).trim();
        if (isImageFile(filename)) {
          files.push(filename);
        }
      }
    }

    return files.sort(naturalCompare);
  } catch (error) {
    console.error(`Error reading CB7 file ${filePath}:`, error);
    return [];
  }
}

/**
 * @swagger
 * /api/v1/mediafile/{id}/pages:
 *   get:
 *     summary: Get page list for a media file
 *     description: Returns page count and URLs for all pages in a comic archive
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media file ID
 *     responses:
 *       200:
 *         description: Page list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 pageCount:
 *                   type: integer
 *                 pages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                       url:
 *                         type: string
 *                       filename:
 *                         type: string
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Media file not found
 *       415:
 *         description: Unsupported media format
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mediaFileId = parseInt(id, 10);

    if (isNaN(mediaFileId)) {
      return NextResponse.json({ error: 'Invalid media file ID' }, { status: 400 });
    }

    // Get the media file from database
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: {
        series: { select: { id: true, title: true } },
        volume: { select: { id: true, volumeNumber: true } },
        chapter: { select: { id: true, chapterNumber: true } },
      },
    });

    if (!mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
    }

    // Resolve database path to local filesystem path
    const localPath = resolveToLocal(mediaFile.path);

    // Check if file exists on disk
    if (!existsSync(localPath)) {
      return NextResponse.json({ error: 'Media file not found on disk' }, { status: 404 });
    }

    // Get page list based on format
    let pageFilenames: string[] = [];

    switch (mediaFile.format) {
      case 'CBZ':
        pageFilenames = getPageListFromCbz(localPath);
        break;
      case 'CBR':
        pageFilenames = getPageListFromCbr(localPath);
        break;
      case 'CB7':
        pageFilenames = getPageListFromCb7(localPath);
        break;
      case 'PDF':
      case 'EPUB':
      case 'MOBI':
        return NextResponse.json(
          { error: `Page listing not yet supported for ${mediaFile.format} format` },
          { status: 415 }
        );
      default:
        return NextResponse.json(
          { error: `Unknown format: ${mediaFile.format}` },
          { status: 415 }
        );
    }

    // Build the base URL for pages
    const baseUrl = `/api/v1/mediafile/${mediaFileId}/page`;

    // Build page list with URLs
    const pages = pageFilenames.map((filename, index) => ({
      index: index + 1,
      url: `${baseUrl}/${index + 1}`,
      filename,
    }));

    return NextResponse.json({
      id: mediaFileId,
      seriesId: mediaFile.seriesId,
      seriesTitle: mediaFile.series?.title,
      volumeId: mediaFile.volumeId,
      volumeNumber: mediaFile.volume?.volumeNumber,
      chapterId: mediaFile.chapterId,
      chapterNumber: mediaFile.chapter?.chapterNumber,
      format: mediaFile.format,
      pageCount: pages.length,
      pages,
    });
  } catch (error) {
    console.error('Error listing pages:', error);
    return NextResponse.json({ error: 'Failed to list pages' }, { status: 500 });
  }
}
