// Command API - POST to trigger system commands, GET to check status

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

// Available command types
type CommandType = 
  | 'ScanDownloads'
  | 'ImportDownloads'
  | 'RefreshSeries'
  | 'SearchSeries'
  | 'RssSync'
  | 'ApplicationUpdate'
  | 'Backup'
  | 'CleanupRecycleBin';

interface CommandRequest {
  name: CommandType;
  body?: Record<string, unknown>;
  priority?: number;
}

/**
 * @swagger
 * /api/v1/command:
 *   post:
 *     summary: Execute a system command
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 enum: [ScanDownloads, ImportDownloads, RefreshSeries, SearchSeries, RssSync, ApplicationUpdate, Backup, CleanupRecycleBin]
 *               body: { type: object }
 *               priority: { type: integer }
 *     responses:
 *       200:
 *         description: Command executed successfully
 *       400:
 *         description: Unknown command
 */

// Command handlers
async function executeScanDownloads(body?: Record<string, unknown>) {
  const { scanDirectory, groupBySeries } = await import('@/app/lib/import');
  
  const downloadPath = (body?.downloadPath as string) || process.env.DOWNLOADS_FOLDER || './data/downloads';
  const files = await scanDirectory(downloadPath);
  const groups = groupBySeries(files);
  
  return {
    path: downloadPath,
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    seriesCount: groups.size,
    series: Array.from(groups.entries()).map(([key, files]) => ({
      cleanTitle: key,
      seriesTitle: files[0].parsed.seriesTitle,
      fileCount: files.length,
      volumeNumbers: [...new Set(files.filter(f => f.parsed.volumeNumber).map(f => f.parsed.volumeNumber))].sort((a, b) => (a ?? 0) - (b ?? 0)),
    })),
  };
}

async function executeImportDownloads(body?: Record<string, unknown>) {
  const { scanDirectory, importFiles } = await import('@/app/lib/import');
  type ImportOptions = Parameters<typeof importFiles>[1];
  
  const downloadPath = (body?.downloadPath as string) || process.env.DOWNLOADS_FOLDER || './data/downloads';
  
  // Get root folder
  let rootFolderPath = body?.rootFolderPath as string | undefined;
  if (!rootFolderPath) {
    const rootFolder = await prisma.rootFolder.findFirst({
      orderBy: { id: 'asc' },
    });
    rootFolderPath = rootFolder?.path;
  }
  
  if (!rootFolderPath) {
    throw new Error('No root folder configured');
  }
  
  const files = await scanDirectory(downloadPath);
  const options: ImportOptions = {
    rootFolderPath,
    seriesId: body?.seriesId as number | undefined,
    qualityProfileId: body?.qualityProfileId as number | undefined,
    copyMode: body?.copyMode as boolean | undefined,
    deleteSource: body?.deleteSource as boolean | undefined,
  };
  
  return importFiles(files, options);
}

async function executeRefreshSeries(body?: Record<string, unknown>) {
  const seriesId = body?.seriesId as number | undefined;
  
  if (seriesId) {
    // Refresh specific series
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    });
    
    if (!series) {
      throw new Error(`Series ${seriesId} not found`);
    }
    
    // TODO: Implement metadata refresh from external sources
    await prisma.series.update({
      where: { id: seriesId },
      data: { lastInfoSync: new Date() },
    });
    
    return { seriesId, refreshed: true };
  }
  
  // Refresh all series
  await prisma.series.updateMany({
    data: { lastInfoSync: new Date() },
  });
  
  const count = await prisma.series.count();
  return { refreshed: true, count };
}

// Main handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, body: commandBody, priority = 0 }: CommandRequest = body;
    
    if (!name) {
      return NextResponse.json(
        { error: 'Command name is required' },
        { status: 400 }
      );
    }
    
    // Create command entry
    const command = await prisma.command.create({
      data: {
        name,
        body: commandBody ? JSON.stringify(commandBody) : null,
        priority,
        status: 'started',
        started: new Date(),
      },
    });
    
    try {
      let result: unknown;
      
      switch (name) {
        case 'ScanDownloads':
          result = await executeScanDownloads(commandBody);
          break;
        case 'ImportDownloads':
          result = await executeImportDownloads(commandBody);
          break;
        case 'RefreshSeries':
          result = await executeRefreshSeries(commandBody);
          break;
        default:
          result = { message: `Command ${name} queued but handler not implemented` };
      }
      
      // Update command with success
      await prisma.command.update({
        where: { id: command.id },
        data: {
          status: 'completed',
          ended: new Date(),
          result: JSON.stringify(result),
        },
      });
      
      return NextResponse.json({
        id: command.id,
        name: command.name,
        status: 'completed',
        result,
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
      
      return NextResponse.json(
        {
          id: command.id,
          name: command.name,
          status: 'failed',
          error: String(error),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error executing command:', error);
    return NextResponse.json(
      { error: 'Failed to execute command', details: String(error) },
      { status: 500 }
    );
  }
}

// GET recent commands
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const name = searchParams.get('name');
    
    if (id) {
      const command = await prisma.command.findUnique({
        where: { id: parseInt(id, 10) },
      });
      
      if (!command) {
        return NextResponse.json(
          { error: 'Command not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        ...command,
        body: command.body ? JSON.parse(command.body) : null,
        result: command.result ? JSON.parse(command.result) : null,
      });
    }
    
    // List commands with filters
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (name) where.name = name;
    
    const commands = await prisma.command.findMany({
      where,
      orderBy: { queued: 'desc' },
      take: 50,
    });
    
    return NextResponse.json(
      commands.map(cmd => ({
        ...cmd,
        body: cmd.body ? JSON.parse(cmd.body) : null,
        result: cmd.result ? JSON.parse(cmd.result) : null,
      }))
    );
  } catch (error) {
    console.error('Error fetching commands:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commands' },
      { status: 500 }
    );
  }
}
