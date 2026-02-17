// Calibre Settings API - GET, PUT, DELETE individual settings

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { validateSettings, CalibreError } from '@/app/lib/calibre';
import type { CalibreSettings } from '@/app/lib/types/calibre';
import type { CalibreProfile as PrismaCalibreProfile } from '@/app/generated/prisma/enums';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * @swagger
 * /api/v1/calibre/{id}:
 *   get:
 *     summary: Get Calibre settings by ID
 *     tags: [Calibre]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Calibre settings
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update Calibre settings
 *     tags: [Calibre]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               host: { type: string }
 *               port: { type: integer }
 *               useSsl: { type: boolean }
 *               library: { type: string }
 *               enable: { type: boolean }
 *     responses:
 *       200:
 *         description: Settings updated
 *   delete:
 *     summary: Delete Calibre settings
 *     tags: [Calibre]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Settings deleted
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const settingsId = parseInt(id, 10);

    if (isNaN(settingsId)) {
      return NextResponse.json(
        { error: 'Invalid settings ID' },
        { status: 400 }
      );
    }

    const settings = await prisma.calibreSettings.findUnique({
      where: { id: settingsId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'Calibre settings not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: settings.id,
      name: settings.name,
      host: settings.host,
      port: settings.port,
      urlBase: settings.urlBase ?? undefined,
      username: settings.username ?? undefined,
      password: settings.password ?? undefined, // Include password for edit form
      library: settings.library ?? undefined,
      outputFormat: settings.outputFormat ?? undefined,
      outputProfile: settings.outputProfile.toLowerCase(),
      useSsl: settings.useSsl,
      enable: settings.enable,
      syncRootFolders: settings.syncRootFolders 
        ? JSON.parse(settings.syncRootFolders) 
        : [],
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching Calibre settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Calibre settings' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const settingsId = parseInt(id, 10);

    if (isNaN(settingsId)) {
      return NextResponse.json(
        { error: 'Invalid settings ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Check if settings exist
    const existing = await prisma.calibreSettings.findUnique({
      where: { id: settingsId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Calibre settings not found' },
        { status: 404 }
      );
    }

    // Build settings object for validation
    const settingsToValidate: CalibreSettings = {
      host: body.host ?? existing.host,
      port: body.port ?? existing.port,
      urlBase: body.urlBase ?? existing.urlBase ?? undefined,
      username: body.username ?? existing.username ?? undefined,
      password: body.password ?? existing.password ?? undefined,
      library: body.library ?? existing.library ?? undefined,
      outputFormat: body.outputFormat ?? existing.outputFormat ?? undefined,
      outputProfile: body.outputProfile ?? existing.outputProfile.toLowerCase(),
      useSsl: body.useSsl ?? existing.useSsl,
    };

    // Validate settings
    const validationErrors = validateSettings(settingsToValidate);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          errors: validationErrors 
        },
        { status: 400 }
      );
    }

    // Map outputProfile to Prisma enum
    const outputProfile = body.outputProfile 
      ? mapToPrismaProfile(body.outputProfile)
      : undefined;

    // Update the settings
    const updated = await prisma.calibreSettings.update({
      where: { id: settingsId },
      data: {
        name: body.name,
        host: body.host,
        port: body.port,
        urlBase: body.urlBase ?? null,
        username: body.username ?? null,
        password: body.password ?? null,
        library: body.library ?? null,
        outputFormat: body.outputFormat ?? null,
        outputProfile: outputProfile,
        useSsl: body.useSsl,
        enable: body.enable,
        syncRootFolders: body.syncRootFolders 
          ? JSON.stringify(body.syncRootFolders) 
          : null,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      host: updated.host,
      port: updated.port,
      urlBase: updated.urlBase ?? undefined,
      username: updated.username ?? undefined,
      password: updated.password ? '********' : undefined,
      library: updated.library ?? undefined,
      outputFormat: updated.outputFormat ?? undefined,
      outputProfile: updated.outputProfile.toLowerCase(),
      useSsl: updated.useSsl,
      enable: updated.enable,
      syncRootFolders: updated.syncRootFolders 
        ? JSON.parse(updated.syncRootFolders) 
        : [],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error updating Calibre settings:', error);
    if (error instanceof CalibreError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update Calibre settings' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const settingsId = parseInt(id, 10);

    if (isNaN(settingsId)) {
      return NextResponse.json(
        { error: 'Invalid settings ID' },
        { status: 400 }
      );
    }

    // Check if settings exist
    const existing = await prisma.calibreSettings.findUnique({
      where: { id: settingsId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Calibre settings not found' },
        { status: 404 }
      );
    }

    // Delete the settings
    await prisma.calibreSettings.delete({
      where: { id: settingsId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting Calibre settings:', error);
    return NextResponse.json(
      { error: 'Failed to delete Calibre settings' },
      { status: 500 }
    );
  }
}

/**
 * Map string profile to Prisma enum value
 */
function mapToPrismaProfile(profile?: string): PrismaCalibreProfile {
  if (!profile) return 'DEFAULT';
  
  const profileMap: Record<string, PrismaCalibreProfile> = {
    'default': 'DEFAULT',
    'kindle': 'KINDLE',
    'kindle_dx': 'KINDLE_DX',
    'kindle_fire': 'KINDLE_FIRE',
    'kindle_oasis': 'KINDLE_OASIS',
    'kindle_pw': 'KINDLE_PW',
    'kindle_pw3': 'KINDLE_PW3',
    'kindle_voyage': 'KINDLE_VOYAGE',
    'kobo': 'KOBO',
    'nook': 'NOOK',
    'nook_color': 'NOOK_COLOR',
    'nook_hd_plus': 'NOOK_HD_PLUS',
    'sony': 'SONY',
    'ipad': 'IPAD',
    'ipad3': 'IPAD3',
    'generic_eink': 'GENERIC_EINK',
    'generic_eink_hd': 'GENERIC_EINK_HD',
    'generic_eink_large': 'GENERIC_EINK_LARGE',
    'tablet': 'TABLET',
  };

  return profileMap[profile.toLowerCase()] ?? 'DEFAULT';
}
