// Downloads Scan API - GET to scan downloads folder for importable files

import { NextRequest, NextResponse } from 'next/server';
import { scanDirectory, groupBySeries, type ScannedFile } from '@/app/lib/import';
import prisma from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';
import { CONFIG_DEFAULTS } from '@/app/lib/config-defaults';

interface SeriesGroup {
  seriesTitle: string;
  cleanTitle: string;
  existingSeriesId?: number;
  files: ScannedFile[];
  totalSize: number;
  volumeCount: number;
}

/**
 * @swagger
 * /api/v1/import/scan:
 *   get:
 *     summary: Scan downloads folder for importable files
 *     tags: [Import]
 *     parameters:
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: Path to scan (uses config default if not provided)
 *       - in: query
 *         name: filterByClient
 *         schema:
 *           type: boolean
 *         description: Only show files from downloads with the configured category tag
 *     responses:
 *       200:
 *         description: List of files grouped by series
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 path: { type: string }
 *                 series: { type: array }
 *                 totalFiles: { type: integer }
 *                 totalSize: { type: integer }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const downloadPath = searchParams.get('path');
    const filterByClientParam = searchParams.get('filterByClient');
    
    // Get download path from config or use default
    let scanPath = downloadPath;
    if (!scanPath) {
      // Try to get from config
      const config = await prisma.config.findUnique({
        where: { key: 'DownloadsFolder' },
      });
      scanPath = config?.value || process.env.DOWNLOADS_FOLDER || '/data/downloads';
      
      // Check for category subfolder
      const categoryConfig = await prisma.config.findUnique({
        where: { key: 'DownloadsCategory' },
      });
      const category = categoryConfig?.value;
      if (category) {
        scanPath = `${scanPath}/${category}`;
      }
    }
    
    // Determine if we should filter by download client category
    // Uses FilterByDownloadClient config (defaults to true)
    let filterByDownloadClient = filterByClientParam === 'true';
    if (filterByClientParam === null) {
      // Check if filtering is enabled in config
      const filterConfig = await prisma.config.findUnique({
        where: { key: 'FilterByDownloadClient' },
      });
      // Default to true (enabled)
      filterByDownloadClient = filterConfig?.value !== 'false';
    }
    
    // Resolve to local filesystem path (for non-Docker environments)
    const localScanPath = resolveToLocal(scanPath);
    
    // Scan the directory with optional download client filtering
    const files = await scanDirectory(localScanPath, localScanPath, true, { 
      filterByDownloadClient 
    });
    
    if (files.length === 0) {
      return NextResponse.json({
        message: 'No importable files found',
        path: scanPath,
        series: [],
        totalFiles: 0,
        totalSize: 0,
      });
    }
    
    // Group by series
    const groups = groupBySeries(files);
    
    // Look up existing series
    const seriesGroups: SeriesGroup[] = [];
    
    for (const [cleanTitle, seriesFiles] of groups) {
      const seriesTitle = seriesFiles[0].parsed.seriesTitle;
      
      // Check if series exists in library
      const existingSeries = await prisma.series.findFirst({
        where: {
          cleanTitle: cleanTitle,
        },
      });
      
      // Count unique volumes
      const volumeNumbers = new Set(
        seriesFiles
          .filter(f => f.parsed.volumeNumber !== undefined)
          .map(f => f.parsed.volumeNumber)
      );
      
      seriesGroups.push({
        seriesTitle,
        cleanTitle,
        existingSeriesId: existingSeries?.id,
        files: seriesFiles,
        totalSize: seriesFiles.reduce((sum, f) => sum + f.size, 0),
        volumeCount: volumeNumbers.size,
      });
    }
    
    // Sort by series title
    seriesGroups.sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle));
    
    return NextResponse.json({
      path: scanPath,
      series: seriesGroups,
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    });
  } catch (error) {
    console.error('Error scanning downloads:', error);
    return NextResponse.json(
      { error: 'Failed to scan downloads folder', details: String(error) },
      { status: 500 }
    );
  }
}
