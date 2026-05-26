import mineflayer from 'mineflayer';

export function createBot(host, port, username) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const maxRetries = 60; // retry for up to 5 minutes
    const retryDelay = 5000;

    function attempt() {
      console.log(`[Bot] Connecting to ${host}:${port}... (attempt ${retries + 1})`);

      const bot = mineflayer.createBot({
        host,
        port,
        username,
        hideErrors: true
      });

      bot.once('spawn', () => {
        console.log(`[Bot] ${username} spawned at ${bot.entity.position}`);
        resolve(bot);
      });

      bot.once('error', (err) => {
        retries++;
        if (retries < maxRetries) {
          console.log(`[Bot] Can't connect (${err.message}). Retrying in ${retryDelay / 1000}s...`);
          setTimeout(attempt, retryDelay);
        } else {
          console.error('[Bot] Max retries reached. Give up.');
          reject(err);
        }
      });

      bot.once('kicked', (reason) => {
        console.error('[Bot] Kicked:', reason);
      });

      bot.on('end', () => {
        console.log('[Bot] Disconnected');
      });
    }

    attempt();
  });
}
