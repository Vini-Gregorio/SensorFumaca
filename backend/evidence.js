import { hash, HttpError } from "./domain.js";

// Pacote privado de evidências: dados, unidades, configuração e proveniência juntos.
// Não contém conta, email, chat ID, credenciais, nome de sala ou nome de pessoa.
export function buildEvidence(deviceId, window, rows, revisions) {
  if (rows.length > 10000)
    throw new HttpError(
      413,
      "Mais de 10.000 leituras. Exporte um intervalo menor; nenhum dado foi truncado.",
    );
  const versions = new Set(rows.map((r) => r.config_version));
  const configurations = revisions.filter((r) => versions.has(r.version));
  const payload = {
    schemaVersion: "mqfire-evidence/1",
    deviceId,
    generatedAt: new Date().toISOString(),
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      boundary: "[from,to)",
    },
    rowCount: rows.length,
    units: { value: "adc_raw", uptime_ms: "ms" },
    timeBasis:
      "observed_at estimado no servidor a partir da idade; não é medida independente de latência",
    missingConfigVersions: [...versions].filter(
      (v) => !configurations.some((c) => c.version === v),
    ),
    configurations: configurations.map(({ version, snapshot, reason }) => ({
      version,
      snapshot,
      reason,
    })),
    readings: rows,
    limitations: [
      "Estados são declarados pelo firmware, não rótulos de verdade de campo.",
      "Pseudonimize deviceId/canais antes de compartilhar dados de um local.",
      "Sem PPM ou alegação de precisão; completar protocolo e rótulos do ensaio.",
    ],
  };
  return {
    payload,
    sha256: hash(JSON.stringify(payload)),
    hashEncoding:
      "SHA-256 de JSON.stringify(payload), UTF-8; sem assinatura digital",
  };
}
