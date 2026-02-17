// Task Scheduler for Inkarr
// Manages scheduled background tasks using an in-memory interval-based approach
// Persists task state to database and supports dynamic configuration

import prisma from '@/app/lib/db';
import { CONFIG_DEFAULTS } from '@/app/lib/config-defaults';
import {
  SCHEDULED_TASKS,
  TaskResult,
  executeAutoImport,
  executeQueueCheck,
  executeRssSync,
  executeSearchMonitored,
  executeRefreshSeries,
  executeSendStatistics,
} from './tasks';

// Singleton scheduler instance
let schedulerInstance: Scheduler | null = null;
let schedulerStartPromise: Promise<void> | null = null;

// Task executor function type
type TaskExecutor = (context: { taskName: string; lastExecution: Date | null; interval: number }) => Promise<TaskResult>;

// Task definition
interface ScheduledTaskDefinition {
  name: string;
  description: string;
  executor: TaskExecutor;
  enabledKey: string;
  intervalKey: string;
  defaultInterval: number; // minutes
}

// Task runtime state
interface TaskState {
  intervalId: NodeJS.Timeout | null;
  lastExecution: Date | null;
  lastResult: TaskResult | null;
  isRunning: boolean;
  enabled: boolean;
  interval: number; // minutes
}

// Map task names to executors
const TASK_EXECUTORS: Record<string, TaskExecutor> = {
  AutoImport: executeAutoImport,
  QueueCheck: executeQueueCheck,
  RssSync: executeRssSync,
  SearchMonitored: executeSearchMonitored,
  RefreshSeries: executeRefreshSeries,
  SendStatistics: executeSendStatistics,
};

/**
 * Scheduler class manages all scheduled tasks
 */
export class Scheduler {
  private tasks: Map<string, ScheduledTaskDefinition> = new Map();
  private taskStates: Map<string, TaskState> = new Map();
  private isRunning: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // Register all tasks
    for (const [key, taskDef] of Object.entries(SCHEDULED_TASKS)) {
      const executor = TASK_EXECUTORS[key] as TaskExecutor | undefined;
      if (executor !== undefined) {
        this.tasks.set(key, {
          name: taskDef.name,
          description: taskDef.description,
          executor,
          enabledKey: taskDef.enabledKey,
          intervalKey: taskDef.intervalKey,
          defaultInterval: taskDef.defaultInterval,
        });
        
        this.taskStates.set(key, {
          intervalId: null,
          lastExecution: null,
          lastResult: null,
          isRunning: false,
          enabled: false,
          interval: taskDef.defaultInterval,
        });
      }
    }
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting...');
    this.isRunning = true;

    // Load task configurations and start enabled tasks
    for (const [taskName, taskDef] of this.tasks) {
      await this.loadTaskConfig(taskName, taskDef);
    }

    console.log('[Scheduler] Started with tasks:', Array.from(this.tasks.keys()));
    this.isInitialized = true;
  }

  /**
   * Wait for scheduler to be fully initialized
   */
  async waitForInit(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) return;
    
    // Wait for start promise if exists (from instrumentation.ts)
    if (schedulerStartPromise) {
      await schedulerStartPromise;
      return;
    }
    
    // If no start promise exists, we're in a new process - start the scheduler
    await this.start();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    console.log('[Scheduler] Stopping...');
    
    for (const [taskName, state] of this.taskStates) {
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
        console.log(`[Scheduler] Stopped task: ${taskName}`);
      }
    }
    
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  /**
   * Load task configuration from database
   */
  private async loadTaskConfig(taskName: string, taskDef: ScheduledTaskDefinition): Promise<void> {
    const state = this.taskStates.get(taskName)!;
    
    try {
      // Get the default value for this task's enabled key
      const defaultEnabled = CONFIG_DEFAULTS[taskDef.enabledKey] === 'true';
      const defaultInterval = parseInt(CONFIG_DEFAULTS[taskDef.intervalKey] || String(taskDef.defaultInterval), 10);
      
      // Get enabled status from DB or use default
      const enabledConfig = await prisma.config.findUnique({
        where: { key: taskDef.enabledKey },
      });
      state.enabled = enabledConfig ? enabledConfig.value === 'true' : defaultEnabled;
      
      // If no config exists, create it with the proper default
      if (!enabledConfig) {
        await prisma.config.create({
          data: { key: taskDef.enabledKey, value: String(defaultEnabled) },
        });
      }
      
      // Get interval from DB or use default
      const intervalConfig = await prisma.config.findUnique({
        where: { key: taskDef.intervalKey },
      });
      state.interval = intervalConfig ? parseInt(intervalConfig.value, 10) : defaultInterval;
      
      // Get last execution time from ScheduledTask table
      const scheduledTask = await prisma.scheduledTask.findUnique({
        where: { name: taskName },
      });
      state.lastExecution = scheduledTask?.lastExecution ?? null;
      
      // Start task if enabled
      if (state.enabled) {
        this.scheduleTask(taskName, taskDef, state);
      }
    } catch (error) {
      console.error(`[Scheduler] Failed to load config for ${taskName}:`, error);
    }
  }

  /**
   * Schedule a task to run at its configured interval
   */
  private scheduleTask(taskName: string, taskDef: ScheduledTaskDefinition, state: TaskState): void {
    // Clear existing interval if any
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    const intervalMs = state.interval * 60 * 1000; // Convert minutes to milliseconds
    
    console.log(`[Scheduler] Scheduling ${taskName} every ${state.interval} minutes`);

    // Check if we should run immediately (based on last execution)
    const shouldRunNow = this.shouldRunImmediately(state.lastExecution, state.interval);
    
    if (shouldRunNow) {
      console.log(`[Scheduler] Running ${taskName} immediately (overdue)`);
      this.runTask(taskName);
    }

    // Set up recurring interval
    state.intervalId = setInterval(() => {
      this.runTask(taskName);
    }, intervalMs);
  }

  /**
   * Check if task should run immediately based on last execution
   */
  private shouldRunImmediately(lastExecution: Date | null, intervalMinutes: number): boolean {
    if (!lastExecution) return true;
    
    const now = new Date();
    const elapsed = (now.getTime() - lastExecution.getTime()) / (1000 * 60); // minutes
    return elapsed >= intervalMinutes;
  }

  /**
   * Run a task immediately
   */
  async runTask(taskName: string): Promise<TaskResult | null> {
    const taskDef = this.tasks.get(taskName);
    const state = this.taskStates.get(taskName);
    
    if (!taskDef || !state) {
      console.error(`[Scheduler] Task not found: ${taskName}`);
      return null;
    }

    if (state.isRunning) {
      console.log(`[Scheduler] Task ${taskName} is already running, skipping`);
      return null;
    }

    state.isRunning = true;
    const startTime = new Date();
    
    console.log(`[Scheduler] Running task: ${taskName}`);
    
    try {
      // Update start time in database
      await prisma.scheduledTask.upsert({
        where: { name: taskName },
        update: { lastStartTime: startTime },
        create: {
          name: taskName,
          interval: state.interval,
          lastStartTime: startTime,
        },
      });

      // Execute the task
      const result = await taskDef.executor({
        taskName,
        lastExecution: state.lastExecution,
        interval: state.interval,
      });

      // Update state
      state.lastExecution = new Date();
      state.lastResult = result;

      // Update database
      await prisma.scheduledTask.update({
        where: { name: taskName },
        data: { lastExecution: state.lastExecution },
      });

      // Log result
      const level = result.success ? 'Info' : 'Warn';
      await prisma.log.create({
        data: {
          level,
          logger: `Scheduler.${taskName}`,
          message: result.message,
        },
      });

      console.log(`[Scheduler] Task ${taskName} completed: ${result.message}`);
      return result;
    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `Task failed with error: ${error}`,
      };
      state.lastResult = errorResult;

      // Log error
      await prisma.log.create({
        data: {
          level: 'Error',
          logger: `Scheduler.${taskName}`,
          message: errorResult.message,
          exception: String(error),
        },
      });

      console.error(`[Scheduler] Task ${taskName} failed:`, error);
      return errorResult;
    } finally {
      state.isRunning = false;
    }
  }

  /**
   * Update task configuration
   */
  async updateTaskConfig(taskName: string, enabled: boolean, interval?: number): Promise<void> {
    const taskDef = this.tasks.get(taskName);
    const state = this.taskStates.get(taskName);
    
    if (!taskDef || !state) {
      throw new Error(`Task not found: ${taskName}`);
    }

    // Update enabled status
    state.enabled = enabled;
    await prisma.config.upsert({
      where: { key: taskDef.enabledKey },
      update: { value: String(enabled) },
      create: { key: taskDef.enabledKey, value: String(enabled) },
    });

    // Update interval if provided
    if (interval !== undefined) {
      state.interval = interval;
      await prisma.config.upsert({
        where: { key: taskDef.intervalKey },
        update: { value: String(interval) },
        create: { key: taskDef.intervalKey, value: String(interval) },
      });
    }

    // Stop or restart task
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    if (enabled) {
      this.scheduleTask(taskName, taskDef, state);
    }

    console.log(`[Scheduler] Updated ${taskName}: enabled=${enabled}, interval=${state.interval}min`);
  }

  /**
   * Get status of all tasks
   */
  async getTasksStatus(): Promise<Array<{
    name: string;
    description: string;
    enabled: boolean;
    interval: number;
    lastExecution: Date | null;
    lastResult: TaskResult | null;
    isRunning: boolean;
    nextExecution: Date | null;
  }>> {
    // Wait for scheduler to be initialized from DB
    await this.waitForInit();
    
    const statuses = [];
    
    for (const [taskName, taskDef] of this.tasks) {
      const state = this.taskStates.get(taskName)!;
      
      let nextExecution: Date | null = null;
      if (state.enabled && state.lastExecution) {
        nextExecution = new Date(state.lastExecution.getTime() + state.interval * 60 * 1000);
      } else if (state.enabled) {
        nextExecution = new Date(); // Will run soon
      }
      
      statuses.push({
        name: taskName,
        description: taskDef.description,
        enabled: state.enabled,
        interval: state.interval,
        lastExecution: state.lastExecution,
        lastResult: state.lastResult,
        isRunning: state.isRunning,
        nextExecution,
      });
    }
    
    return statuses;
  }

  /**
   * Get status of a specific task
   */
  getTaskStatus(taskName: string) {
    const taskDef = this.tasks.get(taskName);
    const state = this.taskStates.get(taskName);
    
    if (!taskDef || !state) {
      return null;
    }
    
    let nextExecution: Date | null = null;
    if (state.enabled && state.lastExecution) {
      nextExecution = new Date(state.lastExecution.getTime() + state.interval * 60 * 1000);
    }
    
    return {
      name: taskName,
      description: taskDef.description,
      enabled: state.enabled,
      interval: state.interval,
      lastExecution: state.lastExecution,
      lastResult: state.lastResult,
      isRunning: state.isRunning,
      nextExecution,
    };
  }
}

/**
 * Get singleton scheduler instance
 */
export function getScheduler(): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
  }
  return schedulerInstance;
}

/**
 * Start the scheduler (called from instrumentation.ts)
 */
export async function startScheduler(): Promise<void> {
  const scheduler = getScheduler();
  schedulerStartPromise = scheduler.start();
  await schedulerStartPromise;
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
