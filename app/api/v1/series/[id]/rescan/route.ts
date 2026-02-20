// Series Rescan API - Scan series folder and rebuild MediaFile records

import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, access, constants } from 'fs/promises';
import path from 'path';
import prisma from '@/app/lib/db';
import { FileFormat } from '@/app/generated/prisma/client';
import { resolveToLocal } from '@/app/lib/path-mapping';
import { parseFilename } from '@/app/lib/import/scanner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Map file extensions to FileFormat enum
const EXTENSION_TO_FORMAT: Record<string, FileFormat> = {
  '.cbz': 'CBZ',
  '.cbr': 'CBR',
  '.cb7': 'CB7',
  '.pdf': 'PDF',
  '.epub': 'EPUB',
  '.mobi': 'MOBI',
  // Aliases
  '.zip': 'CBZ',
  '.rar': 'CBR',
  '.7z': 'CB7',
};

// Supported media file extensions
const MEDIA_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_FORMAT));

/**
 * @swagger
 * /api/v1/series/{id}/rescan:
 *   post:
 *     summary: Rescan series folder and rebuild MediaFile records
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
 *         description: Rescan completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 filesFound: { type: integer }
 *                 filesAdded: { type: integer }
 *                 filesUpdated: { type: integer }
 *       404:
 *         description: Series not found
 *       500:
 *         description: Rescan failed
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

    // Get series with volumes and chapters
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        volumes: true,
        chapters: true,
        mediaFiles: true,
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    if (!series.path) {
      return NextResponse.json(
        { error: 'Series has no path configured' },
        { status: 400 }
      );
    }

    const localSeriesPath = resolveToLocal(series.path);

    // Check if the folder exists
    try {
      await access(localSeriesPath, constants.F_OK);
    } catch {
      return NextResponse.json(
        { error: `Series folder not found: ${localSeriesPath}` },
        { status: 404 }
      );
    }

    // Recursively scan for media files
    const files = await scanDirectory(localSeriesPath, series.path);
    
    let filesAdded = 0;
    let filesUpdated = 0;
    const errors: string[] = [];

    // Track existing files by path to detect orphans
    const existingFilesByPath = new Map(
      series.mediaFiles.map(mf => [mf.path, mf])
    );
    const processedPaths = new Set<string>();

    for (const file of files) {
      try {
        processedPaths.add(file.dbPath);
        
        // Parse filename to determine volume/chapter
        const parsed = parseFilename(file.filename);
        
        // Try to match to a volume or chapter
        let volumeId: number | null = null;
        let chapterId: number | null = null;
        
        if (parsed.volumeNumber !== undefined) {
          const volume = series.volumes.find(v => v.volumeNumber === parsed.volumeNumber);
          if (volume) {
            volumeId = volume.id;
          }
        }
        
        if (parsed.chapterNumber !== undefined) {
          const chapter = series.chapters.find(c => 
            c.chapterNumber === parsed.chapterNumber ||
            c.issueNumber === String(parsed.chapterNumber)
          );
          if (chapter) {
            chapterId = chapter.id;
          }
        }

        const existingFile = existingFilesByPath.get(file.dbPath);
        
        if (existingFile) {
          // Update existing record
          await prisma.mediaFile.update({
            where: { id: existingFile.id },
            data: {
              size: BigInt(file.size),
              volumeId,
              chapterId,
              relativePath: file.relativePath,
            },
          });
          filesUpdated++;
        } else {
          // Create new MediaFile record
          await prisma.mediaFile.create({
            data: {
              path: file.dbPath,
              relativePath: file.relativePath,
              size: BigInt(file.size),
              format: file.format,
              seriesId: series.id,
              volumeId,
              chapterId,
            },
          });
          filesAdded++;
        }
      } catch (err) {
        errors.push(`Error processing ${file.filename}: ${err}`);
      }
    }

    // Optionally remove orphaned MediaFile records (files no longer on disk)
    const orphanedFiles = series.mediaFiles.filter(mf => !processedPaths.has(mf.path));
    for (const orphan of orphanedFiles) {
      await prisma.mediaFile.delete({ where: { id: orphan.id } });
    }

    return NextResponse.json({
      success: errors.length === 0,
      filesFound: files.length,
      filesAdded,
      filesUpdated,
      orphansRemoved: orphanedFiles.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error rescanning series:', error);
    return NextResponse.json(
      { error: 'Failed to rescan series', details: String(error) },
      { status: 500 }
    );
  }
}

interface ScannedFile {
  filename: string;
  dbPath: string;  // Path as stored in database
  relativePath: string;  // Path relative to series folder
  size: number;
  format: FileFormat;
}

/**
 * Recursively scan a directory for media files
 */
async function scanDirectory(
  localPath: string, 
  dbBasePath: string, 
  relativePath: string = ''
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  
  try {
    const entries = await readdir(localPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryLocalPath = path.join(localPath, entry.name);
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await scanDirectory(entryLocalPath, dbBasePath, entryRelativePath);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const format = EXTENSION_TO_FORMAT[ext];
        
        if (format) {
          const stats = await stat(entryLocalPath);
          results.push({
            filename: entry.name,
            dbPath: path.join(dbBasePath, entryRelativePath),
            relativePath: entryRelativePath,
            size: stats.size,
            format,
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${localPath}:`, err);
  }
  
  return results;
}
