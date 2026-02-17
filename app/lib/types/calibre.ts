// Calibre Integration Types for Inkarr
// Based on Calibre Content Server API

/**
 * Calibre library settings configuration
 */
export interface CalibreSettings {
  id?: number;
  host: string;
  port: number;
  urlBase?: string;
  username?: string;
  password?: string;
  library?: string;
  outputFormat?: string; // Comma-separated: EPUB,AZW3,PDF
  outputProfile?: CalibreProfile;
  useSsl: boolean;
}

/**
 * Output profiles for Calibre ebook conversion
 */
export enum CalibreProfile {
  DEFAULT = 'default',
  KINDLE = 'kindle',
  KINDLE_DX = 'kindle_dx',
  KINDLE_FIRE = 'kindle_fire',
  KINDLE_OASIS = 'kindle_oasis',
  KINDLE_PW = 'kindle_pw',
  KINDLE_PW3 = 'kindle_pw3',
  KINDLE_VOYAGE = 'kindle_voyage',
  KOBO = 'kobo',
  NOOK = 'nook',
  NOOK_COLOR = 'nook_color',
  NOOK_HD_PLUS = 'nook_hd_plus',
  SONY = 'sony',
  IPAD = 'ipad',
  IPAD3 = 'ipad3',
  GENERIC_EINK = 'generic_eink',
  GENERIC_EINK_HD = 'generic_eink_hd',
  GENERIC_EINK_LARGE = 'generic_eink_large',
  TABLET = 'tablet',
}

/**
 * Supported Calibre output formats
 */
export enum CalibreFormat {
  EPUB = 'EPUB',
  AZW3 = 'AZW3',
  MOBI = 'MOBI',
  DOCX = 'DOCX',
  FB2 = 'FB2',
  HTMLZ = 'HTMLZ',
  LIT = 'LIT',
  LRF = 'LRF',
  PDB = 'PDB',
  PDF = 'PDF',
  PMLZ = 'PMLZ',
  RB = 'RB',
  RTF = 'RTF',
  SNB = 'SNB',
  TCR = 'TCR',
  TXT = 'TXT',
  TXTZ = 'TXTZ',
  ZIP = 'ZIP',
  CBZ = 'CBZ',
  CBR = 'CBR',
}

/**
 * Calibre book metadata from content server
 */
export interface CalibreBook {
  id: number;
  title: string;
  authors: string[];
  authorSort?: string;
  pubDate?: Date | string;
  publisher?: string;
  languages: string[];
  tags: string[];
  comments?: string;
  rating: number;
  identifiers: Record<string, string>;
  series?: string;
  position?: number; // series_index
  formats: Record<string, CalibreBookFormat>;
}

/**
 * Format information for a Calibre book
 */
export interface CalibreBookFormat {
  path: string;
  size: number;
  mtime: string;
  lastModified?: Date;
}

/**
 * Calibre library information
 */
export interface CalibreLibraryInfo {
  libraryMap: Record<string, string>;
  defaultLibrary: string;
}

/**
 * Calibre import job result
 */
export interface CalibreImportJob {
  id: number; // book_id
  jobId: number;
  filename: string;
  authors: string[];
  title: string;
  languages: string[];
}

/**
 * Calibre book data including conversion options
 */
export interface CalibreBookData {
  conversionOptions: CalibreConversionOptions;
  bookId: number;
  inputFormats: string[];
  outputFormats: string[];
}

/**
 * Calibre conversion options
 */
export interface CalibreConversionOptions {
  options: CalibreConversionSettings;
  inputFmt: string;
  outputFmt: string;
}

/**
 * Detailed conversion settings
 */
export interface CalibreConversionSettings {
  outputProfile?: string;
}

/**
 * Payload for setting Calibre book fields
 */
export interface CalibreChangesPayload {
  changes: CalibreChanges;
  loadedBookIds: number[];
}

/**
 * Changes to apply to a Calibre book
 */
export interface CalibreChanges {
  title?: string;
  authors?: string[];
  cover?: string; // Base64 encoded image
  pubDate?: Date | string;
  publisher?: string;
  languages?: string;
  tags?: string[];
  comments?: string;
  rating?: number;
  identifiers?: Record<string, string>;
  series?: string | null;
  seriesIndex?: number;
  addedFormats?: CalibreAddFormat[];
  removedFormats?: string[];
}

/**
 * Format to add to a Calibre book
 */
export interface CalibreAddFormat {
  ext: string;
  data: string; // Base64 encoded file content
}

/**
 * Category listing from Calibre (for getting book IDs)
 */
export interface CalibreCategory {
  bookIds: number[];
  totalNum: number;
  offset: number;
  num: number;
}

/**
 * Calibre conversion status
 */
export interface CalibreConversionStatus {
  running: boolean;
  ok: boolean;
  traceback?: string;
  log?: string;
}

/**
 * Result of syncing a file to Calibre
 */
export interface CalibreSyncResult {
  success: boolean;
  calibreId?: number;
  path?: string;
  error?: string;
}

/**
 * Test connection result
 */
export interface CalibreTestResult {
  success: boolean;
  message: string;
  libraries?: string[];
  defaultLibrary?: string;
}

/**
 * Calibre validation error
 */
export interface CalibreValidationError {
  field: string;
  message: string;
}
