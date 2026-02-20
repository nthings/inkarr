// Import API - POST to import files from downloads to library

import { NextRequest, NextResponse } from 'next/server';
import { scanDirectory, importFiles, type ImportOptions } from '@/app/lib/import';
import prisma from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';
import { CONFIG_DEFAULTS } from '@/app/lib/config-defaults';

/**
 * @swagger
 * /api/v1/import:
 *   post:
 *     summary: Import files from downloads folder to library
 *     tags: [Import]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               downloadPath: { type: string, description: Path to scan for imports }
 *               rootFolderPath: { type: string, description: Target root folder }
 *               seriesId: { type: integer, description: Target series ID }
 *               qualityProfileId: { type: integer }
 *               copyMode: { type: boolean, default: false, description: Copy instead of move }
 *               deleteSource: { type: boolean, default: true }
 *               selectedFiles: { type: array, items: { type: string }, description: Specific files to import }
 *     responses:
 *       200:
 *         description: Import results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 imported: { type: integer }
 *                 failed: { type: integer }
 *                 results: { type: array }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      downloadPath,
      rootFolderPath,
      seriesId,
      qualityProfileId,
      copyMode = false,
      deleteSource = true,
      selectedFiles,
      filterByDownloadClient,
    }: {
      downloadPath?: string;
      rootFolderPath?: string;
      seriesId?: number;
      qualityProfileId?: number;
      copyMode?: boolean;
      deleteSource?: boolean;
      selectedFiles?: string[]; // Optional array of specific file paths to import
      filterByDownloadClient?: boolean; // Only import files from downloads with the configured category
    } = body;
    
    // Get download path from config or use default
    let scanPath = downloadPath;
    if (!scanPath) {
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
    
    // Check that at least one root folder exists
    const rootFolderCount = await prisma.rootFolder.count();
    if (rootFolderCount === 0) {
      return NextResponse.json(
        { error: 'No root folder configured. Please add a root folder first.' },
        { status: 400 }
      );
    }
    
    // Optional explicit root folder path (if not provided, importer auto-selects based on media type)
    const localRootPath = rootFolderPath ? resolveToLocal(rootFolderPath) : undefined;
    
    // Resolve download path to local filesystem path
    const localScanPath = resolveToLocal(scanPath);
    
    // Determine if we should filter by download client category
    // Uses FilterByDownloadClient config (defaults to true)
    let shouldFilterByClient = filterByDownloadClient;
    if (shouldFilterByClient === undefined) {
      const filterConfig = await prisma.config.findUnique({
        where: { key: 'FilterByDownloadClient' },
      });
      // Default to true (enabled)
      shouldFilterByClient = filterConfig?.value !== 'false';
    }
    
    // Scan the downloads directory with optional download client filtering
    let files = await scanDirectory(localScanPath, localScanPath, true, {
      filterByDownloadClient: shouldFilterByClient
    });
    
    // Filter to selected files if specified
    if (selectedFiles && selectedFiles.length > 0) {
      const selectedSet = new Set(selectedFiles);
      files = files.filter(f => selectedSet.has(f.path));
    }
    
    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No files to import',
        imported: 0,
        failed: 0,
      });
    }
    
    // Get requireVolumeMatch config
    const requireVolumeMatchConfig = await prisma.config.findUnique({
      where: { key: 'RequireVolumeMatch' },
    });
    const requireVolumeMatch = requireVolumeMatchConfig?.value !== 'false'; // Default true
    
    // Import options (rootFolderPath is optional - importer will auto-select based on media type)
    const options: ImportOptions = {
      rootFolderPath: localRootPath,
      seriesId,
      qualityProfileId,
      copyMode,
      deleteSource,
      requireVolumeMatch,
    };
    
    // Create a command entry to track the import
    const command = await prisma.command.create({
      data: {
        name: 'ImportDownloads',
        body: JSON.stringify({
          downloadPath: scanPath,
          rootFolderPath: rootFolderPath || 'auto-select',
          fileCount: files.length,
        }),
        status: 'started',
        started: new Date(),
      },
    });
    
    try {
      // Import the files
      const result = await importFiles(files, options);
      
      // Update command status
      await prisma.command.update({
        where: { id: command.id },
        data: {
          status: result.success ? 'completed' : 'failed',
          ended: new Date(),
          result: JSON.stringify(result),
        },
      });
      
      return NextResponse.json({
        ...result,
        commandId: command.id,
      });
    } catch (error) {
      // Update command with failure
      await prisma.command.update({
        where: { id: command.id },
        data: {
          status: 'failed',
          ended: new Date(),
          result: JSON.stringify({ error: String(error) }),
        },
      });
      
      throw error;
    }
  } catch (error) {
    console.error('Error importing files:', error);
    return NextResponse.json(
      { error: 'Failed to import files', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check import status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const commandId = searchParams.get('commandId');
    
    if (commandId) {
      // Get specific command status
      const command = await prisma.command.findUnique({
        where: { id: parseInt(commandId, 10) },
      });
      
      if (!command) {
        return NextResponse.json(
          { error: 'Command not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        id: command.id,
        name: command.name,
        status: command.status,
        started: command.started,
        ended: command.ended,
        result: command.result ? JSON.parse(command.result) : null,
      });
    }
    
    // Get recent import commands
    const commands = await prisma.command.findMany({
      where: {
        name: 'ImportDownloads',
      },
      orderBy: {
        queued: 'desc',
      },
      take: 10,
    });
    
    return NextResponse.json(
      commands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        status: cmd.status,
        started: cmd.started,
        ended: cmd.ended,
        result: cmd.result ? JSON.parse(cmd.result) : null,
      }))
    );
  } catch (error) {
    console.error('Error fetching import status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import status' },
      { status: 500 }
    );
  }
}
