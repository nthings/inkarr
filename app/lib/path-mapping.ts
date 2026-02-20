/**
 * Path Mapping Utility for Inkarr
 * 
 * When running outside Docker, database paths (e.g., /data/comics) need to be
 * mapped to local filesystem paths. This utility provides path translation
 * based on environment variables.
 * 
 * Configuration via environment variables:
 * 
 * Option 1: Single mapping string (comma-separated for multiple mappings)
 *   INKARR_PATH_MAPPING="/data/comics=./data/comics,/data/manga=./data/manga,/data/downloads=./data/downloads"
 * 
 * Option 2: Simple prefix replacement (for common case where all paths share a prefix)
 *   INKARR_PATH_PREFIX_DOCKER=/data
 *   INKARR_PATH_PREFIX_LOCAL=./data
 * 
 * When running in Docker, these variables should not be set (paths work as-is).
 */

import path from 'path';

interface PathMapping {
  from: string;  // Docker/DB path (e.g., "/data/comics")
  to: string;    // Local filesystem path (e.g., "./data/comics")
}

let pathMappings: PathMapping[] | null = null;

/**
 * Parse and cache path mappings from environment variables
 */
function getPathMappings(): PathMapping[] {
  if (pathMappings !== null) {
    return pathMappings;
  }

  pathMappings = [];

  // Check for explicit path mappings
  const mappingStr = process.env.INKARR_PATH_MAPPING;
  if (mappingStr) {
    const mappings = mappingStr.split(',');
    for (const mapping of mappings) {
      const [from, to] = mapping.split('=');
      if (from && to) {
        pathMappings.push({ 
          from: from.trim(), 
          to: to.trim() 
        });
      }
    }
  }

  // Check for prefix-based mapping (simpler configuration)
  const prefixDocker = process.env.INKARR_PATH_PREFIX_DOCKER;
  const prefixLocal = process.env.INKARR_PATH_PREFIX_LOCAL;
  if (prefixDocker && prefixLocal) {
    pathMappings.push({ 
      from: prefixDocker, 
      to: prefixLocal 
    });
  }

  return pathMappings;
}

/**
 * Check if path mapping is enabled (any mappings are configured)
 */
export function isPathMappingEnabled(): boolean {
  return getPathMappings().length > 0;
}

/**
 * Resolve a database/Docker path to the local filesystem path.
 * If no mapping applies, returns the original path unchanged.
 * 
 * @param dbPath - The path as stored in the database (Docker container path)
 * @returns The resolved local filesystem path
 * 
 * @example
 * // With INKARR_PATH_MAPPING="/data/comics=./data/comics"
 * resolveToLocal("/data/comics/Batman") // => "./data/comics/Batman"
 */
export function resolveToLocal(dbPath: string): string {
  const mappings = getPathMappings();
  
  for (const mapping of mappings) {
    if (dbPath.startsWith(mapping.from)) {
      const relativePart = dbPath.slice(mapping.from.length);
      return path.join(mapping.to, relativePart);
    }
  }
  
  return dbPath;
}

/**
 * Convert a local filesystem path back to the database/Docker path.
 * Used when storing paths that were input from the local filesystem.
 * If no mapping applies, returns the original path unchanged.
 * 
 * @param localPath - The local filesystem path
 * @returns The path as it should be stored in the database
 * 
 * @example
 * // With INKARR_PATH_MAPPING="/data/comics=./data/comics"
 * resolveToDb("./data/comics/Batman") // => "/data/comics/Batman"
 */
export function resolveToDb(localPath: string): string {
  const mappings = getPathMappings();
  
  // Normalize the local path for comparison
  const normalizedLocal = path.normalize(localPath);
  
  for (const mapping of mappings) {
    const normalizedTo = path.normalize(mapping.to);
    if (normalizedLocal.startsWith(normalizedTo)) {
      const relativePart = normalizedLocal.slice(normalizedTo.length);
      return path.join(mapping.from, relativePart);
    }
  }
  
  return localPath;
}

/**
 * Get all configured path mappings (for debugging/display)
 */
export function getConfiguredMappings(): PathMapping[] {
  return [...getPathMappings()];
}

/**
 * Clear cached mappings (useful for testing)
 */
export function clearMappingCache(): void {
  pathMappings = null;
}
