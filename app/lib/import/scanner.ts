// Downloads folder scanner for Inkarr
// Scans the downloads folder for media files and parses their metadata

import { readdir, stat } from 'fs/promises';
import path from 'path';
import { readComicInfo, extractVolumeNumber, extractSeriesTitle, ComicInfo } from './comic-info';
import { getInkarrContentPaths } from './download-client-query';

// Extensions that support ComicInfo.xml metadata
const COMIC_INFO_EXTENSIONS = ['.cbz', '.cbr', '.cb7'];

export interface ScannedFile {
  filename: string;
  path: string;
  relativePath: string;
  size: number;
  format: string;
  modifiedAt: Date;
  parsed: ParsedFilename;
  comicInfo?: ComicInfo;  // Metadata from ComicInfo.xml if available
}

export interface ParsedFilename {
  seriesTitle: string;
  volumeNumber?: number;
  chapterNumber?: number;
  releaseGroup?: string;
  year?: number;
  quality?: string;
}

/**
 * Parse a filename to extract series title, volume/chapter number, etc.
 * Examples:
 * - "Jujutsu Kaisen - Vol.001.cbz" -> { seriesTitle: "Jujutsu Kaisen", volumeNumber: 1 }
 * - "One Piece v23 (Digital) [GroupName].cbz" -> { seriesTitle: "One Piece", volumeNumber: 23, releaseGroup: "GroupName" }
 * - "Naruto - Chapter 100.cbz" -> { seriesTitle: "Naruto", chapterNumber: 100 }
 */
export function parseFilename(filename: string): ParsedFilename {
  // Remove extension
  const ext = path.extname(filename);
  let name = filename.replace(ext, '');

  const result: ParsedFilename = {
    seriesTitle: '',
  };

  // Extract release group - [GroupName] or (GroupName) at end
  const releaseGroupMatch = name.match(/[\[\(]([^\[\]\(\)]+)[\]\)]$/);
  if (releaseGroupMatch) {
    result.releaseGroup = releaseGroupMatch[1].trim();
    name = name.replace(releaseGroupMatch[0], '').trim();
  }

  // Extract quality indicators
  const qualityMatch = name.match(/\b(Digital|Scan|HQ|LQ|Web|Webrip)\b/i);
  if (qualityMatch) {
    result.quality = qualityMatch[1];
    name = name.replace(qualityMatch[0], '').trim();
  }

  // Clean up common patterns
  name = name.replace(/[\[\(][^\[\]\(\)]*[\]\)]/g, ' ').trim();

  // Extract volume number - various patterns
  // Vol.001, Vol 1, v01, Volume 1, etc.
  const volumePatterns = [
    /[-\s]+Vol\.?\s*(\d+)/i,
    /[-\s]+Volume\s*(\d+)/i,
    /[-\s]+v(\d+)/i,
    /\s+(\d+)$/,
  ];

  for (const pattern of volumePatterns) {
    const match = name.match(pattern);
    if (match) {
      result.volumeNumber = parseInt(match[1], 10);
      name = name.replace(pattern, '').trim();
      break;
    }
  }

  // Extract chapter number
  const chapterPatterns = [
    /[-\s]+Ch\.?\s*(\d+(?:\.\d+)?)/i,
    /[-\s]+Chapter\s*(\d+(?:\.\d+)?)/i,
    /[-\s]+c(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of chapterPatterns) {
    const match = name.match(pattern);
    if (match) {
      result.chapterNumber = parseFloat(match[1]);
      name = name.replace(pattern, '').trim();
      break;
    }
  }

  // Extract year
  const yearMatch = name.match(/\((\d{4})\)/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1], 10);
    name = name.replace(yearMatch[0], '').trim();
  }

  // Clean up the series title
  result.seriesTitle = name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*$/, '')
    .trim();

  return result;
}

/**
 * Parse a folder name to extract series metadata
 * Example: "Jujutsu Kaisen [Vol.1 - Vol.30][Inventario-Oculto][CBZ]"
 */
export function parseFolderName(folderName: string): ParsedFilename & { volumeRange?: [number, number] } {
  let name = folderName;
  const result: ParsedFilename & { volumeRange?: [number, number] } = {
    seriesTitle: '',
  };

  // Extract release group - [GroupName]
  const groupPatterns = [
    /\[([A-Za-z][A-Za-z0-9\-_]+)\](?:\[CBZ\])?$/i,
    /\[([A-Za-z][A-Za-z0-9\-_]+)\](?=\s*\[)/i,
  ];
  
  for (const pattern of groupPatterns) {
    const match = name.match(pattern);
    if (match && !match[1].match(/^(Vol|Chapter|CBZ|CBR|PDF)/i)) {
      result.releaseGroup = match[1];
      name = name.replace(match[0], '').trim();
      break;
    }
  }

  // Extract format indicator [CBZ], [CBR], etc.
  name = name.replace(/\[(CBZ|CBR|CB7|PDF|EPUB)\]/gi, '').trim();

  // Extract volume range [Vol.1 - Vol.30]
  const volRangeMatch = name.match(/\[Vol\.?\s*(\d+)\s*-\s*Vol\.?\s*(\d+)\]/i);
  if (volRangeMatch) {
    result.volumeRange = [parseInt(volRangeMatch[1], 10), parseInt(volRangeMatch[2], 10)];
    name = name.replace(volRangeMatch[0], '').trim();
  }

  // Clean up the series title
  result.seriesTitle = name
    .replace(/[\[\]]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

/**
 * Recursively scan a directory for media files
 * @param dirPath - Directory to scan
 * @param basePath - Base path for calculating relative paths (defaults to dirPath)
 * @param isRootCall - Internal flag to distinguish root call from recursive calls
 * @param options - Scan options
 */
export async function scanDirectory(
  dirPath: string,
  basePath: string = dirPath,
  isRootCall: boolean = true,
  options: { filterByDownloadClient?: boolean; downloadClientPaths?: Set<string> } = {}
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  
  // Only fetch download client paths once at the root call
  let downloadClientPaths = options.downloadClientPaths;
  const filterByDownloadClient = options.filterByDownloadClient ?? false;
  
  if (isRootCall && filterByDownloadClient) {
    downloadClientPaths = await getInkarrContentPaths();
    console.log(`[Scanner] Filter by download client enabled. Found ${downloadClientPaths.size} inkarr download paths:`);
    for (const p of downloadClientPaths) {
      console.log(`  - ${p}`);
    }
    if (downloadClientPaths.size === 0) {
      console.log('[Scanner] No inkarr downloads found - no files will be imported');
    }
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories (mark as not root call, pass download client paths)
        const subResults = await scanDirectory(fullPath, basePath, false, { 
          filterByDownloadClient, 
          downloadClientPaths 
        });
        results.push(...subResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // When filtering by download client, accept any file from inkarr downloads
        // Otherwise, use extension whitelist as fallback
        if (filterByDownloadClient && downloadClientPaths) {
          const normalizedPath = fullPath.replace(/\/+/g, '/');
          let isInkarrDownload = false;
          
          for (const contentPath of downloadClientPaths) {
            const normalizedContentPath = contentPath.replace(/\/+/g, '/');
            if (normalizedPath.startsWith(normalizedContentPath + '/') || 
                normalizedPath === normalizedContentPath) {
              isInkarrDownload = true;
              break;
            }
          }
          
          if (!isInkarrDownload) {
            continue; // Skip files not from inkarr downloads
          }
        }
        
        const stats = await stat(fullPath);
        const parsed = parseFilename(entry.name);
        
        // Try to read ComicInfo.xml from the archive
        let comicInfo: ComicInfo | undefined;
        if (COMIC_INFO_EXTENSIONS.includes(ext)) {
          const info = await readComicInfo(fullPath);
          if (info) {
            comicInfo = info;
            
            // Use ComicInfo metadata to override/improve parsed values
            const ciSeriesTitle = extractSeriesTitle(info);
            const ciVolumeNumber = extractVolumeNumber(info);
            
            // Prefer ComicInfo series title if available and looks valid
            if (ciSeriesTitle && ciSeriesTitle.length >= 2) {
              parsed.seriesTitle = ciSeriesTitle;
            }
            
            // Prefer ComicInfo volume number if available
            if (ciVolumeNumber !== undefined) {
              parsed.volumeNumber = ciVolumeNumber;
            }
            
            // Use ComicInfo year if available
            if (info.year) {
              parsed.year = info.year;
            }
          }
        }
        
        // If we couldn't parse the filename well, try the parent folder
        if (!parsed.seriesTitle || parsed.seriesTitle.length < 2) {
          const parentFolder = path.basename(path.dirname(fullPath));
          if (parentFolder !== path.basename(basePath)) {
            const folderParsed = parseFolderName(parentFolder);
            parsed.seriesTitle = folderParsed.seriesTitle || parsed.seriesTitle;
          }
        }

        results.push({
          filename: entry.name,
          path: fullPath,
          relativePath,
          size: stats.size,
          format: ext.slice(1).toUpperCase(),
          modifiedAt: stats.mtime,
          parsed,
          comicInfo,
        });
      }
    }
  } catch (error) {
    // For root call, throw the error so the API can handle it
    // For recursive calls (subdirectories), log and continue
    if (isRootCall) {
      throw new Error(`Error scanning directory ${dirPath}: ${error}`);
    }
    console.error(`Error scanning subdirectory ${dirPath}:`, error);
  }

  return results;
}

/**
 * Group scanned files by series
 */
export function groupBySeries(files: ScannedFile[]): Map<string, ScannedFile[]> {
  const groups = new Map<string, ScannedFile[]>();

  for (const file of files) {
    const key = file.parsed.seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(file);
  }

  // Sort files within each group by volume/chapter number
  for (const [, files] of groups) {
    files.sort((a, b) => {
      const volA = a.parsed.volumeNumber ?? 0;
      const volB = b.parsed.volumeNumber ?? 0;
      if (volA !== volB) return volA - volB;
      
      const chA = a.parsed.chapterNumber ?? 0;
      const chB = b.parsed.chapterNumber ?? 0;
      return chA - chB;
    });
  }

  return groups;
}
