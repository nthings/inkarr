// Link file to volume API

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { stat, access, constants, copyFile, rename, mkdir } from 'fs/promises';
import path from 'path';
import { 
  getNamingConfig, 
  formatSeriesFolderName, 
  formatFileNameWithExtension,
  NamingTokens 
} from '@/app/lib/naming';
import { resolveToLocal, resolveToDb } from '@/app/lib/path-mapping';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getFileFormat(extension: string): string {
  const ext = extension.toUpperCase();
  switch (ext) {
    case 'CBZ': return 'CBZ';
    case 'CBR': return 'CBR';
    case 'CB7': return 'CB7';
    case 'PDF': return 'PDF';
    case 'EPUB': return 'EPUB';
    case 'MOBI': return 'MOBI';
    default: return 'CBZ';
  }
}

/**
 * @swagger
 * /api/v1/volume/{id}/link:
 *   post:
 *     summary: Link a file to a volume (move or copy)
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filePath, seriesId]
 *             properties:
 *               filePath: { type: string, description: Path to the file to link }
 *               seriesId: { type: integer }
 *               copyMode: { type: boolean, default: false, description: Copy instead of move }
 *     responses:
 *       200:
 *         description: File linked to volume
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Volume not found
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const volumeId = parseInt(id, 10);
    
    if (isNaN(volumeId)) {
      return NextResponse.json(
        { error: 'Invalid volume ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { filePath, seriesId, copyMode = false }: { 
      filePath: string; 
      seriesId: number;
      copyMode?: boolean;
    } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Check if file exists
    try {
      await access(filePath, constants.R_OK);
    } catch {
      return NextResponse.json(
        { error: 'File does not exist or is not readable' },
        { status: 400 }
      );
    }

    // Get volume info
    const volume = await prisma.volume.findUnique({
      where: { id: volumeId },
      include: { series: true },
    });

    if (!volume) {
      return NextResponse.json(
        { error: 'Volume not found' },
        { status: 404 }
      );
    }

    // Get file stats
    const fileStats = await stat(filePath);
    const ext = path.extname(filePath).slice(1);
    const filename = path.basename(filePath);

    // Determine destination path
    const series = volume.series;
    let destinationPath = filePath;
    let relativePath = filename;

    // Get naming config
    const namingConfig = await getNamingConfig();

    if (series.rootFolderPath) {
      // Create series folder using naming config
      const seriesTokens: NamingTokens = {
        seriesTitle: series.title,
        seriesYear: series.year || undefined,
        sortTitle: series.sortTitle,
        cleanTitle: series.cleanTitle,
      };
      const seriesFolderName = formatSeriesFolderName(seriesTokens, namingConfig);
      // Resolve paths to local filesystem
      const localRootPath = resolveToLocal(series.rootFolderPath);
      const localSeriesPath = series.path ? resolveToLocal(series.path) : null;
      const seriesFolder = localSeriesPath || path.join(localRootPath, seriesFolderName);

      try {
        await mkdir(seriesFolder, { recursive: true });
      } catch {
        // Folder might already exist
      }

      // Format new filename using naming config
      let newFilename: string;
      if (namingConfig.renameFiles) {
        const fileTokens: NamingTokens = {
          seriesTitle: series.title,
          seriesYear: series.year || undefined,
          volumeNumber: volume.volumeNumber ?? undefined,
        };
        newFilename = formatFileNameWithExtension(fileTokens, namingConfig, ext);
      } else {
        newFilename = filename;
      }
      destinationPath = path.join(seriesFolder, newFilename);
      relativePath = newFilename;

      // Move or copy file if not already in place
      if (filePath !== destinationPath) {
        try {
          if (copyMode) {
            await copyFile(filePath, destinationPath);
          } else {
            try {
              await rename(filePath, destinationPath);
            } catch (e: any) {
              if (e.code === 'EXDEV') {
                // Cross-device, use copy instead
                await copyFile(filePath, destinationPath);
              } else {
                throw e;
              }
            }
          }
        } catch (error) {
          return NextResponse.json(
            { error: `Failed to move file: ${error}` },
            { status: 500 }
          );
        }
      }

      // Update series path if not set
      if (!series.path) {
        await prisma.series.update({
          where: { id: series.id },
          data: { path: resolveToDb(seriesFolder) },
        });
      }
    }

    // Convert destination path to DB format for database storage
    const dbDestinationPath = resolveToDb(destinationPath);

    // Check if file is already linked
    const existingFile = await prisma.mediaFile.findFirst({
      where: { path: dbDestinationPath },
    });

    if (existingFile) {
      // Update existing record to link to this volume
      await prisma.mediaFile.update({
        where: { id: existingFile.id },
        data: { volumeId },
      });

      return NextResponse.json({
        success: true,
        mediaFileId: existingFile.id,
        updated: true,
      });
    }

    // Create new media file record
    const mediaFile = await prisma.mediaFile.create({
      data: {
        seriesId: series.id,
        volumeId,
        path: dbDestinationPath,
        relativePath,
        size: BigInt(fileStats.size),
        format: getFileFormat(ext) as any,
        sceneName: filename,
      },
    });

    // Create history entry
    await prisma.history.create({
      data: {
        seriesId: series.id,
        volumeId,
        mediaFileId: mediaFile.id,
        sourceTitle: filename,
        eventType: 'DOWNLOAD_FOLDER_IMPORTED',
        data: JSON.stringify({
          manualLink: true,
          sourcePath: filePath,
          destinationPath: dbDestinationPath,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      mediaFileId: mediaFile.id,
      path: dbDestinationPath,
    });
  } catch (error) {
    console.error('Error linking file to volume:', error);
    return NextResponse.json(
      { error: 'Failed to link file', details: String(error) },
      { status: 500 }
    );
  }
}
