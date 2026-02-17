// Indexer API - GET, PUT, DELETE by ID

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

/**
 * @swagger
 * /api/v1/indexer/{id}:
 *   get:
 *     summary: Get an indexer by ID
 *     tags: [Indexers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Indexer details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update an indexer
 *     tags: [Indexers]
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
 *               settings: { type: object }
 *               enableRss: { type: boolean }
 *               enableAutomaticSearch: { type: boolean }
 *               priority: { type: integer }
 *     responses:
 *       200:
 *         description: Indexer updated
 *   delete:
 *     summary: Delete an indexer
 *     tags: [Indexers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Indexer deleted
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const indexer = await prisma.indexer.findUnique({
      where: { id: parseInt(id, 10) },
      include: { status: true },
    });

    if (!indexer) {
      return NextResponse.json(
        { error: 'Indexer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...indexer,
      settings: JSON.parse(indexer.settings),
      tags: indexer.tags ? JSON.parse(indexer.tags) : [],
    });
  } catch (error) {
    console.error('Error fetching indexer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indexer' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      implementation,
      protocol,
      settings,
      enableRss,
      enableAutomaticSearch,
      enableInteractiveSearch,
      priority,
      downloadClientId,
      tags,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (implementation !== undefined) updateData.implementation = implementation;
    if (protocol !== undefined) updateData.protocol = protocol;
    if (settings !== undefined) updateData.settings = JSON.stringify(settings);
    if (enableRss !== undefined) updateData.enableRss = enableRss;
    if (enableAutomaticSearch !== undefined) updateData.enableAutomaticSearch = enableAutomaticSearch;
    if (enableInteractiveSearch !== undefined) updateData.enableInteractiveSearch = enableInteractiveSearch;
    if (priority !== undefined) updateData.priority = priority;
    if (downloadClientId !== undefined) updateData.downloadClientId = downloadClientId;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);

    const indexer = await prisma.indexer.update({
      where: { id: parseInt(id, 10) },
      data: updateData,
    });

    return NextResponse.json({
      ...indexer,
      settings: JSON.parse(indexer.settings),
      tags: indexer.tags ? JSON.parse(indexer.tags) : [],
    });
  } catch (error) {
    console.error('Error updating indexer:', error);
    return NextResponse.json(
      { error: 'Failed to update indexer' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.indexer.delete({
      where: { id: parseInt(id, 10) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting indexer:', error);
    return NextResponse.json(
      { error: 'Failed to delete indexer' },
      { status: 500 }
    );
  }
}
