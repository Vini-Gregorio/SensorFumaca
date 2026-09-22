export async function deliverOne(repo, config, fetchFn = fetch) {
  if (!config.telegramEnabled) return false;
  const n = await repo.claimNotification();
  if (!n) return false;
  if (!n.telegram_chat_id || n.attempts > 5) {
    await repo.finishNotification(n.id, n.attempts, false, true, {
      leaseToken: n.leaseToken,
      errorCode: !n.telegram_chat_id ? "NO_DESTINATION" : "ATTEMPTS_EXHAUSTED",
    });
    return true;
  }
  let success = false,
    permanent = false;
  const outcome = {
    leaseToken: n.leaseToken,
    errorCode: "DELIVERY_ERROR",
    retryAfterMs: 0,
  };
  try {
    const response = await fetchFn(
      `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          chat_id: n.telegram_chat_id,
          text:
            (n.retry_count ? "[REENVIO MANUAL: evento histórico] " : "") +
            n.message,
        }),
      },
    );
    const data = await response.json();
    success = response.ok && data.ok === true;
    permanent = [400, 401, 403, 404].includes(response.status);
    const seconds = data.parameters?.retry_after;
    if (response.status === 429) {
      outcome.errorCode = "RATE_LIMITED";
      if (Number.isInteger(seconds) && seconds > 0)
        outcome.retryAfterMs = Math.min(86400, seconds) * 1000;
    } else if (permanent) outcome.errorCode = "TELEGRAM_REJECTED";
    else if (response.status >= 500) outcome.errorCode = "TELEGRAM_UNAVAILABLE";
  } catch (error) {
    outcome.errorCode =
      error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR";
    /* Persistir estado; nunca registrar URL que contém o token. */
  }
  await repo.finishNotification(n.id, n.attempts, success, permanent, outcome);
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
