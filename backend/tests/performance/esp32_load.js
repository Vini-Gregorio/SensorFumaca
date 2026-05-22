import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {

  vus: 50,

  duration: '30s',

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  }

};

export default function () {

  const valor =
    Math.floor(Math.random() * 100);

  let nivel = 'verde';

  if (valor > 70) {
    nivel = 'vermelho';
  } else if (valor > 40) {
    nivel = 'amarelo';
  }

  const payload = JSON.stringify({
    sensor: `esp32_${__VU}`,
    valor,
    nivel
  });

  const params = {

    headers: {

      'Content-Type': 'application/json',

      'x-api-key':
        'MQFIRE_2026_SENSORX9'

    },

  };

  const res = http.post(
    'http://localhost:3001/api/esp32',
    payload,
    params
  );

  check(res, {

    'status 200':
      (r) => r.status === 200,

    'latência < 500ms':
      (r) => r.timings.duration < 500,

    'mensagem correta':
      (r) =>
        r.json().mensagem === 'Recebido',

  });

  sleep(1);

}