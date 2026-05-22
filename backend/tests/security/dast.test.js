import { jest } from '@jest/globals';

jest.unstable_mockModule('../../model/alertaModel.js', () => ({
  getAlertas: jest.fn(),
  addAlerta: jest.fn().mockResolvedValue(1),
  listarPorUsuario: jest.fn(),
  listarPorSensor: jest.fn(),
  listarComUltimaLeitura: jest.fn(),
  listarPorData: jest.fn(),
  listarSensoresEmAlerta: jest.fn(),
  getIntervaloMedio: jest.fn(),
  agruparPorAno: jest.fn(),
  alertaPertenceAoUsuario: jest.fn(),
  marcarResolvido: jest.fn(),
  buscarPorPeriodo: jest.fn()
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../../server.js');

describe('SQL Injection', () => {

  test('deve bloquear SQL injection em sensorId', async () => {

    const response = await request(app)
      .post('/api/esp32')
      .set('x-api-key', 'MQFIRE_2026_SENSORX9')
      .send({
        sensorId: "'; DROP TABLE sensores; --",
        valor: 99
      });

    expect(response.status).not.toBe(500);
  });

});