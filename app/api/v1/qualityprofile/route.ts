// Quality Profiles API

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

/**
 * @swagger
 * /api/v1/qualityprofile:
 *   get:
 *     summary: Get all quality profiles
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: List of quality profiles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   upgradeAllowed: { type: boolean }
 *                   cutoff: { type: integer }
 *                   items: { type: array }
 */
export async function GET() {
  try {
    const profiles = await prisma.qualityProfile.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    // Parse items JSON for each profile
    const parsed = profiles.map(profile => ({
      ...profile,
      items: JSON.parse(profile.items),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching quality profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quality profiles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      upgradeAllowed = true,
      cutoff,
      items,
    }: {
      name: string;
      upgradeAllowed?: boolean;
      cutoff: number;
      items: Array<{
        quality: { id: number; name: string };
        allowed: boolean;
      }>;
    } = body;

    if (!name || cutoff === undefined || !items) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const profile = await prisma.qualityProfile.create({
      data: {
        name,
        upgradeAllowed,
        cutoff,
        items: JSON.stringify(items),
      },
    });

    return NextResponse.json({
      ...profile,
      items,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating quality profile:', error);
    return NextResponse.json(
      { error: 'Failed to create quality profile' },
      { status: 500 }
    );
  }
}
