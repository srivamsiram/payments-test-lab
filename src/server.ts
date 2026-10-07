import { config } from './config';
import { createContainer } from './container';
import { logger } from './logger';

async function main(): Promise<void> {
  const container = createContainer();
  await container.start();

  const server = container.app.listen(config.port, () => {
    logger.info({ port: config.port }, 'payments-service listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    server.close();
    await container.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start payments-service');
  process.exit(1);
});
