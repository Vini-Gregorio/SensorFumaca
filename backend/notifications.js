export async function deliverOne(repo, config, fetchFn = fetch) {
  if (!config.telegramEnabled) return false;
  const n = await repo.claimNotification();
  if (!n) return false;
  if (!n.telegram_chat_id || n.attempts > 5) {
    await repo.finishNotification(n.id, n.attempts, false, true);
    return true;
  }
  let success = false,
    permanent = false;
  try {
    const response = await fetchFn(
      `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ chat_id: n.telegram_chat_id, text: n.message }),
      },
    );
    const data = await response.json();
    success = response.ok && data.ok === true;
    permanent = [400, 401, 403, 404].includes(response.status);
  } catch {
    /* Persistir estado; nunca registrar URL que contém o token. */
  }
  await repo.finishNotification(n.id, n.attempts, success, permanent);
  return true;
}
export function startWorker(repo, config) {
  let stopped = false;
  let timer;
  let running = Promise.resolve();
  const tick = () => {
    running = deliverOne(repo, config)
      .catch(() => console.error('{"event":"notification_worker_failed"}'))
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 1000);
          timer.unref();
        }
      });
  };
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
