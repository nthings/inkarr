// Config API - System configuration management

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import logger from '@/app/lib/logger';
import { CONFIG_DEFAULTS } from '@/app/lib/config-defaults';

// Helper to generate a random API key
function generateApiKey(): string {
  return Array.from({ length: 32 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
}

// Use shared defaults
const DEFAULTS = CONFIG_DEFAULTS;

// Lazily initialized API key
let cachedApiKey: string | null = null;

async function ensureApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  
  const existing = await prisma.config.findUnique({ where: { key: 'ApiKey' } });
  if (existing?.value) {
    cachedApiKey = existing.value;
    return cachedApiKey;
  }
  
  // Generate and store a new API key
  const newKey = generateApiKey();
  await prisma.config.upsert({
    where: { key: 'ApiKey' },
    update: { value: newKey },
    create: { key: 'ApiKey', value: newKey },
  });
  cachedApiKey = newKey;
  return newKey;
}

/**
 * @swagger
 * /api/v1/config:
 *   get:
 *     summary: Get configuration values
 *     tags: [Config]
 *     parameters:
 *       - in: query
 *         name: key
 *         schema:
 *           type: string
 *         description: Specific config key to retrieve. If omitted, returns all config.
 *     responses:
 *       200:
 *         description: Configuration values
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *       404:
 *         description: Config key not found
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    
    // Ensure API key exists
    const apiKey = await ensureApiKey();
    
    if (key) {
      // Get single config value
      if (key === 'ApiKey') {
        return NextResponse.json({ key, value: apiKey });
      }
      
      const config = await prisma.config.findUnique({
        where: { key },
      });
      
      return NextResponse.json({
        key,
        value: config?.value ?? DEFAULTS[key] ?? null,
      });
    }
    
    // Get all config
    const configs = await prisma.config.findMany();
    const configMap: Record<string, string> = {};
    
    // Apply defaults first
    for (const [k, v] of Object.entries(DEFAULTS)) {
      configMap[k] = v;
    }
    
    // Override with actual values
    for (const config of configs) {
      configMap[config.key] = config.value;
    }
    
    // Ensure ApiKey is set
    configMap['ApiKey'] = apiKey;
    
    return NextResponse.json(configMap);
  } catch (error) {
    logger.error('Error fetching config', 'ConfigAPI', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/config:
 *   post:
 *     summary: Set a configuration value
 *     tags: [Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *             properties:
 *               key: { type: string }
 *               value: { type: string }
 *               regenerate: { type: boolean, description: Set to true to regenerate API key }
 *     responses:
 *       200:
 *         description: Config value updated
 *       400:
 *         description: Key is required
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, regenerate }: { key: string; value?: string; regenerate?: boolean } = body;
    
    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }
    
    // Handle API key regeneration
    if (key === 'ApiKey' && regenerate) {
      const newKey = generateApiKey();
      cachedApiKey = newKey;
      const config = await prisma.config.upsert({
        where: { key: 'ApiKey' },
        update: { value: newKey },
        create: { key: 'ApiKey', value: newKey },
      });
      return NextResponse.json(config);
    }
    
    // Clear API key cache if updating it directly
    if (key === 'ApiKey') {
      cachedApiKey = null;
    }
    
    // Upsert config value
    const config = await prisma.config.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
    
    // Refresh logger if LogLevel was updated
    if (key === 'LogLevel') {
      await logger.refresh();
    }
    
    return NextResponse.json(config);
  } catch (error) {
    logger.error('Error updating config', 'ConfigAPI', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/config:
 *   put:
 *     summary: Bulk update configuration values
 *     tags: [Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 *               - type: object
 *                 additionalProperties:
 *                   type: string
 *     responses:
 *       200:
 *         description: Config values updated
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Bulk update config
    const updates: { key: string; value: string }[] = Array.isArray(body) 
      ? body 
      : Object.entries(body).map(([key, value]) => ({ key, value: String(value) }));
    
    const results = await Promise.all(
      updates.map(({ key, value }) =>
        prisma.config.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );
    
    // Refresh logger if LogLevel was updated
    if (updates.some(u => u.key === 'LogLevel')) {
      await logger.refresh();
    }
    
    return NextResponse.json(results);
  } catch (error) {
    logger.error('Error updating config', 'ConfigAPI', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    
    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }
    
    await prisma.config.delete({
      where: { key },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting config', 'ConfigAPI', error);
    return NextResponse.json(
      { error: 'Failed to delete config' },
      { status: 500 }
    );
  }
}
