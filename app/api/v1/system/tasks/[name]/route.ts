// Single Task API - Get/update individual task status

import { NextRequest, NextResponse } from 'next/server';
import { getScheduler, SCHEDULED_TASKS } from '@/app/lib/scheduler';

interface RouteParams {
  params: Promise<{
    name: string;
  }>;
}

/**
 * @swagger
 * /api/v1/system/tasks/{name}:
 *   get:
 *     summary: Get status of a specific task
 *     tags: [System]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Task name (e.g., RefreshSeries, ScanDownloads, SendStatistics)
 *     responses:
 *       200:
 *         description: Task status
 *       404:
 *         description: Task not found
 *   post:
 *     summary: Run a specific task immediately
 *     tags: [System]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task started
 *       404:
 *         description: Task not found
 *   put:
 *     summary: Update task settings (enable/disable, change interval)
 *     tags: [System]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled: { type: boolean }
 *               interval: { type: string, description: Cron expression }
 *     responses:
 *       200:
 *         description: Task updated
 */
/**
 * GET /api/v1/system/tasks/[name]
 * Get status of a specific task
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    
    // Validate task name
    if (!SCHEDULED_TASKS[name as keyof typeof SCHEDULED_TASKS]) {
      return NextResponse.json(
        { error: `Unknown task: ${name}` },
        { status: 404 }
      );
    }
    
    const scheduler = getScheduler();
    const status = scheduler.getTaskStatus(name);
    
    if (!status) {
      return NextResponse.json(
        { error: `Task not found: ${name}` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching task status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/system/tasks/[name]
 * Run a specific task immediately
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    
    // Validate task name
    if (!SCHEDULED_TASKS[name as keyof typeof SCHEDULED_TASKS]) {
      return NextResponse.json(
        { error: `Unknown task: ${name}` },
        { status: 404 }
      );
    }
    
    const scheduler = getScheduler();
    const result = await scheduler.runTask(name);
    
    if (!result) {
      return NextResponse.json(
        { error: 'Task could not be executed (may already be running)' },
        { status: 409 }
      );
    }
    
    return NextResponse.json({
      taskName: name,
      result,
    });
  } catch (error) {
    console.error('Error running task:', error);
    return NextResponse.json(
      { error: 'Failed to run task' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/system/tasks/[name]
 * Update a specific task configuration
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { enabled, interval } = body;
    
    // Validate task name
    if (!SCHEDULED_TASKS[name as keyof typeof SCHEDULED_TASKS]) {
      return NextResponse.json(
        { error: `Unknown task: ${name}` },
        { status: 404 }
      );
    }
    
    // Validate interval if provided
    if (interval !== undefined && (typeof interval !== 'number' || interval < 1)) {
      return NextResponse.json(
        { error: 'Interval must be a positive number (minutes)' },
        { status: 400 }
      );
    }
    
    const scheduler = getScheduler();
    await scheduler.updateTaskConfig(name, enabled, interval);
    
    const taskStatus = scheduler.getTaskStatus(name);
    
    return NextResponse.json({
      taskName: name,
      updated: true,
      status: taskStatus,
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
