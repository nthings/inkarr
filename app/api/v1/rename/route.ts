// Rename Files API - Rename all files for a series according to naming config

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { getNamingConfig, formatSeriesFolderName, formatFileNameWithExtension, NamingTokens } from '@/app/lib/naming';
import { rename, mkdir, access, constants } from 'fs/promises';
import path from 'path';
import { resolveToLocal } from '@/app/lib/path-mapping';

interface RenameResult {
  success: boolean;
  renamed: number;
  failed: number;
  skipped: number;
  checked: number;
  errors: string[];
  renamedFiles: {
    oldPath: string;
    newPath: string;
  }[];
  skippedReasons: string[];
}

/**
 * @swagger
 * /api/v1/rename:
 *   post:
 *     summary: Rename files according to naming configuration
 *     tags: [System]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               seriesId: { type: integer, description: Series to rename. If omitted, all series are processed. }
 *     responses:
 *       200:
 *         description: Rename results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 renamed: { type: integer }
 *                 failed: { type: integer }
 *                 skipped: { type: integer }
 */
// POST - Trigger rename for a series or all series
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seriesId } = body;

    const namingConfig = await getNamingConfig();
    
    if (!namingConfig.renameFiles) {
      return NextResponse.json({
        success: true,
        renamed: 0,
        failed: 0,
        errors: [],
        renamedFiles: [],
        message: 'File renaming is disabled in settings',
      });
    }

    let seriesToProcess: number[];
    
    if (seriesId) {
      seriesToProcess = [seriesId];
    } else {
      // Get all series
      const allSeries = await prisma.series.findMany({ select: { id: true } });
      seriesToProcess = allSeries.map(s => s.id);
    }

    const results: RenameResult = {
      success: true,
      renamed: 0,
      failed: 0,
      skipped: 0,
      checked: 0,
      errors: [],
      renamedFiles: [],
      skippedReasons: [],
    };

    for (const sid of seriesToProcess) {
      const seriesResult = await renameSeriesFiles(sid, namingConfig);
      results.renamed += seriesResult.renamed;
      results.failed += seriesResult.failed;
      results.skipped += seriesResult.skipped;
      results.checked += seriesResult.checked;
      results.errors.push(...seriesResult.errors);
      results.renamedFiles.push(...seriesResult.renamedFiles);
      results.skippedReasons.push(...seriesResult.skippedReasons);
      if (!seriesResult.success) {
        results.success = false;
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error during rename:', error);
    return NextResponse.json(
      { error: 'Failed to rename files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function renameSeriesFiles(seriesId: number, namingConfig: any): Promise<RenameResult> {
  const result: RenameResult = {
    success: true,
    renamed: 0,
    failed: 0,
    skipped: 0,
    checked: 0,
    errors: [],
    renamedFiles: [],
    skippedReasons: [],
  };

  try {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        mediaFiles: {
          include: {
            volume: true,
            chapter: true,
          },
        },
      },
    });

    if (!series) {
      result.errors.push(`Series ${seriesId} not found`);
      result.success = false;
      return result;
    }

    // Get rootFolderPath - use series value or fall back to first configured root folder
    let rootFolderPath = series.rootFolderPath;
    if (!rootFolderPath) {
      const rootFolder = await prisma.rootFolder.findFirst();
      if (rootFolder) {
        rootFolderPath = rootFolder.path;
        // Update series with root folder path
        await prisma.series.update({
          where: { id: seriesId },
          data: { rootFolderPath },
        });
      } else {
        result.errors.push(`Series ${series.title} has no root folder path and no root folders are configured`);
        result.success = false;
        return result;
      }
    }

    // Calculate expected series folder name
    const tokens: NamingTokens = {
      seriesTitle: series.title,
      seriesYear: series.year || undefined,
      sortTitle: series.sortTitle,
      cleanTitle: series.cleanTitle,
    };
    
    const expectedSeriesFolder = formatSeriesFolderName(tokens, namingConfig);
    const expectedSeriesPath = path.join(rootFolderPath, expectedSeriesFolder);
    // Resolve to local filesystem path for file operations
    const localSeriesPath = resolveToLocal(expectedSeriesPath);

    // Create series folder if it doesn't exist
    try {
      await access(localSeriesPath, constants.F_OK);
    } catch {
      await mkdir(localSeriesPath, { recursive: true });
    }

    // Update series path if different
    if (series.path !== expectedSeriesPath) {
      await prisma.series.update({
        where: { id: seriesId },
        data: { path: expectedSeriesPath },
      });
    }

    // Process each media file
    for (const mediaFile of series.mediaFiles) {
      result.checked++;
      try {
        const fileTokens: NamingTokens = {
          seriesTitle: series.title,
          seriesYear: series.year || undefined,
          volumeNumber: mediaFile.volume?.volumeNumber ?? undefined,
          chapterNumber: mediaFile.chapter?.chapterNumber ?? undefined,
          chapterTitle: mediaFile.chapter?.title || undefined,
          releaseGroup: mediaFile.releaseGroup || undefined,
        };

        const extension = path.extname(mediaFile.path).slice(1) || mediaFile.format.toLowerCase();
        const expectedFileName = formatFileNameWithExtension(fileTokens, namingConfig, extension);
        const expectedPath = path.join(expectedSeriesPath, expectedFileName);

        // Resolve paths for file system operations
        const localCurrentPath = resolveToLocal(mediaFile.path);
        const localExpectedPath = resolveToLocal(expectedPath);

        // Skip if already correct
        if (mediaFile.path === expectedPath) {
          result.skipped++;
          result.skippedReasons.push(`Already correct: ${mediaFile.path}`);
          continue;
        }

        // Check if source file exists
        try {
          await access(localCurrentPath, constants.F_OK);
        } catch {
          result.errors.push(`Source file not found: ${mediaFile.path}`);
          result.failed++;
          continue;
        }

        // Check if destination already exists
        try {
          await access(localExpectedPath, constants.F_OK);
          // Destination exists, skip to avoid overwriting
          if (mediaFile.path !== expectedPath) {
            result.errors.push(`Destination already exists: ${expectedPath}`);
            result.failed++;
          }
          continue;
        } catch {
          // Good, destination doesn't exist
        }

        // Rename the file
        await rename(localCurrentPath, localExpectedPath);

        // Update database
        await prisma.mediaFile.update({
          where: { id: mediaFile.id },
          data: {
            path: expectedPath,
            relativePath: expectedFileName,
          },
        });

        result.renamedFiles.push({
          oldPath: mediaFile.path,
          newPath: expectedPath,
        });
        result.renamed++;
      } catch (fileError) {
        result.errors.push(`Failed to rename ${mediaFile.path}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Error processing series ${seriesId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.success = false;
    return result;
  }
}
