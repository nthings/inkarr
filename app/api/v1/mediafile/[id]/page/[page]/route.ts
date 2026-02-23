import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';
import AdmZip from 'adm-zip';
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

// Image file extensions to consider as pages
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

// Natural sort comparator for page ordering
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Get content type from file extension
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  return types[ext] || 'application/octet-stream';
}

// Check if a filename is an image
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Extract a page from a CBZ file (ZIP archive)
 */
async function extractPageFromCbz(filePath: string, pageNumber: number): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    // Filter to only image files and sort naturally
    const imageEntries = entries
      .filter(entry => !entry.isDirectory && isImageFile(entry.entryName))
      .sort((a, b) => naturalCompare(a.entryName, b.entryName));

    // Page numbers are 1-indexed
    const pageIndex = pageNumber - 1;
    
    if (pageIndex < 0 || pageIndex >= imageEntries.length) {
      return null;
    }

    const entry = imageEntries[pageIndex];
    const data = entry.getData();
    const contentType = getContentType(entry.entryName);
    
    return { data, contentType };
  } catch (error) {
    console.error(`Error reading CBZ file ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract a page from a CBR file (RAR archive)
 * Uses unrar command-line tool
 */
async function extractPageFromCbr(filePath: string, pageNumber: number): Promise<{ data: Buffer; contentType: string } | null> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'inkarr-page-'));
  
  try {
    // Extract all files to temp directory
    execSync(`unrar x -y "${filePath}" "${tempDir}/"`, {
      stdio: 'pipe',
      timeout: 60000,
    });

    // Find all image files recursively
    const findImages = (dir: string): string[] => {
      const results: string[] = [];
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results.push(...findImages(fullPath));
        } else if (isImageFile(item.name)) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const imageFiles = findImages(tempDir).sort((a, b) => 
      naturalCompare(path.basename(a), path.basename(b))
    );

    // Page numbers are 1-indexed
    const pageIndex = pageNumber - 1;
    
    if (pageIndex < 0 || pageIndex >= imageFiles.length) {
      return null;
    }

    const imagePath = imageFiles[pageIndex];
    const data = readFileSync(imagePath);
    const contentType = getContentType(imagePath);
    
    return { data, contentType };
  } catch (error) {
    console.error(`Error reading CBR file ${filePath}:`, error);
    return null;
  } finally {
    // Cleanup temp directory
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Extract a page from a CB7 file (7z archive)
 * Uses 7z command-line tool
 */
async function extractPageFromCb7(filePath: string, pageNumber: number): Promise<{ data: Buffer; contentType: string } | null> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'inkarr-page-'));
  
  try {
    // Extract all files to temp directory
    execSync(`7z x -y -o"${tempDir}" "${filePath}"`, {
      stdio: 'pipe',
      timeout: 60000,
    });

    // Find all image files recursively
    const findImages = (dir: string): string[] => {
      const results: string[] = [];
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results.push(...findImages(fullPath));
        } else if (isImageFile(item.name)) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const imageFiles = findImages(tempDir).sort((a, b) => 
      naturalCompare(path.basename(a), path.basename(b))
    );

    // Page numbers are 1-indexed
    const pageIndex = pageNumber - 1;
    
    if (pageIndex < 0 || pageIndex >= imageFiles.length) {
      return null;
    }

    const imagePath = imageFiles[pageIndex];
    const data = readFileSync(imagePath);
    const contentType = getContentType(imagePath);
    
    return { data, contentType };
  } catch (error) {
    console.error(`Error reading CB7 file ${filePath}:`, error);
    return null;
  } finally {
    // Cleanup temp directory
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * @swagger
 * /api/v1/mediafile/{id}/page/{page}:
 *   get:
 *     summary: Get a specific page from a media file
 *     description: Extracts and returns a single page image from a comic archive (CBZ, CBR, CB7)
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media file ID
 *       - in: path
 *         name: page
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (1-indexed)
 *     responses:
 *       200:
 *         description: Page image
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Media file or page not found
 *       415:
 *         description: Unsupported media format
 *       500:
 *         description: Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  try {
    const { id, page } = await params;
    const mediaFileId = parseInt(id, 10);
    const pageNumber = parseInt(page, 10);

    if (isNaN(mediaFileId)) {
      return NextResponse.json({ error: 'Invalid media file ID' }, { status: 400 });
    }

    if (isNaN(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'Invalid page number. Must be a positive integer.' }, { status: 400 });
    }

    // Get the media file from database
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
    });

    if (!mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
    }

    // Resolve database path to local filesystem path (handles Docker vs local dev)
    const localPath = resolveToLocal(mediaFile.path);

    // Check if file exists on disk
    if (!existsSync(localPath)) {
      return NextResponse.json({ error: 'Media file not found on disk' }, { status: 404 });
    }

    // Extract page based on format
    let result: { data: Buffer; contentType: string } | null = null;

    switch (mediaFile.format) {
      case 'CBZ':
        result = await extractPageFromCbz(localPath, pageNumber);
        break;
      case 'CBR':
        result = await extractPageFromCbr(localPath, pageNumber);
        break;
      case 'CB7':
        result = await extractPageFromCb7(localPath, pageNumber);
        break;
      case 'PDF':
      case 'EPUB':
      case 'MOBI':
        return NextResponse.json(
          { error: `Page extraction not yet supported for ${mediaFile.format} format` },
          { status: 415 }
        );
      default:
        return NextResponse.json(
          { error: `Unknown format: ${mediaFile.format}` },
          { status: 415 }
        );
    }

    if (!result) {
      return NextResponse.json(
        { error: `Page ${pageNumber} not found. The file may have fewer pages.` },
        { status: 404 }
      );
    }

    // Return the image with appropriate headers
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(result.data);
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': result.data.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error extracting page:', error);
    return NextResponse.json({ error: 'Failed to extract page' }, { status: 500 });
  }
}
