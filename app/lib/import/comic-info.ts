// ComicInfo.xml reader for CBZ/CBR files
// Extracts metadata from ComicInfo.xml embedded in comic archives

import AdmZip from 'adm-zip';
import { parseStringPromise as parseXml } from 'xml2js';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

export interface ComicInfo {
  series?: string;
  title?: string;
  number?: string;      // Volume or issue number (string to handle decimals like "1.5")
  volume?: number;      // Volume number
  count?: number;       // Total count in series
  year?: number;
  month?: number;
  day?: number;
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;
  publisher?: string;
  imprint?: string;
  genre?: string;
  web?: string;
  pageCount?: number;
  languageISO?: string;
  format?: string;
  summary?: string;
  notes?: string;
  manga?: 'Unknown' | 'No' | 'Yes' | 'YesAndRightToLeft';
  characters?: string;
  teams?: string;
  locations?: string;
  scanInformation?: string;
  storyArc?: string;
  seriesGroup?: string;
  ageRating?: string;
  communityRating?: number;
}

/**
 * Read ComicInfo.xml from a CBZ file (ZIP archive)
 */
async function readFromCbz(filePath: string): Promise<ComicInfo | null> {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    // Find ComicInfo.xml (case-insensitive)
    const comicInfoEntry = entries.find(
      entry => entry.entryName.toLowerCase() === 'comicinfo.xml'
    );
    
    if (!comicInfoEntry) {
      return null;
    }
    
    const xmlContent = comicInfoEntry.getData().toString('utf8');
    return parseComicInfoXml(xmlContent);
  } catch (error) {
    console.error(`Error reading CBZ file ${filePath}:`, error);
    return null;
  }
}

/**
 * Read ComicInfo.xml from a CBR file (RAR archive)
 * Uses unrar command-line tool as fallback
 */
async function readFromCbr(filePath: string): Promise<ComicInfo | null> {
  try {
    // Try to use unrar to extract ComicInfo.xml
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'inkarr-cbr-'));
    
    try {
      // Extract only ComicInfo.xml
      execSync(`unrar e -y "${filePath}" ComicInfo.xml "${tempDir}/"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      
      const comicInfoPath = path.join(tempDir, 'ComicInfo.xml');
      if (existsSync(comicInfoPath)) {
        const xmlContent = readFileSync(comicInfoPath, 'utf8');
        return parseComicInfoXml(xmlContent);
      }
      
      // Try lowercase
      const comicInfoPathLower = path.join(tempDir, 'comicinfo.xml');
      if (existsSync(comicInfoPathLower)) {
        const xmlContent = readFileSync(comicInfoPathLower, 'utf8');
        return parseComicInfoXml(xmlContent);
      }
      
      return null;
    } finally {
      // Cleanup temp directory
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // unrar might not be installed, that's ok
    console.debug(`Could not read CBR file ${filePath}:`, error);
    return null;
  }
}

/**
 * Parse ComicInfo.xml content into a structured object
 */
async function parseComicInfoXml(xmlContent: string): Promise<ComicInfo | null> {
  try {
    const result = await parseXml(xmlContent, {
      explicitArray: false,
      ignoreAttrs: true,
      normalize: true,
      normalizeTags: false,
    });
    
    const ci = result?.ComicInfo;
    if (!ci) return null;
    
    const info: ComicInfo = {};
    
    // String fields
    if (ci.Series) info.series = String(ci.Series).trim();
    if (ci.Title) info.title = String(ci.Title).trim();
    if (ci.Number) info.number = String(ci.Number).trim();
    if (ci.Writer) info.writer = String(ci.Writer).trim();
    if (ci.Penciller) info.penciller = String(ci.Penciller).trim();
    if (ci.Inker) info.inker = String(ci.Inker).trim();
    if (ci.Colorist) info.colorist = String(ci.Colorist).trim();
    if (ci.Letterer) info.letterer = String(ci.Letterer).trim();
    if (ci.CoverArtist) info.coverArtist = String(ci.CoverArtist).trim();
    if (ci.Editor) info.editor = String(ci.Editor).trim();
    if (ci.Publisher) info.publisher = String(ci.Publisher).trim();
    if (ci.Imprint) info.imprint = String(ci.Imprint).trim();
    if (ci.Genre) info.genre = String(ci.Genre).trim();
    if (ci.Web) info.web = String(ci.Web).trim();
    if (ci.LanguageISO) info.languageISO = String(ci.LanguageISO).trim();
    if (ci.Format) info.format = String(ci.Format).trim();
    if (ci.Summary) info.summary = String(ci.Summary).trim();
    if (ci.Notes) info.notes = String(ci.Notes).trim();
    if (ci.Characters) info.characters = String(ci.Characters).trim();
    if (ci.Teams) info.teams = String(ci.Teams).trim();
    if (ci.Locations) info.locations = String(ci.Locations).trim();
    if (ci.ScanInformation) info.scanInformation = String(ci.ScanInformation).trim();
    if (ci.StoryArc) info.storyArc = String(ci.StoryArc).trim();
    if (ci.SeriesGroup) info.seriesGroup = String(ci.SeriesGroup).trim();
    if (ci.AgeRating) info.ageRating = String(ci.AgeRating).trim();
    
    // Numeric fields
    if (ci.Volume) info.volume = parseInt(String(ci.Volume), 10) || undefined;
    if (ci.Count) info.count = parseInt(String(ci.Count), 10) || undefined;
    if (ci.Year) info.year = parseInt(String(ci.Year), 10) || undefined;
    if (ci.Month) info.month = parseInt(String(ci.Month), 10) || undefined;
    if (ci.Day) info.day = parseInt(String(ci.Day), 10) || undefined;
    if (ci.PageCount) info.pageCount = parseInt(String(ci.PageCount), 10) || undefined;
    if (ci.CommunityRating) info.communityRating = parseFloat(String(ci.CommunityRating)) || undefined;
    
    // Manga field
    if (ci.Manga) {
      const mangaValue = String(ci.Manga).trim();
      if (['Unknown', 'No', 'Yes', 'YesAndRightToLeft'].includes(mangaValue)) {
        info.manga = mangaValue as ComicInfo['manga'];
      }
    }
    
    return info;
  } catch (error) {
    console.error('Error parsing ComicInfo.xml:', error);
    return null;
  }
}

/**
 * Read ComicInfo metadata from a comic archive file
 * Supports CBZ (ZIP), CBR (RAR), and CB7 (7-Zip) formats
 */
export async function readComicInfo(filePath: string): Promise<ComicInfo | null> {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.cbz':
      return readFromCbz(filePath);
    case '.cbr':
      return readFromCbr(filePath);
    case '.cb7':
      // 7-Zip support could be added with p7zip
      console.debug('CB7 format not yet supported for ComicInfo extraction');
      return null;
    default:
      return null;
  }
}

/**
 * Extract volume number from ComicInfo
 * Handles various formats like "1", "01", "1.5", etc.
 */
export function extractVolumeNumber(info: ComicInfo): number | undefined {
  // Prefer the explicit Volume field
  if (info.volume !== undefined && !isNaN(info.volume)) {
    return info.volume;
  }
  
  // Fall back to Number field if it looks like a volume number
  if (info.number) {
    const num = parseFloat(info.number);
    if (!isNaN(num) && num > 0) {
      return Math.floor(num); // Return integer part
    }
  }
  
  return undefined;
}

/**
 * Extract series title from ComicInfo
 */
export function extractSeriesTitle(info: ComicInfo): string | undefined {
  return info.series || undefined;
}

/**
 * Check if ComicInfo indicates this is manga (read right-to-left)
 */
export function isManga(info: ComicInfo): boolean {
  return info.manga === 'Yes' || info.manga === 'YesAndRightToLeft';
}
