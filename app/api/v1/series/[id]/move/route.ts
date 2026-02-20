// Series Move API - Move series files to a different root folder

import { NextRequest, NextResponse } from 'next/server';
import { rename, readdir, stat, rm, cp } from 'fs/promises';
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
  '.zip': 'CBZ',
  '.rar': 'CBR',
  '.7z': 'CB7',
};

/**
 * Move a folder, handling cross-filesystem moves by falling back to copy+delete
 */
async function moveFolder(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err: unknown) {
    // Handle cross-filesystem moves (EXDEV error)
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EXDEV') {
      // Copy recursively then delete
      await cp(src, dest, { recursive: true });
      await rm(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

interface ScannedFile {
  filename: string;
  dbPath: string;
  relativePath: string;
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

/**
 * @swagger
 * /api/v1/series/{id}/move:
 *   post:
 *     summary: Move series files to a different root folder
 *     tags: [Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Series ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetRootFolderId
 *             properties:
 *               targetRootFolderId:
 *                 type: integer
 *                 description: ID of the target root folder
 *     responses:
 *       200:
 *         description: Move completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 movedFiles: { type: integer }
 *                 newPath: { type: string }
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Series or root folder not found
 *       500:
 *         description: Move failed
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

    const body = await request.json();
    const { targetRootFolderId } = body;

    if (!targetRootFolderId) {
      return NextResponse.json(
        { error: 'targetRootFolderId is required' },
        { status: 400 }
      );
    }

    // Get the series with volumes and chapters
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        volumes: true,
        chapters: true,
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    // Get the target root folder
    const targetRootFolder = await prisma.rootFolder.findUnique({
      where: { id: targetRootFolderId },
    });

    if (!targetRootFolder) {
      return NextResponse.json(
        { error: 'Target root folder not found' },
        { status: 404 }
      );
    }

    // Check if series is already in this root folder
    if (series.rootFolderPath === targetRootFolder.path) {
      return NextResponse.json(
        { error: 'Series is already in this root folder' },
        { status: 400 }
      );
    }

    const currentSeriesPath = series.path;
    if (!currentSeriesPath) {
      return NextResponse.json(
        { error: 'Series has no current path' },
        { status: 400 }
      );
    }

    // Determine the series folder name (last part of current path)
    const seriesFolderName = path.basename(currentSeriesPath);
    
    // Calculate new paths (database paths)
    const newRootFolderPath = targetRootFolder.path;
    const newSeriesPath = path.join(newRootFolderPath, seriesFolderName);
    
    // Resolve to local filesystem paths
    const localCurrentPath = resolveToLocal(currentSeriesPath);
    const localNewPath = resolveToLocal(newSeriesPath);

    // Step 1: Delete all existing MediaFile records for this series
    // (They'll be recreated by the rescan with correct paths)
    await prisma.mediaFile.deleteMany({
      where: { seriesId },
    });

    // Step 2: Move the entire folder (handles cross-filesystem moves)
    await moveFolder(localCurrentPath, localNewPath);

    // Step 3: Update the series record with new path
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        path: newSeriesPath,
        rootFolderPath: newRootFolderPath,
      },
    });

    // Step 4: Rescan the new location to rebuild MediaFile records
    const files = await scanDirectory(localNewPath, newSeriesPath);
    let filesAdded = 0;

    for (const file of files) {
      try {
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

        await prisma.mediaFile.create({
          data: {
            path: file.dbPath,
            relativePath: file.relativePath,
            size: BigInt(file.size),
            format: file.format,
            seriesId,
            volumeId,
            chapterId,
          },
        });
        filesAdded++;
      } catch (err) {
        console.error(`Error creating MediaFile for ${file.filename}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      movedFiles: filesAdded,
      newPath: newSeriesPath,
    });
  } catch (error) {
    console.error('Error moving series:', error);
    return NextResponse.json(
      { error: 'Failed to move series', details: String(error) },
      { status: 500 }
    );
  }
}
