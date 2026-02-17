// Next.js Instrumentation - runs once on server startup
// Used to initialize background tasks like the scheduler

export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing Inkarr server components...');
    
    // Dynamically import scheduler to avoid client-side loading
    const { startScheduler } = await import('./app/lib/scheduler');
    
    // Start the scheduler
    try {
      await startScheduler();
      console.log('[Instrumentation] Scheduler started successfully');
    } catch (error) {
      console.error('[Instrumentation] Failed to start scheduler:', error);
    }
  }
}
