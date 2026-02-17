// Calibre Content Server Client for Inkarr
// Handles communication with Calibre's Content Server API

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  CalibreSettings,
  CalibreBook,
  CalibreLibraryInfo,
  CalibreImportJob,
  CalibreBookData,
  CalibreChangesPayload,
  CalibreChanges,
  CalibreCategory,
  CalibreConversionStatus,
  CalibreTestResult,
  CalibreValidationError,
  CalibreSyncResult,
  CalibreBookFormat,
} from '../types/calibre';

const PAGE_SIZE = 750;

/**
 * Build the base URL for Calibre Content Server
 */
function buildBaseUrl(settings: CalibreSettings): string {
  const protocol = settings.useSsl ? 'https' : 'http';
  const urlBase = settings.urlBase ? `/${settings.urlBase.replace(/^\//, '')}` : '';
  return `${protocol}://${settings.host}:${settings.port}${urlBase}`;
}

/**
 * Parse WWW-Authenticate header for Digest auth
 */
function parseDigestChallenge(header: string): Record<string, string> {
  const challenge: Record<string, string> = {};
  const digestMatch = header.match(/Digest\s+(.+)/i);
  if (!digestMatch) return challenge;

  const parts = digestMatch[1].match(/(\w+)=(?:"([^"]+)"|([^,\s]+))/g);
  if (!parts) return challenge;

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('=').replace(/^"|"$/g, '');
    challenge[key] = value;
  }

  return challenge;
}

/**
 * Generate Digest Authorization header
 */
function generateDigestAuth(
  settings: CalibreSettings,
  method: string,
  uri: string,
  challenge: Record<string, string>,
  nc: number = 1
): string {
  const username = settings.username || '';
  const password = settings.password || '';
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop || '';
  const algorithm = challenge.algorithm || 'MD5';

  // Generate client nonce
  const cnonce = crypto.randomBytes(8).toString('hex');

  // Format nonce count
  const ncString = nc.toString(16).padStart(8, '0');

  // Calculate HA1 = MD5(username:realm:password)
  const ha1 = crypto.createHash('md5')
    .update(`${username}:${realm}:${password}`)
    .digest('hex');

  // Calculate HA2 = MD5(method:uri)
  const ha2 = crypto.createHash('md5')
    .update(`${method}:${uri}`)
    .digest('hex');

  // Calculate response
  let response: string;
  if (qop === 'auth' || qop === 'auth-int') {
    // response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    response = crypto.createHash('md5')
      .update(`${ha1}:${nonce}:${ncString}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');
  } else {
    // response = MD5(HA1:nonce:HA2)
    response = crypto.createHash('md5')
      .update(`${ha1}:${nonce}:${ha2}`)
      .digest('hex');
  }

  // Build Authorization header
  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;

  if (qop) {
    authHeader += `, qop=${qop}, nc=${ncString}, cnonce="${cnonce}"`;
  }

  if (challenge.opaque) {
    authHeader += `, opaque="${challenge.opaque}"`;
  }

  if (algorithm && algorithm !== 'MD5') {
    authHeader += `, algorithm=${algorithm}`;
  }

  return authHeader;
}

/**
 * Store for digest auth challenges (keyed by host:port)
 */
const digestChallenges: Map<string, Record<string, string>> = new Map();
const nonceCounters: Map<string, number> = new Map();

/**
 * Get settings key for caching
 */
function getSettingsKey(settings: CalibreSettings): string {
  return `${settings.host}:${settings.port}`;
}

/**
 * Get authorization headers if credentials are configured
 * For initial requests without a digest challenge
 */
function getAuthHeaders(settings: CalibreSettings): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // Don't add auth header for initial request - let server challenge us
  return headers;
}

/**
 * Make a request with Digest authentication support
 */
async function fetchWithDigestAuth(
  settings: CalibreSettings,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method || 'GET';
  const uri = new URL(url).pathname + (new URL(url).search || '');
  const settingsKey = getSettingsKey(settings);

  // Check if we have a cached challenge
  let challenge = digestChallenges.get(settingsKey);

  const makeRequest = async (authHeader?: string) => {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  // If we have credentials and a cached challenge, use Digest auth
  if (settings.username && settings.password && challenge) {
    const nc = (nonceCounters.get(settingsKey) || 0) + 1;
    nonceCounters.set(settingsKey, nc);
    const authHeader = generateDigestAuth(settings, method, uri, challenge, nc);
    const response = await makeRequest(authHeader);

    // If still 401, challenge might have expired - clear cache and retry
    if (response.status === 401) {
      digestChallenges.delete(settingsKey);
      nonceCounters.delete(settingsKey);
      // Fall through to get new challenge
    } else {
      return response;
    }
  }

  // Make initial request (without auth or with expired auth)
  let response = await makeRequest();

  // If 401 and we have credentials, handle Digest auth
  if (response.status === 401 && settings.username && settings.password) {
    const wwwAuth = response.headers.get('WWW-Authenticate');
    console.log('[Calibre] WWW-Authenticate header:', wwwAuth);

    if (wwwAuth && wwwAuth.toLowerCase().includes('digest')) {
      challenge = parseDigestChallenge(wwwAuth);
      digestChallenges.set(settingsKey, challenge);
      nonceCounters.set(settingsKey, 1);

      console.log('[Calibre] Parsed digest challenge:', JSON.stringify(challenge));

      const authHeader = generateDigestAuth(settings, method, uri, challenge, 1);
      console.log('[Calibre] Using Digest auth');

      response = await makeRequest(authHeader);
    } else if (wwwAuth && wwwAuth.toLowerCase().includes('basic')) {
      // Server wants Basic auth
      const auth = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
      console.log('[Calibre] Using Basic auth');
      response = await makeRequest(`Basic ${auth}`);
    }
  }

  return response;
}

/**
 * Make a request to the Calibre Content Server
 */
async function calibreRequest<T>(
  settings: CalibreSettings,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${buildBaseUrl(settings)}/${endpoint}`;

  // Only add Content-Type for requests with a body
  const finalHeaders: Record<string, string> = {};
  if (options.body) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  console.log('[Calibre] Request:', options.method || 'GET', url);
  if (options.body) {
    console.log('[Calibre] Body:', options.body);
  }

  const response = await fetchWithDigestAuth(settings, url, {
    ...options,
    headers: {
      ...finalHeaders,
      ...options.headers,
    },
  });

  console.log('[Calibre] Response status:', response.status, response.statusText);

  if (!response.ok) {
    const text = await response.text();
    console.error('[Calibre] Error response:', text);
    throw new CalibreError(`Calibre request failed: ${response.status} ${response.statusText} - ${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Custom error class for Calibre-related errors
 */
export class CalibreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalibreError';
  }
}

/**
 * Validate Calibre settings
 */
export function validateSettings(settings: CalibreSettings): CalibreValidationError[] {
  const errors: CalibreValidationError[] = [];

  if (!settings.host || settings.host.trim() === '') {
    errors.push({ field: 'host', message: 'Host is required' });
  }

  if (!settings.port || settings.port < 1 || settings.port > 65535) {
    errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
  }

  if (settings.username && !settings.password) {
    errors.push({ field: 'password', message: 'Password is required when username is provided' });
  }

  if (settings.password && !settings.username) {
    errors.push({ field: 'username', message: 'Username is required when password is provided' });
  }

  if (settings.outputFormat) {
    const validFormats = [
      'EPUB', 'AZW3', 'MOBI', 'DOCX', 'FB2', 'HTMLZ', 'LIT', 'LRF',
      'PDB', 'PDF', 'PMLZ', 'RB', 'RTF', 'SNB', 'TCR', 'TXT', 'TXTZ', 'ZIP', 'CBZ', 'CBR'
    ];
    const formats = settings.outputFormat.split(',').map(f => f.trim().toUpperCase());
    for (const format of formats) {
      if (!validFormats.includes(format)) {
        errors.push({ field: 'outputFormat', message: `Invalid output format: ${format}` });
      }
    }
  }

  return errors;
}

/**
 * Test connection to Calibre Content Server
 */
export async function testConnection(settings: CalibreSettings): Promise<CalibreTestResult> {
  try {
    // Validate settings first
    const validationErrors = validateSettings(settings);
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: validationErrors.map(e => `${e.field}: ${e.message}`).join(', '),
      };
    }

    // Test basic connectivity by fetching the main page
    const baseUrl = buildBaseUrl(settings);
    
    console.log('[Calibre] Testing connection to:', baseUrl);
    console.log('[Calibre] Settings:', JSON.stringify({
      host: settings.host,
      port: settings.port,
      urlBase: settings.urlBase,
      useSsl: settings.useSsl,
      hasUsername: !!settings.username,
      hasPassword: !!settings.password,
    }));
    
    // Use fetchWithDigestAuth which handles both Basic and Digest auth
    const response = await fetchWithDigestAuth(settings, baseUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    console.log('[Calibre] Response status:', response.status, response.statusText);
    console.log('[Calibre] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    if (!response.ok) {
      const body = await response.text();
      console.log('[Calibre] Error response body:', body.substring(0, 500));
      
      if (response.status === 401) {
        return { success: false, message: 'Authentication failed. Check username and password.' };
      }
      if (response.status === 403) {
        return { success: false, message: 'Access forbidden. Check user permissions.' };
      }
      if (response.status === 404) {
        return { success: false, message: 'Calibre Content Server not found at this address.' };
      }
      return { success: false, message: `Connection failed: ${response.status} ${response.statusText}` };
    }

    const html = await response.text();
    console.log('[Calibre] Response HTML (first 500 chars):', html.substring(0, 500));

    // Check if this is actually a Calibre server
    if (html.includes('guac-login')) {
      return {
        success: false,
        message: "This appears to be the Calibre GUI container, not the Content Server. Try port 8081.",
      };
    }

    if (html.includes('Calibre-Web')) {
      return {
        success: false,
        message: "This is a Calibre-Web server, not the required Calibre Content Server. See https://manual.calibre-ebook.com/server.html",
      };
    }

    if (!html.includes('<title>calibre</title>') && !html.toLowerCase().includes('calibre')) {
      return {
        success: false,
        message: 'Not a valid Calibre Content Server. See https://manual.calibre-ebook.com/server.html',
      };
    }

    // Check for write access
    const hasWriteAccess = await checkWriteAccess(settings);
    if (!hasWriteAccess) {
      return {
        success: false,
        message: 'Inkarr needs write access. Configure a user or trusted IP in Calibre. See https://manual.calibre-ebook.com/server.html',
      };
    }

    // Get library info
    const libraryInfo = await getLibraryInfo(settings);
    
    // Set default library if not specified
    if (!settings.library) {
      settings.library = libraryInfo.defaultLibrary;
    }

    // Validate library exists
    if (!libraryInfo.libraryMap[settings.library]) {
      return {
        success: false,
        message: `Library "${settings.library}" not found. Available: ${Object.keys(libraryInfo.libraryMap).join(', ')}`,
        libraries: Object.keys(libraryInfo.libraryMap),
        defaultLibrary: libraryInfo.defaultLibrary,
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Calibre Content Server',
      libraries: Object.keys(libraryInfo.libraryMap),
      defaultLibrary: libraryInfo.defaultLibrary,
    };
  } catch (error) {
    console.error('[Calibre] Test connection error:', error);
    
    // Handle various network error types
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      console.log('[Calibre] Error message:', error.message);
      
      // Connection refused
      if (message.includes('econnrefused') || message.includes('connect')) {
        return { success: false, message: 'Unable to connect. Check that Calibre Content Server is running and the host/port are correct.' };
      }
      
      // DNS/host resolution errors
      if (message.includes('enotfound') || message.includes('getaddrinfo')) {
        return { success: false, message: 'Host not found. Check the hostname.' };
      }
      
      // Timeout
      if (message.includes('timeout') || message.includes('etimedout')) {
        return { success: false, message: 'Connection timed out. Check firewall settings.' };
      }
      
      // Fetch-related errors
      if (message.includes('fetch') || error instanceof TypeError) {
        return { success: false, message: 'Unable to connect. Check host and port.' };
      }
      
      return { success: false, message: error.message };
    }
    
    return {
      success: false,
      message: 'Unknown error occurred',
    };
  }
}

/**
 * Check if we have write access to Calibre
 */
async function checkWriteAccess(settings: CalibreSettings): Promise<boolean> {
  try {
    const url = `${buildBaseUrl(settings)}/cdb/cmd/saved_searches`;

    console.log('[Calibre] Checking write access at:', url);

    const response = await fetchWithDigestAuth(settings, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['list']),
    });

    console.log('[Calibre] Write access check response:', response.status);
    return response.status !== 403;
  } catch (error) {
    console.error('[Calibre] Write access check error:', error);
    return false;
  }
}

/**
 * Get Calibre library information
 */
export async function getLibraryInfo(settings: CalibreSettings): Promise<CalibreLibraryInfo> {
  interface RawLibraryInfo {
    library_map: Record<string, string>;
    default_library: string;
  }

  console.log('[Calibre] Getting library info');
  const data = await calibreRequest<RawLibraryInfo>(settings, 'ajax/library-info');
  console.log('[Calibre] Library info:', JSON.stringify(data));
  
  return {
    libraryMap: data.library_map,
    defaultLibrary: data.default_library,
  };
}

/**
 * Get a single book from Calibre
 */
export async function getBook(calibreId: number, settings: CalibreSettings): Promise<CalibreBook> {
  interface RawBook {
    application_id: number;
    title: string;
    authors: string[];
    author_sort?: string;
    pubdate?: string;
    publisher?: string;
    languages: string[];
    tags: string[];
    comments?: string;
    rating: number;
    identifiers: Record<string, string>;
    series?: string;
    series_index?: number;
    format_metadata: Record<string, {
      path: string;
      size: number;
      mtime: string;
    }>;
  }

  const data = await calibreRequest<RawBook>(settings, `ajax/book/${calibreId}/${settings.library}`);
  
  return transformBook(data);
}

/**
 * Get multiple books from Calibre
 */
export async function getBooks(calibreIds: number[], settings: CalibreSettings): Promise<CalibreBook[]> {
  interface RawBook {
    application_id: number;
    title: string;
    authors: string[];
    author_sort?: string;
    pubdate?: string;
    publisher?: string;
    languages: string[];
    tags: string[];
    comments?: string;
    rating: number;
    identifiers: Record<string, string>;
    series?: string;
    series_index?: number;
    format_metadata: Record<string, {
      path: string;
      size: number;
      mtime: string;
    }>;
  }

  const url = `ajax/books/${settings.library}?ids=${calibreIds.join(',')}`;
  const data = await calibreRequest<Record<number, RawBook>>(settings, url);
  
  return Object.values(data).map(transformBook);
}

/**
 * Transform raw Calibre book data to our interface
 */
function transformBook(raw: {
  application_id: number;
  title: string;
  authors: string[];
  author_sort?: string;
  pubdate?: string;
  publisher?: string;
  languages: string[];
  tags: string[];
  comments?: string;
  rating: number;
  identifiers: Record<string, string>;
  series?: string;
  series_index?: number;
  format_metadata: Record<string, {
    path: string;
    size: number;
    mtime: string;
  }>;
}): CalibreBook {
  const formats: Record<string, CalibreBookFormat> = {};
  
  for (const [ext, format] of Object.entries(raw.format_metadata)) {
    formats[ext] = {
      path: format.path,
      size: format.size,
      mtime: format.mtime,
      lastModified: new Date(format.mtime),
    };
  }

  return {
    id: raw.application_id,
    title: raw.title,
    authors: raw.authors,
    authorSort: raw.author_sort,
    pubDate: raw.pubdate,
    publisher: raw.publisher,
    languages: raw.languages || [],
    tags: raw.tags || [],
    comments: raw.comments,
    rating: raw.rating,
    identifiers: raw.identifiers || {},
    series: raw.series,
    position: raw.series_index,
    formats,
  };
}

/**
 * Get all book IDs from Calibre library
 */
export async function getAllBookIds(settings: CalibreSettings): Promise<number[]> {
  // 'allbooks' in hex is '616c6c626f6f6b73'
  const ids: number[] = [];
  let offset = 0;

  while (true) {
    interface RawCategory {
      book_ids: number[];
      total_num: number;
      offset: number;
      num: number;
    }

    const url = `ajax/category/616c6c626f6f6b73/${settings.library}?num=${PAGE_SIZE}&offset=${offset}`;
    const result = await calibreRequest<RawCategory>(settings, url);

    if (!result.book_ids || result.book_ids.length === 0) {
      break;
    }

    ids.push(...result.book_ids);
    offset += PAGE_SIZE;
  }

  return ids;
}

/**
 * Get all book file paths from Calibre library
 */
export async function getAllBookFilePaths(settings: CalibreSettings): Promise<string[]> {
  const ids = await getAllBookIds(settings);
  const paths: string[] = [];
  
  // Process in batches
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE);
    const books = await getBooks(batch, settings);
    
    for (const book of books) {
      const originalPath = getOriginalFormatPath(book.formats);
      if (originalPath) {
        paths.push(originalPath);
      }
    }
  }

  return paths;
}

/**
 * Get the path of the original format (first text-based format by modification time)
 */
function getOriginalFormatPath(formats: Record<string, CalibreBookFormat>): string | null {
  const textExtensions = ['.epub', '.mobi', '.azw3', '.pdf', '.cbz', '.cbr', '.cb7'];
  
  const sortedFormats = Object.entries(formats)
    .filter(([ext]) => textExtensions.includes(`.${ext.toLowerCase()}`))
    .sort((a, b) => {
      const timeA = a[1].lastModified?.getTime() || 0;
      const timeB = b[1].lastModified?.getTime() || 0;
      return timeA - timeB;
    });

  return sortedFormats[0]?.[1]?.path || null;
}

/**
 * Add a book to Calibre library
 */
export async function addBook(
  filePath: string,
  settings: CalibreSettings
): Promise<CalibreImportJob> {
  const jobId = Date.now() % 1000000000;
  const addDuplicates = 1;
  const filename = `$dummy${path.extname(filePath)}`;
  const body = fs.readFileSync(filePath);

  interface RawImportJob {
    book_id: number;
    id: number;
    filename: string;
    authors: string[];
    title: string;
    languages: string[];
  }

  const url = `${buildBaseUrl(settings)}/cdb/add-book/${jobId}/${addDuplicates}/${filename}/${settings.library}`;

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body,
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to add book: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as RawImportJob;

  if (data.book_id === 0) {
    throw new CalibreError('Calibre rejected duplicate book');
  }

  return {
    id: data.book_id,
    jobId: data.id,
    filename: data.filename,
    authors: data.authors || [],
    title: data.title,
    languages: data.languages || [],
  };
}

/**
 * Add a format to an existing Calibre book
 */
export async function addFormat(
  calibreId: number,
  filePath: string,
  settings: CalibreSettings
): Promise<void> {
  const ext = path.extname(filePath).substring(1); // Remove the dot
  const bookData = Buffer.from(fs.readFileSync(filePath)).toString('base64');

  const payload = {
    loaded_book_ids: [calibreId],
    changes: {
      added_formats: [
        {
          ext,
          data_url: bookData,
        },
      ],
    },
  };

  await executeSetFields(calibreId, payload, settings);
}

/**
 * Delete a book from Calibre
 */
export async function deleteBook(calibreId: number, settings: CalibreSettings): Promise<void> {
  const url = `${buildBaseUrl(settings)}/cdb/delete-books/${calibreId}/${settings.library}`;

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to delete book: ${response.status} ${response.statusText}`);
  }
}

/**
 * Delete multiple books from Calibre
 */
export async function deleteBooks(calibreIds: number[], settings: CalibreSettings): Promise<void> {
  const idString = calibreIds.join(',');
  const url = `${buildBaseUrl(settings)}/cdb/delete-books/${idString}/${settings.library}`;

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to delete books: ${response.status} ${response.statusText}`);
  }
}

/**
 * Remove formats from a Calibre book
 */
export async function removeFormats(
  calibreId: number,
  formats: string[],
  settings: CalibreSettings
): Promise<void> {
  const payload = {
    loaded_book_ids: [calibreId],
    changes: {
      removed_formats: formats,
    },
  };

  await executeSetFields(calibreId, payload, settings);
}

/**
 * Set metadata fields on a Calibre book
 */
export async function setFields(
  calibreId: number,
  changes: CalibreChanges,
  settings: CalibreSettings
): Promise<void> {
  const payload: {
    loaded_book_ids: number[];
    changes: {
      title?: string;
      authors?: string[];
      cover?: string;
      pubdate?: string | Date;
      publisher?: string;
      languages?: string;
      tags?: string[];
      comments?: string;
      rating?: number;
      identifiers?: Record<string, string>;
      series?: string | null;
      series_index?: number;
      added_formats?: { ext: string; data_url: string }[];
      removed_formats?: string[];
    };
  } = {
    loaded_book_ids: [calibreId],
    changes: {},
  };

  // Map our interface to Calibre's expected format
  if (changes.title !== undefined) payload.changes.title = changes.title;
  if (changes.authors !== undefined) payload.changes.authors = changes.authors;
  if (changes.cover !== undefined) payload.changes.cover = changes.cover;
  if (changes.pubDate !== undefined) payload.changes.pubdate = changes.pubDate;
  if (changes.publisher !== undefined) payload.changes.publisher = changes.publisher;
  if (changes.languages !== undefined) payload.changes.languages = changes.languages;
  if (changes.tags !== undefined) payload.changes.tags = changes.tags;
  if (changes.comments !== undefined) payload.changes.comments = changes.comments;
  if (changes.rating !== undefined) payload.changes.rating = changes.rating;
  if (changes.identifiers !== undefined) payload.changes.identifiers = changes.identifiers;
  if (changes.series !== undefined) payload.changes.series = changes.series;
  if (changes.seriesIndex !== undefined) payload.changes.series_index = changes.seriesIndex;

  if (changes.addedFormats) {
    payload.changes.added_formats = changes.addedFormats.map(f => ({
      ext: f.ext,
      data_url: f.data,
    }));
  }

  if (changes.removedFormats) {
    payload.changes.removed_formats = changes.removedFormats;
  }

  await executeSetFields(calibreId, payload, settings);
}

/**
 * Execute a set-fields request to Calibre
 */
async function executeSetFields(
  calibreId: number,
  payload: object,
  settings: CalibreSettings
): Promise<void> {
  const url = `${buildBaseUrl(settings)}/cdb/set-fields/${calibreId}/${settings.library}`;

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to set fields: ${response.status} ${response.statusText}`);
  }
}

/**
 * Get book data including conversion options
 */
export async function getBookData(calibreId: number, settings: CalibreSettings): Promise<CalibreBookData> {
  interface RawBookData {
    conversion_options: {
      options: { output_profile?: string };
      input_fmt: string;
      output_fmt: string;
    };
    book_id: number;
    input_formats: string[];
    output_formats: string[];
  }

  const data = await calibreRequest<RawBookData>(
    settings,
    `conversion/book-data/${calibreId}?library_id=${settings.library}`
  );

  return {
    conversionOptions: {
      options: {
        outputProfile: data.conversion_options.options.output_profile,
      },
      inputFmt: data.conversion_options.input_fmt,
      outputFmt: data.conversion_options.output_fmt,
    },
    bookId: data.book_id,
    inputFormats: data.input_formats,
    outputFormats: data.output_formats,
  };
}

/**
 * Start a format conversion in Calibre
 */
export async function startConversion(
  calibreId: number,
  inputFormat: string,
  outputFormat: string,
  outputProfile: string | undefined,
  settings: CalibreSettings
): Promise<number> {
  const url = `${buildBaseUrl(settings)}/conversion/start/${calibreId}?library_id=${settings.library}`;

  const options = {
    input_fmt: inputFormat,
    output_fmt: outputFormat,
    options: outputProfile ? { output_profile: outputProfile } : {},
  };

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to start conversion: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<number>;
}

/**
 * Check conversion status
 */
export async function getConversionStatus(
  jobId: number,
  settings: CalibreSettings
): Promise<CalibreConversionStatus> {
  interface RawStatus {
    running: boolean;
    ok: boolean;
    traceback?: string;
    log?: string;
  }

  const data = await calibreRequest<RawStatus>(
    settings,
    `conversion/status/${jobId}?library_id=${settings.library}`
  );

  return {
    running: data.running,
    ok: data.ok,
    traceback: data.traceback,
    log: data.log,
  };
}

/**
 * Wait for a conversion to complete
 */
export async function waitForConversion(
  jobId: number,
  settings: CalibreSettings,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<CalibreConversionStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await getConversionStatus(jobId, settings);
    
    if (!status.running) {
      return status;
    }

    // Wait 2 seconds between checks
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new CalibreError('Conversion timed out');
}

/**
 * Embed metadata into the book file
 */
export async function embedMetadata(calibreId: number, settings: CalibreSettings): Promise<void> {
  const url = `${buildBaseUrl(settings)}/cdb/cmd/embed_metadata?library_id=${settings.library}`;

  const response = await fetchWithDigestAuth(settings, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([calibreId, null]),
  });

  if (!response.ok) {
    throw new CalibreError(`Failed to embed metadata: ${response.status} ${response.statusText}`);
  }
}

/**
 * Sync a media file to Calibre library
 * This is the main high-level function for adding/updating books
 */
export async function syncToLibrary(
  filePath: string,
  metadata: {
    title: string;
    authors?: string[];
    series?: string;
    seriesIndex?: number;
    publisher?: string;
    releaseDate?: Date;
    genres?: string[];
    overview?: string;
    coverPath?: string;
    identifiers?: Record<string, string>;
  },
  settings: CalibreSettings,
  existingCalibreId?: number
): Promise<CalibreSyncResult> {
  try {
    let calibreId: number;

    // Add or update the book
    if (existingCalibreId) {
      // Add as a new format to existing book
      await addFormat(existingCalibreId, filePath, settings);
      calibreId = existingCalibreId;
    } else {
      // Add as a new book
      const importJob = await addBook(filePath, settings);
      calibreId = importJob.id;
    }

    // Prepare metadata changes
    const changes: CalibreChanges = {
      title: metadata.title,
      authors: metadata.authors,
      series: metadata.series,
      seriesIndex: metadata.seriesIndex,
      publisher: metadata.publisher,
      tags: metadata.genres,
      comments: metadata.overview,
      identifiers: metadata.identifiers,
    };

    if (metadata.releaseDate) {
      changes.pubDate = metadata.releaseDate.toISOString();
    }

    // Add cover if provided
    if (metadata.coverPath && fs.existsSync(metadata.coverPath)) {
      const coverData = fs.readFileSync(metadata.coverPath);
      changes.cover = Buffer.from(coverData).toString('base64');
    }

    // Update metadata
    await setFields(calibreId, changes, settings);

    // Handle format conversion if configured
    if (settings.outputFormat) {
      const bookData = await getBookData(calibreId, settings);
      const inputFormat = path.extname(filePath).substring(1).toUpperCase();
      const targetFormats = settings.outputFormat.split(',').map(f => f.trim().toUpperCase());

      for (const targetFormat of targetFormats) {
        // Skip if already have this format or it's the input format
        if (
          targetFormat.toLowerCase() === inputFormat.toLowerCase() ||
          bookData.inputFormats.some(f => f.toUpperCase() === targetFormat)
        ) {
          continue;
        }

        // Start conversion
        const jobId = await startConversion(
          calibreId,
          inputFormat,
          targetFormat,
          settings.outputProfile,
          settings
        );

        // Wait for conversion (don't block, just start it)
        // In production, you might want to track these and report status
        waitForConversion(jobId, settings).catch(err => {
          console.error(`Conversion to ${targetFormat} failed:`, err);
        });
      }
    }

    // Get the updated book to return the final path
    const updatedBook = await getBook(calibreId, settings);
    const finalPath = getOriginalFormatPath(updatedBook.formats);

    return {
      success: true,
      calibreId,
      path: finalPath || filePath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default {
  testConnection,
  validateSettings,
  getLibraryInfo,
  getBook,
  getBooks,
  getAllBookIds,
  getAllBookFilePaths,
  addBook,
  addFormat,
  deleteBook,
  deleteBooks,
  removeFormats,
  setFields,
  getBookData,
  startConversion,
  getConversionStatus,
  waitForConversion,
  embedMetadata,
  syncToLibrary,
};
