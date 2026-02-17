// Import service for moving files from downloads to library
// Handles file organization, renaming, and database entry creation

import { rename, mkdir, copyFile, unlink, access, constants } from 'fs/promises';
import path from 'path';
import prisma from '@/app/lib/db';
import { ScannedFile, groupBySeries } from './scanner';
import { 
  getNamingConfig, 
  formatSeriesFolderName as formatSeriesFolder, 
  formatFileNameWithExtension,
  NamingConfig,
  NamingTokens 
} from '@/app/lib/naming';

export interface ImportOptions {
  /** Root folder path where files will be imported */
  rootFolderPath: string;
  /** Whether to copy files (true) or move them (false) */
  copyMode?: boolean;
  /** Series ID to import files to (if known) */
  seriesId?: number;
  /** Quality profile ID to assign */
  qualityProfileId?: number;
  /** Whether to delete source files after successful import */
  deleteSource?: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  importedFiles: ImportedFile[];
}

export interface ImportedFile {
  originalPath: string;
  newPath: string;
  seriesId: number;
  volumeId?: number;
  mediaFileId: number;
}

/**
 * Get the file format enum from extension
 */
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
 * Find or create a series from the parsed filename
 */
async function findOrCreateSeries(
  seriesTitle: string,
  rootFolderPath: string,
  namingConfig: NamingConfig,
  qualityProfileId?: number
): Promise<number> {
  const cleanTitle = seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Try to find existing series by clean title
  const existingSeries = await prisma.series.findFirst({
    where: {
      cleanTitle: cleanTitle,
    },
  });
  
  if (existingSeries) {
    return existingSeries.id;
  }
  
  // Create new series
  const sortTitle = seriesTitle.replace(/^(The|A|An)\s+/i, '');
  const tokens: NamingTokens = { seriesTitle, sortTitle, cleanTitle };
  const seriesFolderName = formatSeriesFolder(tokens, namingConfig);
  const seriesPath = path.join(rootFolderPath, seriesFolderName);
  
  const newSeries = await prisma.series.create({
    data: {
      title: seriesTitle,
      sortTitle,
      cleanTitle,
      mediaType: 'MANGA',
      status: 'CONTINUING',
      monitored: true,
      monitorStatus: 'ALL',
      path: seriesPath,
      rootFolderPath,
      qualityProfileId,
    },
  });
  
  return newSeries.id;
}

/**
 * Find or create a volume for a series
 */
async function findOrCreateVolume(
  seriesId: number,
  volumeNumber: number | undefined
): Promise<number | undefined> {
  if (volumeNumber === undefined) {
    return undefined;
  }
  
  const existingVolume = await prisma.volume.findFirst({
    where: {
      seriesId,
      volumeNumber,
    },
  });
  
  if (existingVolume) {
    return existingVolume.id;
  }
  
  const newVolume = await prisma.volume.create({
    data: {
      seriesId,
      volumeNumber,
      title: `Volume ${volumeNumber}`,
      monitored: true,
    },
  });
  
  return newVolume.id;
}

/**
 * Check if a file already exists in the database
 */
async function fileAlreadyImported(filePath: string): Promise<boolean> {
  const existing = await prisma.mediaFile.findFirst({
    where: {
      path: filePath,
    },
  });
  return !!existing;
}

/**
 * Import a single file to the library
 */
async function importFile(
  file: ScannedFile,
  options: ImportOptions,
  seriesId: number,
  namingConfig: NamingConfig
): Promise<ImportedFile> {
  const { rootFolderPath, copyMode = false, deleteSource = true } = options;
  const { parsed, format, size } = file;
  
  // Get the series info for folder structure
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
  });
  
  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }
  
  // Create series folder if it doesn't exist using naming config
  const seriesTokens: NamingTokens = {
    seriesTitle: series.title,
    seriesYear: series.year || undefined,
    sortTitle: series.sortTitle,
    cleanTitle: series.cleanTitle,
  };
  const seriesFolderName = formatSeriesFolder(seriesTokens, namingConfig);
  const seriesFolderPath = path.join(rootFolderPath, seriesFolderName);
  
  try {
    await access(seriesFolderPath, constants.F_OK);
  } catch {
    await mkdir(seriesFolderPath, { recursive: true });
  }
  
  // Format the new filename using naming config
  const fileTokens: NamingTokens = {
    seriesTitle: series.title,
    seriesYear: series.year || undefined,
    volumeNumber: parsed.volumeNumber,
    chapterNumber: parsed.chapterNumber,
    releaseGroup: parsed.releaseGroup,
  };
  
  let newFilename: string;
  if (namingConfig.renameFiles) {
    newFilename = formatFileNameWithExtension(fileTokens, namingConfig, format);
  } else {
    // Keep original filename
    newFilename = file.filename;
  }
  const newPath = path.join(seriesFolderPath, newFilename);
  
  // Check if destination already exists
  try {
    await access(newPath, constants.F_OK);
    throw new Error(`Destination file already exists: ${newPath}`);
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  
  // Move or copy the file
  if (copyMode) {
    await copyFile(file.path, newPath);
  } else {
    try {
      await rename(file.path, newPath);
    } catch (e: any) {
      // If rename fails (cross-device), fall back to copy + delete
      if (e.code === 'EXDEV') {
        await copyFile(file.path, newPath);
        if (deleteSource) {
          await unlink(file.path);
        }
      } else {
        throw e;
      }
    }
  }
  
  // Find or create volume
  const volumeId = await findOrCreateVolume(seriesId, parsed.volumeNumber);
  
  // Update series path if not set
  if (!series.path) {
    await prisma.series.update({
      where: { id: seriesId },
      data: { path: seriesFolderPath },
    });
  }
  
  // Create media file entry
  const mediaFile = await prisma.mediaFile.create({
    data: {
      seriesId,
      volumeId,
      path: newPath,
      relativePath: newFilename,
      size: BigInt(size),
      format: getFileFormat(format) as any,
      releaseGroup: parsed.releaseGroup,
      sceneName: file.filename,
    },
  });
  
  // Create history entry
  await prisma.history.create({
    data: {
      seriesId,
      volumeId,
      mediaFileId: mediaFile.id,
      sourceTitle: file.filename,
      eventType: 'DOWNLOAD_FOLDER_IMPORTED',
      data: JSON.stringify({
        sourcePath: file.path,
        destinationPath: newPath,
        size,
        format,
      }),
    },
  });
  
  return {
    originalPath: file.path,
    newPath,
    seriesId,
    volumeId,
    mediaFileId: mediaFile.id,
  };
}

/**
 * Import multiple files to the library
 */
export async function importFiles(
  files: ScannedFile[],
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    imported: 0,
    failed: 0,
    errors: [],
    importedFiles: [],
  };
  
  // Get naming config
  const namingConfig = await getNamingConfig();
  
  // Group files by series
  const groups = groupBySeries(files);
  
  for (const [, seriesFiles] of groups) {
    const seriesTitle = seriesFiles[0].parsed.seriesTitle;
    
    try {
      // Find or create series
      const seriesId = options.seriesId ?? await findOrCreateSeries(
        seriesTitle,
        options.rootFolderPath,
        namingConfig,
        options.qualityProfileId
      );
      
      // Import each file
      for (const file of seriesFiles) {
        try {
          // Check if already imported
          if (await fileAlreadyImported(file.path)) {
            result.errors.push(`File already imported: ${file.filename}`);
            result.failed++;
            continue;
          }
          
          const importedFile = await importFile(file, options, seriesId, namingConfig);
          result.importedFiles.push(importedFile);
          result.imported++;
        } catch (error) {
          result.errors.push(`Failed to import ${file.filename}: ${error}`);
          result.failed++;
        }
      }
    } catch (error) {
      result.errors.push(`Failed to process series "${seriesTitle}": ${error}`);
      result.failed += seriesFiles.length;
    }
  }
  
  result.success = result.failed === 0;
  return result;
}

/**
 * Import all files from a scan directly
 */
export async function importFromScan(
  downloadFolderPath: string,
  options: ImportOptions
): Promise<ImportResult> {
  const { scanDirectory } = await import('./scanner');
  const files = await scanDirectory(downloadFolderPath);
  return importFiles(files, options);
}
