// Import service for moving files from downloads to library
// Handles file organization, renaming, and database entry creation

import { rename, mkdir, copyFile, unlink, access, constants } from 'fs/promises';
import path from 'path';
import prisma from '@/app/lib/db';
import { ScannedFile, groupBySeries } from './scanner';
import { ComicInfo, isManga } from './comic-info';
import { 
  getNamingConfig, 
  formatSeriesFolderName as formatSeriesFolder, 
  formatFileNameWithExtension,
  NamingConfig,
  NamingTokens 
} from '@/app/lib/naming';
import { resolveToDb, resolveToLocal } from '@/app/lib/path-mapping';

export interface ImportOptions {
  /** Root folder path where files will be imported (optional - will auto-select based on media type) */
  rootFolderPath?: string;
  /** Whether to copy files (true) or move them (false) */
  copyMode?: boolean;
  /** Series ID to import files to (if known) */
  seriesId?: number;
  /** Quality profile ID to assign */
  qualityProfileId?: number;
  /** Whether to delete source files after successful import */
  deleteSource?: boolean;
  /** Whether to require matching an existing volume (skip files that don't match) */
  requireVolumeMatch?: boolean;
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
  chapterId?: number;
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
 * Determine media type from ComicInfo metadata
 * Returns 'MANGA' if manga flag is set, otherwise 'COMIC'
 */
function determineMediaType(files: ScannedFile[]): 'MANGA' | 'COMIC' {
  // Check if any file has manga flag set in ComicInfo
  for (const file of files) {
    if (file.comicInfo && isManga(file.comicInfo)) {
      return 'MANGA';
    }
  }
  
  // Default to COMIC if no manga indicator found
  // (In practice, most downloads without ComicInfo are western comics)
  return 'COMIC';
}

/**
 * Select the appropriate root folder based on media type
 */
async function selectRootFolder(
  mediaType: 'MANGA' | 'COMIC',
  explicitRootPath?: string
): Promise<{ path: string; localPath: string } | null> {
  // If explicit path provided, use it
  if (explicitRootPath) {
    return {
      path: explicitRootPath,
      localPath: resolveToLocal(explicitRootPath),
    };
  }
  
  // Try to find a root folder matching the media type
  let rootFolder = await prisma.rootFolder.findFirst({
    where: { mediaType },
    orderBy: { id: 'asc' },
  });
  
  // Fall back to any root folder if no matching type found
  if (!rootFolder) {
    rootFolder = await prisma.rootFolder.findFirst({
      orderBy: { id: 'asc' },
    });
  }
  
  if (!rootFolder) {
    return null;
  }
  
  return {
    path: rootFolder.path,
    localPath: resolveToLocal(rootFolder.path),
  };
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
  
  // Convert paths to DB format for storage (e.g., /srv/media/comics -> /data/comics)
  const dbSeriesPath = resolveToDb(seriesPath);
  const dbRootFolderPath = resolveToDb(rootFolderPath);
  
  const newSeries = await prisma.series.create({
    data: {
      title: seriesTitle,
      sortTitle,
      cleanTitle,
      mediaType: 'MANGA',
      status: 'CONTINUING',
      monitored: true,
      monitorStatus: 'ALL',
      path: dbSeriesPath,
      rootFolderPath: dbRootFolderPath,
      qualityProfileId,
    },
  });
  
  return newSeries.id;
}

/**
 * Find or create a volume for a series
 * If the volume doesn't exist, it will be created automatically during import
 */
async function findOrCreateVolume(
  seriesId: number,
  volumeNumber: number | undefined,
  seriesTitle: string
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
  
  // Volume doesn't exist - create it automatically
  console.log(`Creating volume ${volumeNumber} for series ${seriesId} (${seriesTitle})`);
  
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
 * Find or create a chapter/issue for a series
 * If the chapter doesn't exist, it will be created automatically during import
 * Note: In American comics, "No." refers to issue numbers which map to chapters
 */
async function findOrCreateChapter(
  seriesId: number,
  chapterNumber: number | undefined,
  seriesTitle: string
): Promise<number | undefined> {
  if (chapterNumber === undefined) {
    return undefined;
  }
  
  const existingChapter = await prisma.chapter.findFirst({
    where: {
      seriesId,
      chapterNumber,
    },
  });
  
  if (existingChapter) {
    return existingChapter.id;
  }
  
  // Chapter doesn't exist - create it automatically
  console.log(`Creating chapter/issue ${chapterNumber} for series ${seriesId} (${seriesTitle})`);
  
  const newChapter = await prisma.chapter.create({
    data: {
      seriesId,
      chapterNumber,
      title: `Issue #${chapterNumber}`,
      monitored: true,
    },
  });
  
  return newChapter.id;
}

/**
 * Verify that ComicInfo series title matches the target series
 * Returns a confidence score (0-1) for the match
 */
function verifySeriesMatch(
  comicInfo: ComicInfo | undefined,
  seriesTitle: string
): { matches: boolean; confidence: number; reason?: string } {
  if (!comicInfo?.series) {
    return { matches: true, confidence: 0.5, reason: 'No ComicInfo series to verify against' };
  }
  
  const ciTitle = comicInfo.series.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetTitle = seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match
  if (ciTitle === targetTitle) {
    return { matches: true, confidence: 1.0 };
  }
  
  // Check if one contains the other (partial match)
  if (ciTitle.includes(targetTitle) || targetTitle.includes(ciTitle)) {
    return { matches: true, confidence: 0.8, reason: 'Partial series title match' };
  }
  
  // Check for common variations (e.g., "Jojo's Bizarre Adventure" vs "Jojo no Kimyou na Bouken")
  // For now, just use the clean titles comparison
  if (ciTitle.length > 3 && targetTitle.length > 3) {
    // Simple similarity check - if first 4+ characters match
    const minLen = Math.min(ciTitle.length, targetTitle.length, 10);
    const prefix1 = ciTitle.substring(0, minLen);
    const prefix2 = targetTitle.substring(0, minLen);
    if (prefix1 === prefix2) {
      return { matches: true, confidence: 0.7, reason: 'Series title prefix match' };
    }
  }
  
  return { 
    matches: false, 
    confidence: 0.0, 
    reason: `ComicInfo series "${comicInfo.series}" does not match target "${seriesTitle}"` 
  };
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
  const { rootFolderPath: optionalRootPath, copyMode = false, deleteSource = true, requireVolumeMatch = false } = options;
  
  if (!optionalRootPath) {
    throw new Error('rootFolderPath is required for file import');
  }
  const rootFolderPath: string = optionalRootPath;
  
  const { parsed, format, size, comicInfo } = file;
  
  // Get the series info for folder structure
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
  });
  
  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }
  
  // Verify series match using ComicInfo if available
  const seriesMatch = verifySeriesMatch(comicInfo, series.title);
  if (!seriesMatch.matches) {
    throw new Error(`Series mismatch: ${seriesMatch.reason}`);
  }
  if (seriesMatch.confidence < 0.7) {
    console.warn(`Low confidence series match (${seriesMatch.confidence}) for ${file.filename}: ${seriesMatch.reason}`);
  }
  
  // Find or create volume for this file (if volume number detected)
  const volumeId = await findOrCreateVolume(seriesId, parsed.volumeNumber, series.title);
  
  // Find or create chapter for this file (if chapter/issue number detected)
  const chapterId = await findOrCreateChapter(seriesId, parsed.chapterNumber, series.title);
  
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
  
  // Convert paths to DB format for storage
  const dbSeriesFolderPath = resolveToDb(seriesFolderPath);
  const dbNewPath = resolveToDb(newPath);
  
  // Update series path if not set
  if (!series.path) {
    await prisma.series.update({
      where: { id: seriesId },
      data: { path: dbSeriesFolderPath },
    });
  }
  
  // Create media file entry
  const mediaFile = await prisma.mediaFile.create({
    data: {
      seriesId,
      volumeId,
      chapterId,
      path: dbNewPath,
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
      chapterId,
      mediaFileId: mediaFile.id,
      sourceTitle: file.filename,
      eventType: 'DOWNLOAD_FOLDER_IMPORTED',
      data: JSON.stringify({
        sourcePath: file.path,
        destinationPath: dbNewPath,
        size,
        format,
      }),
    },
  });
  
  return {
    originalPath: file.path,
    newPath: dbNewPath,
    seriesId,
    volumeId,
    chapterId,
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
      // Determine media type based on ComicInfo from files in this series
      const mediaType = determineMediaType(seriesFiles);
      
      // Select appropriate root folder for this media type
      const rootFolder = await selectRootFolder(mediaType, options.rootFolderPath);
      
      if (!rootFolder) {
        result.errors.push(`No root folder configured for "${seriesTitle}". Please add a root folder.`);
        result.failed += seriesFiles.length;
        continue;
      }
      
      // Create options with the selected root folder
      const seriesOptions: ImportOptions = {
        ...options,
        rootFolderPath: rootFolder.localPath,
      };
      
      // Defer series creation until first successful file import
      let seriesId: number | undefined = options.seriesId;
      
      // Import each file
      for (const file of seriesFiles) {
        try {
          // Check if already imported
          if (await fileAlreadyImported(file.path)) {
            result.errors.push(`File already imported: ${file.filename}`);
            result.failed++;
            continue;
          }
          
          // Only create series when we have a file ready to import
          if (seriesId === undefined) {
            seriesId = await findOrCreateSeries(
              seriesTitle,
              rootFolder.localPath,
              namingConfig,
              options.qualityProfileId
            );
          }
          
          const importedFile = await importFile(file, seriesOptions, seriesId, namingConfig);
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
