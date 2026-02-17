// Media Types for Inkarr - Comic & Manga Manager

export enum MediaType {
  COMIC = 'COMIC',
  MANGA = 'MANGA',
  MANHWA = 'MANHWA',
  MANHUA = 'MANHUA',
  WEBTOON = 'WEBTOON',
}

export enum PublicationStatus {
  CONTINUING = 'CONTINUING',
  ENDED = 'ENDED',
  HIATUS = 'HIATUS',
  CANCELLED = 'CANCELLED',
  UPCOMING = 'UPCOMING',
}

export enum MonitorStatus {
  ALL = 'ALL',
  FUTURE = 'FUTURE',
  MISSING = 'MISSING',
  EXISTING = 'EXISTING',
  FIRST_VOLUME = 'FIRST_VOLUME',
  LATEST_VOLUME = 'LATEST_VOLUME',
  NONE = 'NONE',
}

export interface Ratings {
  comicVine?: number;
  mal?: number;
  anilist?: number;
  votes?: number;
}

export interface ExternalIds {
  comicVineId?: string;
  malId?: string;
  anilistId?: string;
  mangadexId?: string;
}

export interface Image {
  url: string;
  coverType: 'poster' | 'banner' | 'fanart' | 'screenshot';
}

// Creator types
export interface CreatorMetadata {
  id: number;
  foreignId?: string;
  name: string;
  sortName?: string;
  aliases?: string[];
  overview?: string;
  birthDate?: Date;
  deathDate?: Date;
  hometown?: string;
  gender?: string;
  imageUrl?: string;
  links?: ExternalLink[];
}

export interface Creator {
  id: number;
  creatorMetadataId: number;
  metadata: CreatorMetadata;
  cleanName: string;
  monitored: boolean;
  monitorNewItems: MonitorStatus;
  path?: string;
  rootFolderPath?: string;
  qualityProfileId?: number;
  metadataProfileId?: number;
  tags?: number[];
  added: Date;
  lastInfoSync?: Date;
}

export interface ExternalLink {
  name: string;
  url: string;
}

// Series type (Comic Series / Manga Title)
export interface Series {
  id: number;
  foreignId?: string;
  title: string;
  sortTitle: string;
  cleanTitle: string;
  alternateTitles?: string[];
  overview?: string;
  mediaType: MediaType;
  status: PublicationStatus;
  year?: number;
  publisher?: string;
  imprint?: string;
  genres?: string[];
  tags?: number[];
  ratings?: Ratings;
  imageUrl?: string;
  bannerUrl?: string;
  
  // Monitoring & Library
  monitored: boolean;
  monitorStatus: MonitorStatus;
  path?: string;
  rootFolderPath?: string;
  qualityProfileId?: number;
  metadataProfileId?: number;
  
  // Counts
  volumeCount?: number;
  chapterCount?: number;
  
  // External IDs
  externalIds: ExternalIds;
  
  // Related data (loaded on demand)
  volumes?: Volume[];
  chapters?: Chapter[];
  creators?: SeriesCreator[];
  statistics?: SeriesStatistics;
  
  added: Date;
  lastInfoSync?: Date;
}

export interface SeriesCreator {
  id: number;
  seriesId: number;
  creatorId: number;
  creator?: Creator;
  role: CreatorRole;
}

export type CreatorRole = 
  | 'writer' 
  | 'artist' 
  | 'penciler' 
  | 'inker' 
  | 'colorist' 
  | 'letterer' 
  | 'cover' 
  | 'editor'
  | 'author';

export interface SeriesStatistics {
  volumeCount: number;
  volumeFileCount: number;
  chapterCount: number;
  chapterFileCount: number;
  totalFileSize: number;
  percentOfVolumes: number;
  percentOfChapters: number;
}

// Volume (Tankōbon / Trade Paperback)
export interface Volume {
  id: number;
  seriesId: number;
  foreignId?: string;
  title?: string;
  volumeNumber?: number;
  overview?: string;
  releaseDate?: Date;
  pageCount?: number;
  isbn?: string;
  isbn13?: string;
  asin?: string;
  imageUrl?: string;
  monitored: boolean;
  
  // Related
  chapters?: Chapter[];
  mediaFiles?: MediaFile[];
  
  // Computed
  hasFile: boolean;
}

// Chapter / Issue
export interface Chapter {
  id: number;
  seriesId: number;
  volumeId?: number;
  foreignId?: string;
  title?: string;
  chapterNumber?: number; // Float to support 10.5
  issueNumber?: string;   // For comics with special numbering
  overview?: string;
  releaseDate?: Date;
  pageCount?: number;
  imageUrl?: string;
  monitored: boolean;
  
  // Related
  mediaFiles?: MediaFile[];
  storyArcs?: StoryArc[];
  
  // Computed
  hasFile: boolean;
}

// Story Arc
export interface StoryArc {
  id: number;
  foreignId?: string;
  name: string;
  overview?: string;
  publisher?: string;
  imageUrl?: string;
  seriesCount?: number;
  chapterCount?: number;
}

// Media File
export enum FileFormat {
  CBZ = 'CBZ',
  CBR = 'CBR',
  CB7 = 'CB7',
  PDF = 'PDF',
  EPUB = 'EPUB',
  MOBI = 'MOBI',
}

export interface MediaFile {
  id: number;
  seriesId: number;
  volumeId?: number;
  chapterId?: number;
  path: string;
  relativePath: string;
  size: number;
  dateAdded: Date;
  format: FileFormat;
  quality?: Quality;
  releaseGroup?: string;
  sceneName?: string;
  pageCount?: number;
}

export interface Quality {
  quality: {
    id: number;
    name: string;
  };
  revision: {
    version: number;
    real: number;
  };
}

// Add/Search types
export interface AddSeriesOptions {
  monitored?: boolean;
  monitorStatus?: MonitorStatus;
  qualityProfileId?: number;
  metadataProfileId?: number;
  rootFolderPath: string;
  tags?: number[];
  searchForMissingContent?: boolean;
}

export interface SeriesLookupResult {
  foreignId: string;
  title: string;
  sortTitle: string;
  overview?: string;
  mediaType: MediaType;
  status: PublicationStatus;
  year?: number;
  publisher?: string;
  genres?: string[];
  ratings?: Ratings;
  imageUrl?: string;
  volumeCount?: number;
  chapterCount?: number;
  externalIds: ExternalIds;
}
