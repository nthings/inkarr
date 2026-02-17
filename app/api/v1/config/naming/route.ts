// Naming Config API - Get and update file naming settings

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { DEFAULT_NAMING_CONFIG } from '@/app/lib/naming';

/**
 * @swagger
 * /api/v1/config/naming:
 *   get:
 *     summary: Get file naming configuration
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Naming configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 renameFiles: { type: boolean }
 *                 replaceIllegalChars: { type: boolean }
 *                 colonReplacementFormat: { type: string }
 *                 standardFileFormat: { type: string }
 *                 seriesFolderFormat: { type: string }
 *                 volumeFolderFormat: { type: string }
 *                 creatorFolderFormat: { type: string }
 */
export async function GET() {
  try {
    let config = await prisma.namingConfig.findFirst();
    
    if (!config) {
      // Create default config
      config = await prisma.namingConfig.create({
        data: {
          renameFiles: DEFAULT_NAMING_CONFIG.renameFiles,
          replaceIllegalChars: DEFAULT_NAMING_CONFIG.replaceIllegalChars,
          colonReplacementFormat: DEFAULT_NAMING_CONFIG.colonReplacementFormat,
          standardFileFormat: DEFAULT_NAMING_CONFIG.standardFileFormat,
          seriesFolderFormat: DEFAULT_NAMING_CONFIG.seriesFolderFormat,
          volumeFolderFormat: DEFAULT_NAMING_CONFIG.volumeFolderFormat || 'Volume {Volume Number}',
          creatorFolderFormat: DEFAULT_NAMING_CONFIG.creatorFolderFormat,
        },
      });
    }
    
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching naming config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch naming config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get existing config or create new one
    let config = await prisma.namingConfig.findFirst();
    
    const updateData = {
      renameFiles: body.renameFiles ?? config?.renameFiles ?? DEFAULT_NAMING_CONFIG.renameFiles,
      replaceIllegalChars: body.replaceIllegalChars ?? config?.replaceIllegalChars ?? DEFAULT_NAMING_CONFIG.replaceIllegalChars,
      colonReplacementFormat: body.colonReplacementFormat ?? config?.colonReplacementFormat ?? DEFAULT_NAMING_CONFIG.colonReplacementFormat,
      standardFileFormat: body.standardFileFormat ?? config?.standardFileFormat ?? DEFAULT_NAMING_CONFIG.standardFileFormat,
      seriesFolderFormat: body.seriesFolderFormat ?? config?.seriesFolderFormat ?? DEFAULT_NAMING_CONFIG.seriesFolderFormat,
      volumeFolderFormat: body.volumeFolderFormat ?? config?.volumeFolderFormat ?? DEFAULT_NAMING_CONFIG.volumeFolderFormat,
      creatorFolderFormat: body.creatorFolderFormat ?? config?.creatorFolderFormat ?? DEFAULT_NAMING_CONFIG.creatorFolderFormat,
    };
    
    if (config) {
      config = await prisma.namingConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    } else {
      config = await prisma.namingConfig.create({
        data: updateData,
      });
    }
    
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error updating naming config:', error);
    return NextResponse.json(
      { error: 'Failed to update naming config' },
      { status: 500 }
    );
  }
}
