import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const token = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export function equalHash(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === 64 && b.length === 64 && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Objeto JSON obrigatório.');
  return value;
}
export function text(value, name, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `${name} inválido.`);
  return value.trim();
}
export function identifier(value, name = 'Identificador') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(value)) throw new HttpError(400, `${name} inválido.`);
  return value;
}
export function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, `${name} inválido.`);
  return value;
}
export function credentials(body) {
  requireObject(body);
  const email = text(body.email, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email inválido.');
  if (typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password) > 72) throw new HttpError(400, 'Senha: mínimo 12 caracteres e máximo 72 bytes.');
  return { email, password: body.password };
}
export function sensorConfig(body) {
  requireObject(body);
  const high = integer(body.high, 1, 4095, 'Limiar de ativação');
  const low = integer(body.low, 0, high - 1, 'Limiar de recuperação');
  const confirmMs = integer(body.confirmMs, 100, 60000, 'Confirmação');
  return { high, low, confirmMs };
}
export function telemetry(body) {
  requireObject(body);
  identifier(body.deviceId);
  if (typeof body.bootId !== 'string' || !/^[a-f0-9]{16}$/.test(body.bootId)) throw new HttpError(400, 'bootId inválido.');
  integer(body.sequence, 0, 4294967295, 'sequence');
  integer(body.uptimeMs, 0, 4294967295, 'uptimeMs');
  integer(body.ageMs, 0, 86400000, 'ageMs');
  integer(body.configVersion, 1, 2147483647, 'configVersion');
  integer(body.droppedSamples, 0, 4294967295, 'droppedSamples');
  if (typeof body.manualAlarm !== 'boolean') throw new HttpError(400, 'manualAlarm inválido.');
  if (!Array.isArray(body.readings) || body.readings.length < 1 || body.readings.length > 8) throw new HttpError(400, 'Envie de 1 a 8 canais.');
  const channels = new Set();
  for (const r of body.readings) {
    requireObject(r); identifier(r.channel, 'Canal');
    integer(r.value, 0, 4095, 'ADC');
    if (!['NORMAL', 'PENDING', 'ALARM', 'WARMUP', 'FAULT'].includes(r.state)) throw new HttpError(400, 'Estado inválido.');
    if (channels.has(r.channel)) throw new HttpError(400, 'Canal repetido.');
    channels.add(r.channel);
  }
  // Canonicalização exclui campos extras e ageMs (a idade aumenta nas retransmissões).
  return { deviceId: body.deviceId, bootId: body.bootId, sequence: body.sequence,
    uptimeMs: body.uptimeMs, configVersion: body.configVersion, droppedSamples: body.droppedSamples,
    manualAlarm: body.manualAlarm, readings: body.readings.map(({ channel, value, state }) => ({ channel, value, state })).sort((a,b) => a.channel.localeCompare(b.channel)) };
}
export function dashboardStatus(row, now = Date.now()) {
  if (!row.observed_at) return 'SEM_DADOS';
  if (now - new Date(row.observed_at).getTime() > 90000) return 'OFFLINE';
  if (row.manual_alarm || row.state === 'ALARM') return 'ALARME';
  if (row.config_version !== row.desired_version) return 'CONFIG_PENDENTE';
  return { NORMAL: 'NORMAL', PENDING: 'CONFIRMANDO', WARMUP: 'AQUECENDO', FAULT: 'FALHA' }[row.state] || 'DESCONHECIDO';
}
