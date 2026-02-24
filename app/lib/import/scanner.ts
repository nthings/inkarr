// Downloads folder scanner for Inkarr
// Scans the downloads folder for media files and parses their metadata

import { readdir, stat } from 'fs/promises';
import path from 'path';
import { readComicInfo, extractVolumeNumber, extractSeriesTitle, ComicInfo } from './comic-info';
import { getInkarrContentPaths } from './download-client-query';

// Extensions that support ComicInfo.xml metadata
const COMIC_INFO_EXTENSIONS = ['.cbz', '.cbr', '.cb7'];

// All supported media file extensions
const SUPPORTED_EXTENSIONS = [
  // Comic archives
  '.cbz', '.cbr', '.cb7', '.cbt',
  // eBooks  
  '.epub', '.pdf', '.mobi', '.azw', '.azw3',
  // Other archives that might contain comics
  '.zip', '.rar', '.7z',
];

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

// Scene release tags to strip from series titles
const SCENE_RELEASE_TAGS = [
  // Language tags
  'SWEDISH', 'SWEDiSH', 'ENGLISH', 'ENGLiSH', 'FRENCH', 'GERMAN', 'SPANISH', 'ITALIAN', 'JAPANESE', 'KOREAN', 'CHINESE',
  // Format tags
  'HYBRID', 'HYBRiD', 'COMIC', 'COMiC', 'MANGA', 'EBOOK', 'eBook', 'PDF', 'CBZ', 'CBR', 'EPUB',
  // Quality tags
  'DIGITAL', 'DiGiTAL', 'SCAN', 'HQ', 'LQ', 'WEB', 'WEBRIP', 'RETAIL',
  // Common scene tags
  'REPACK', 'PROPER', 'INTERNAL', 'iNTERNA', 'READNFO', 'DIRFIX', 'NFOFIX',
];

/**
 * Parse a scene release name (dots as separators)
 * Example: "The.Walking.Dead.No.03.2014.SWEDiSH.HYBRiD.COMiC.eBook-AgentX"
 * Note: "No." in comics refers to issue/chapter numbers, not volumes
 */
function parseSceneReleaseName(name: string, result: ParsedFilename): ParsedFilename {
  // Extract release group (after hyphen at end)
  const groupMatch = name.match(/-([A-Za-z][A-Za-z0-9]+)$/);
  if (groupMatch) {
    result.releaseGroup = groupMatch[1];
    name = name.replace(groupMatch[0], '');
  }
  
  // Split by dots
  const parts = name.split('.');
  
  // Find and extract issue/chapter number (No.XX, Issue.XX) or volume number (Vol.XX)
  // In American comics, "No." refers to issue numbers (chapters), not volumes
  let numberIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Check for "No" followed by number - this is CHAPTER/ISSUE number in comics
    if (part.toLowerCase() === 'no' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      result.chapterNumber = parseInt(parts[i + 1], 10);
      numberIndex = i;
      break;
    }
    
    // Check for "NoXX" pattern (merged) - CHAPTER number
    const noMatch = part.match(/^No\.?(\d+)$/i);
    if (noMatch) {
      result.chapterNumber = parseInt(noMatch[1], 10);
      numberIndex = i;
      break;
    }
    
    // Check for "Issue" followed by number - CHAPTER number
    if (part.toLowerCase() === 'issue' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      result.chapterNumber = parseInt(parts[i + 1], 10);
      numberIndex = i;
      break;
    }
    
    // Check for "Vol" or "Volume" followed by number - VOLUME number
    if ((part.toLowerCase() === 'vol' || part.toLowerCase() === 'volume') && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      result.volumeNumber = parseInt(parts[i + 1], 10);
      numberIndex = i;
      break;
    }
    
    // Check for "VolXX" or "vXX" pattern - VOLUME number
    const volMatch = part.match(/^(?:Vol|v)\.?(\d+)$/i);
    if (volMatch) {
      result.volumeNumber = parseInt(volMatch[1], 10);
      numberIndex = i;
      break;
    }
  }
  
  // Find year (4 digits, typically 1900-2099)
  for (let i = 0; i < parts.length; i++) {
    if (/^(19|20)\d{2}$/.test(parts[i])) {
      result.year = parseInt(parts[i], 10);
      break;
    }
  }
  
  // Build series title from parts before number indicator/year/tags
  const titleParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();
    
    // Stop at number indicator
    if (numberIndex >= 0 && i >= numberIndex) break;
    
    // Stop at year
    if (/^(19|20)\d{2}$/.test(part)) break;
    
    // Skip if it's a known tag
    if (SCENE_RELEASE_TAGS.some(tag => tag.toLowerCase() === partLower)) break;
    
    // Skip standalone numbers at the end (often quality like "720" or stray numbers)
    if (/^\d+$/.test(part) && i === parts.length - 1) break;
    
    titleParts.push(part);
  }
  
  // Join with spaces and clean up
  result.seriesTitle = titleParts.join(' ').trim();
  
  return result;
}

/**
 * Parse a filename to extract series title, volume/chapter number, etc.
 * Handles both clean filenames and scene release naming conventions.
 * Examples:
 * - "Jujutsu Kaisen - Vol.001.cbz" -> { seriesTitle: "Jujutsu Kaisen", volumeNumber: 1 }
 * - "One Piece v23 (Digital) [GroupName].cbz" -> { seriesTitle: "One Piece", volumeNumber: 23, releaseGroup: "GroupName" }
 * - "Naruto - Chapter 100.cbz" -> { seriesTitle: "Naruto", chapterNumber: 100 }
 * - "The.Walking.Dead.No.03.2014.SWEDiSH.HYBRiD.COMiC.eBook-AgentX.pdf" -> { seriesTitle: "The Walking Dead", volumeNumber: 3, year: 2014, releaseGroup: "AgentX" }
 */
export function parseFilename(filename: string): ParsedFilename {
  // Remove extension
  const ext = path.extname(filename);
  let name = filename.replace(ext, '');

  const result: ParsedFilename = {
    seriesTitle: '',
  };

  // Check if this looks like a scene release (dots as separators)
  const isSceneRelease = name.includes('.') && !name.includes(' ') && name.split('.').length > 3;
  
  if (isSceneRelease) {
    return parseSceneReleaseName(name, result);
  }

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
    console.log(`[Scanner] Filter by download client enabled. Found ${downloadClientPaths.size} download paths:`);
    let count = 0;
    for (const p of downloadClientPaths) {
      if (count < 5) console.log(`[Scanner]   - ${p}`);
      count++;
    }
    if (count > 5) console.log(`[Scanner]   ... and ${count - 5} more`);
    if (downloadClientPaths.size === 0) {
      console.log('[Scanner] No category downloads found - no files will be imported');
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
        
        // Only process supported media file extensions
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          continue;
        }
        
        // When filtering by download client, only include files from tagged downloads
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
            continue; // Skip files not from tagged downloads
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
