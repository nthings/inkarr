// Calibre Settings API - GET all, POST new

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { validateSettings, CalibreError } from '@/app/lib/calibre';
import type { CalibreSettings } from '@/app/lib/types/calibre';
import type { CalibreProfile as PrismaCalibreProfile } from '@/app/generated/prisma/enums';

/**
 * @swagger
 * /api/v1/calibre:
 *   get:
 *     summary: Get all Calibre server configurations
 *     tags: [Calibre]
 *     responses:
 *       200:
 *         description: List of Calibre configurations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   host: { type: string }
 *                   port: { type: integer }
 *                   useSsl: { type: boolean }
 *                   enable: { type: boolean }
 */
export async function GET() {
  try {
    const settings = await prisma.calibreSettings.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    // Transform to API format
    const parsed = settings.map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      urlBase: s.urlBase ?? undefined,
      username: s.username ?? undefined,
      password: s.password ?? undefined,
      library: s.library ?? undefined,
      outputFormat: s.outputFormat ?? undefined,
      outputProfile: s.outputProfile.toLowerCase(),
      useSsl: s.useSsl,
      enable: s.enable,
      syncRootFolders: s.syncRootFolders ? JSON.parse(s.syncRootFolders) : [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching Calibre settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Calibre settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.host) {
      return NextResponse.json(
        { error: 'Host is required' },
        { status: 400 }
      );
    }

    // Build settings object for validation
    const settingsToValidate: CalibreSettings = {
      host: body.host,
      port: body.port ?? 8080,
      urlBase: body.urlBase,
      username: body.username,
      password: body.password,
      library: body.library,
      outputFormat: body.outputFormat,
      outputProfile: body.outputProfile ?? 'default',
      useSsl: body.useSsl ?? false,
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
    const outputProfile = mapToPrismaProfile(body.outputProfile);

    // Create the Calibre settings
    const created = await prisma.calibreSettings.create({
      data: {
        name: body.name ?? 'Default',
        host: body.host,
        port: body.port ?? 8080,
        urlBase: body.urlBase ?? null,
        username: body.username ?? null,
        password: body.password ?? null,
        library: body.library ?? null,
        outputFormat: body.outputFormat ?? null,
        outputProfile: outputProfile,
        useSsl: body.useSsl ?? false,
        enable: body.enable ?? true,
        syncRootFolders: body.syncRootFolders 
          ? JSON.stringify(body.syncRootFolders) 
          : null,
      },
    });

    return NextResponse.json({
      id: created.id,
      name: created.name,
      host: created.host,
      port: created.port,
      urlBase: created.urlBase ?? undefined,
      username: created.username ?? undefined,
      password: created.password ? '********' : undefined, // Mask password in response
      library: created.library ?? undefined,
      outputFormat: created.outputFormat ?? undefined,
      outputProfile: created.outputProfile.toLowerCase(),
      useSsl: created.useSsl,
      enable: created.enable,
      syncRootFolders: created.syncRootFolders 
        ? JSON.parse(created.syncRootFolders) 
        : [],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating Calibre settings:', error);
    if (error instanceof CalibreError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create Calibre settings' },
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
