// Scheduled Tasks API - View and manage background tasks

import { NextRequest, NextResponse } from 'next/server';
import { getScheduler, SCHEDULED_TASKS } from '@/app/lib/scheduler';

/**
 * @swagger
 * /api/v1/system/tasks:
 *   get:
 *     summary: Get status of all scheduled tasks
 *     tags: [System]
 *     responses:
 *       200:
 *         description: List of scheduled tasks with their status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       description: { type: string }
 *                       enabled: { type: boolean }
 *                       interval: { type: integer }
 *                       lastExecution: { type: string, format: date-time, nullable: true }
 *                       isRunning: { type: boolean }
 *                       nextExecution: { type: string, format: date-time, nullable: true }
 *                 schedulerRunning: { type: boolean }
 */
export async function GET() {
  try {
    const scheduler = getScheduler();
    const tasks = await scheduler.getTasksStatus();
    
    return NextResponse.json({
      tasks,
      schedulerRunning: true,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled tasks' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/system/tasks:
 *   post:
 *     summary: Run a task immediately
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskName
 *             properties:
 *               taskName: { type: string, description: Name of the task to run }
 *     responses:
 *       200:
 *         description: Task executed successfully
 *       400:
 *         description: Invalid task name
 *       409:
 *         description: Task already running
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskName } = body;
    
    if (!taskName) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      );
    }
    
    // Validate task name
    if (!SCHEDULED_TASKS[taskName as keyof typeof SCHEDULED_TASKS]) {
      return NextResponse.json(
        { error: `Unknown task: ${taskName}` },
        { status: 400 }
      );
    }
    
    const scheduler = getScheduler();
    const result = await scheduler.runTask(taskName);
    
    if (!result) {
      return NextResponse.json(
        { error: 'Task could not be executed (may already be running)' },
        { status: 409 }
      );
    }
    
    return NextResponse.json({
      taskName,
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
 * @swagger
 * /api/v1/system/tasks:
 *   put:
 *     summary: Update task configuration
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskName
 *             properties:
 *               taskName: { type: string, description: Name of the task to update }
 *               enabled: { type: boolean, description: Enable or disable the task }
 *               interval: { type: integer, description: Interval in minutes }
 *     responses:
 *       200:
 *         description: Task configuration updated
 *       400:
 *         description: Invalid parameters
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskName, enabled, interval } = body;
    
    if (!taskName) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      );
    }
    
    // Validate task name
    if (!SCHEDULED_TASKS[taskName as keyof typeof SCHEDULED_TASKS]) {
      return NextResponse.json(
        { error: `Unknown task: ${taskName}` },
        { status: 400 }
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
    await scheduler.updateTaskConfig(taskName, enabled, interval);
    
    const taskStatus = scheduler.getTaskStatus(taskName);
    
    return NextResponse.json({
      taskName,
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
