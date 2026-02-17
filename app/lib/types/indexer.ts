// Indexer Types for Inkarr
// Based on Readarr/Sonarr/Radarr indexer abstraction (Newznab/Torznab)

import { DownloadProtocol, ReleaseInfo } from './download-client';

export type IndexerImplementation = 
  | 'Newznab'
  | 'Torznab'
  | 'UNIT3D'
  | 'Nyaa'
  | 'FileList'
  | 'IPTorrents'
  | 'TorrentRss';

export interface IIndexer {
  id: number;
  name: string;
  implementation: IndexerImplementation;
  protocol: DownloadProtocol;
  settings: IndexerSettings;
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  priority: number;
  downloadClientId?: number;
  tags?: number[];
}

// Base indexer settings
export interface IndexerSettings {
  baseUrl: string;
  apiPath?: string;
  apiKey?: string;
  categories?: number[];
  earlyReleaseLimit?: number;
  additionalParameters?: string;
}

// Newznab settings
export interface NewznabSettings extends IndexerSettings {
  apiKey: string;
  categories: number[];
  earlyReleaseLimit?: number;
}

// Torznab settings
export interface TorznabSettings extends IndexerSettings {
  apiKey: string;
  categories: number[];
  minimumSeeders?: number;
  seedRatio?: number;
  seedTime?: number; // minutes
  requiredFlags?: string[];
}

// Nyaa settings (public tracker for anime/manga)
export interface NyaaSettings extends IndexerSettings {
  additionalParameters?: string;
  minimumSeeders?: number;
  seedRatio?: number;
  seedTime?: number;
}

// UNIT3D settings (native API for UNIT3D trackers)
export interface Unit3dSettings extends IndexerSettings {
  apiKey: string;
  categories?: number[];
  minimumSeeders?: number;
  seedRatio?: number;
  seedTime?: number;
}

// Indexer status
export interface IndexerStatus {
  id: number;
  indexerId: number;
  initialFailure?: Date;
  mostRecentFailure?: Date;
  escalationLevel: number;
  disabledTill?: Date;
  lastRssSyncReleaseInfo?: ReleaseInfo;
}

// Indexer capabilities
export interface IndexerCapabilities {
  supportsRss: boolean;
  supportsSearch: boolean;
  supportsBookSearch: boolean;
  supportedCategories: IndexerCategory[];
  maxPageSize?: number;
}

export interface IndexerCategory {
  id: number;
  name: string;
  description?: string;
  subCategories?: IndexerCategory[];
}

// Standard Newznab categories for comics/manga
export const NewznabCategories = {
  BOOKS: 7000,
  BOOKS_EBOOK: 7020,
  BOOKS_COMICS: 7030,
  BOOKS_MAGAZINES: 7010,
  BOOKS_TECHNICAL: 7040,
  BOOKS_OTHER: 7050,
  BOOKS_FOREIGN: 7060,
} as const;

// Torznab-specific categories
export const TorznabCategories = {
  ...NewznabCategories,
  // Some indexers use custom categories
  MANGA: 140000,
  ANIME_MANGA: 140001,
} as const;

// Search criteria
export interface SearchCriteria {
  searchTerm?: string;
  series?: {
    id: number;
    title: string;
    year?: number;
  };
  volume?: {
    id: number;
    volumeNumber?: number;
  };
  chapter?: {
    id: number;
    chapterNumber?: number;
  };
}

export interface SeriesSearchCriteria extends SearchCriteria {
  seriesTitle: string;
  year?: number;
  publisher?: string;
}

export interface VolumeSearchCriteria extends SearchCriteria {
  seriesTitle: string;
  volumeNumber: number;
  isbn?: string;
}

export interface ChapterSearchCriteria extends SearchCriteria {
  seriesTitle: string;
  chapterNumber: number;
}

// Indexer request/response
export interface IndexerRequest {
  url: string;
  httpMethod: 'GET' | 'POST';
  headers?: Record<string, string>;
}

export interface IndexerResponse {
  request: IndexerRequest;
  content: string;
  httpStatusCode: number;
  elapsedTime: number;
}

// RSS feed response
export interface RssFeedResponse {
  releases: ReleaseInfo[];
  lastRssSync?: Date;
}

// Search response
export interface SearchResponse {
  releases: ReleaseInfo[];
  indexerId: number;
  indexerName: string;
}

// Parse result from release title
export interface ParsedReleaseInfo {
  seriesTitle?: string;
  volumeNumber?: number;
  chapterNumbers?: number[];
  releaseGroup?: string;
  quality?: string;
  languages?: string[];
  year?: number;
  edition?: string;
  isSpecial?: boolean;
}

// Release rejection reasons
export interface ReleaseRejection {
  reason: string;
  type: 'permanent' | 'temporary';
}

// Newznab XML attribute helpers
export const NewznabAttributes = {
  SIZE: 'size',
  CATEGORY: 'category',
  GRABS: 'grabs',
  SEEDERS: 'seeders',
  PEERS: 'peers',
  INFOHASH: 'infohash',
  MAGNETURL: 'magneturl',
  AUTHOR: 'author',
  BOOK: 'book',
  BOOKTITLE: 'booktitle',
  PUBLISHER: 'publisher',
  ISBN: 'isbn',
  LANGUAGE: 'language',
  YEAR: 'year',
} as const;
