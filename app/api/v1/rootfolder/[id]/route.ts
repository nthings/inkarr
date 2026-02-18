// Root Folder by ID API

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

/**
 * @swagger
 * /api/v1/rootfolder/{id}:
 *   delete:
 *     summary: Delete a root folder
 *     description: Removes the root folder from the database. Does NOT delete the actual folder from the filesystem.
 *     tags: [Config]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The root folder ID
 *     responses:
 *       200:
 *         description: Root folder deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *       404:
 *         description: Root folder not found
 *       500:
 *         description: Server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rootFolderId = parseInt(id, 10);

    if (isNaN(rootFolderId)) {
      return NextResponse.json(
        { error: 'Invalid ID' },
        { status: 400 }
      );
    }

    // Check if root folder exists
    const existing = await prisma.rootFolder.findUnique({
      where: { id: rootFolderId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Root folder not found' },
        { status: 404 }
      );
    }

    // Only delete from database - do NOT delete the actual folder from filesystem
    await prisma.rootFolder.delete({
      where: { id: rootFolderId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting root folder:', error);
    return NextResponse.json(
      { error: 'Failed to delete root folder' },
      { status: 500 }
    );
  }
}
