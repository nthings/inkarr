// Naming utility for formatting file and folder names based on config

import prisma from '@/app/lib/db';

export interface NamingConfig {
  id: number;
  renameFiles: boolean;
  replaceIllegalChars: boolean;
  colonReplacementFormat: string;
  standardFileFormat: string;
  seriesFolderFormat: string;
  creatorFolderFormat: string;
  volumeFolderFormat?: string;
}

// Default naming configuration
export const DEFAULT_NAMING_CONFIG: Omit<NamingConfig, 'id'> = {
  renameFiles: true,
  replaceIllegalChars: true,
  colonReplacementFormat: 'smart',
  standardFileFormat: '{Series Title} - {Volume Number} - {Chapter Number}',
  seriesFolderFormat: '{Series Title}',
  creatorFolderFormat: '{Creator Name}',
  volumeFolderFormat: 'Volume {Volume Number}',
};

// Token replacement data for naming
export interface NamingTokens {
  seriesTitle?: string;
  seriesYear?: number;
  sortTitle?: string;
  cleanTitle?: string;
  volumeNumber?: number;
  chapterNumber?: number;
  chapterTitle?: string;
  creatorName?: string;
  releaseGroup?: string;
  format?: string;
}

/**
 * Get the naming configuration from the database
 * Creates default config if none exists
 */
export async function getNamingConfig(): Promise<NamingConfig> {
  let config = await prisma.namingConfig.findFirst();
  
  if (!config) {
    // Create default config
    config = await prisma.namingConfig.create({
      data: DEFAULT_NAMING_CONFIG,
    });
  }
  
  return {
    ...config,
    volumeFolderFormat: (config as any).volumeFolderFormat || DEFAULT_NAMING_CONFIG.volumeFolderFormat,
  };
}

/**
 * Replace illegal filesystem characters
 */
function sanitizeFilename(name: string, replaceIllegalChars: boolean, colonReplacementFormat: string): string {
  if (!replaceIllegalChars) return name;
  
  let result = name;
  
  // Handle colon replacement based on format
  switch (colonReplacementFormat) {
    case 'delete':
      result = result.replace(/:/g, '');
      break;
    case 'dash':
      result = result.replace(/:/g, '-');
      break;
    case 'spaceDash':
      result = result.replace(/:/g, ' -');
      break;
    case 'spaceDashSpace':
      result = result.replace(/:/g, ' - ');
      break;
    case 'smart':
    default:
      // Smart: remove colon if followed by space, otherwise replace with dash
      result = result.replace(/:\s+/g, ' - ').replace(/:/g, '-');
      break;
  }
  
  // Remove other illegal characters
  result = result
    .replace(/[<>"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return result;
}

/**
 * Pad a number with zeros
 */
function padNumber(num: number | undefined, minDigits: number = 2): string {
  if (num === undefined) return '';
  return num.toString().padStart(minDigits, '0');
}

/**
 * Replace tokens in a format string with actual values
 */
export function replaceTokens(format: string, tokens: NamingTokens, config: NamingConfig): string {
  let result = format;
  
  // Series tokens
  if (tokens.seriesTitle !== undefined) {
    result = result.replace(/\{Series Title\}/gi, tokens.seriesTitle);
  }
  if (tokens.seriesYear !== undefined) {
    result = result.replace(/\{Year\}/gi, tokens.seriesYear.toString());
  }
  if (tokens.sortTitle !== undefined) {
    result = result.replace(/\{Sort Title\}/gi, tokens.sortTitle);
  }
  if (tokens.cleanTitle !== undefined) {
    result = result.replace(/\{Clean Title\}/gi, tokens.cleanTitle);
  }
  
  // Volume/Chapter tokens
  if (tokens.volumeNumber !== undefined) {
    result = result.replace(/\{Volume Number\}/gi, padNumber(tokens.volumeNumber, 3));
    result = result.replace(/\{Volume Number:0\}/gi, tokens.volumeNumber.toString());
    result = result.replace(/\{Volume Number:00\}/gi, padNumber(tokens.volumeNumber, 2));
    result = result.replace(/\{Volume Number:000\}/gi, padNumber(tokens.volumeNumber, 3));
  } else {
    // Remove volume-related parts if no volume number
    result = result.replace(/\s*-?\s*\{Volume Number(:0+)?\}/gi, '');
  }
  
  if (tokens.chapterNumber !== undefined) {
    result = result.replace(/\{Chapter Number\}/gi, padNumber(tokens.chapterNumber, 3));
    result = result.replace(/\{Chapter Number:0\}/gi, tokens.chapterNumber.toString());
    result = result.replace(/\{Chapter Number:00\}/gi, padNumber(tokens.chapterNumber, 2));
    result = result.replace(/\{Chapter Number:000\}/gi, padNumber(tokens.chapterNumber, 3));
  } else {
    // Remove chapter-related parts if no chapter number
    result = result.replace(/\s*-?\s*\{Chapter Number(:0+)?\}/gi, '');
  }
  
  if (tokens.chapterTitle !== undefined) {
    result = result.replace(/\{Chapter Title\}/gi, tokens.chapterTitle);
  }
  
  // Creator tokens
  if (tokens.creatorName !== undefined) {
    result = result.replace(/\{Creator Name\}/gi, tokens.creatorName);
  }
  
  // Release tokens
  if (tokens.releaseGroup !== undefined) {
    result = result.replace(/\{Release Group\}/gi, tokens.releaseGroup);
  } else {
    result = result.replace(/\s*\[?\{Release Group\}\]?/gi, '');
  }
  
  // Format token
  if (tokens.format !== undefined) {
    result = result.replace(/\{Format\}/gi, tokens.format.toUpperCase());
  }
  
  // Clean up any leftover tokens
  result = result.replace(/\{[^}]+\}/g, '');
  
  // Clean up double spaces and dashes
  result = result.replace(/\s+-\s+-\s+/g, ' - ').replace(/\s+/g, ' ').trim();
  result = result.replace(/^-\s+|-\s+$/g, '').trim();
  
  return sanitizeFilename(result, config.replaceIllegalChars, config.colonReplacementFormat);
}

/**
 * Format a series folder name according to the naming config
 */
export function formatSeriesFolderName(tokens: NamingTokens, config: NamingConfig): string {
  return replaceTokens(config.seriesFolderFormat, tokens, config);
}

/**
 * Format a volume folder name according to the naming config
 */
export function formatVolumeFolderName(tokens: NamingTokens, config: NamingConfig): string {
  const format = config.volumeFolderFormat || DEFAULT_NAMING_CONFIG.volumeFolderFormat!;
  return replaceTokens(format, tokens, config);
}

/**
 * Format a file name according to the naming config (without extension)
 */
export function formatFileName(tokens: NamingTokens, config: NamingConfig): string {
  return replaceTokens(config.standardFileFormat, tokens, config);
}

/**
 * Format a complete file name with extension
 */
export function formatFileNameWithExtension(tokens: NamingTokens, config: NamingConfig, extension: string): string {
  const baseName = formatFileName(tokens, config);
  const ext = extension.toLowerCase().replace(/^\./, '');
  return `${baseName}.${ext}`;
}
