import { jest } from '@jest/globals';

jest.unstable_mockModule('../auth.js', () => ({
  autenticar: (req, res, next) => {
    req.session = {
      usuario: { id: 1, email: 'teste@teste.com' },
      cookie: {},
      save: jest.fn((cb) => cb && cb()),
      touch: jest.fn()
    };
    next();
  }
}));

jest.unstable_mockModule('../model/alertaModel.js', () => ({
  addAlerta: jest.fn(),
  getAlertas: jest.fn(),
  listarComUltimaLeitura: jest.fn(),
  listarPorSensor: jest.fn(),
  listarPorUsuario: jest.fn()
}));

jest.unstable_mockModule('../model/sensor.js', () => ({
  default: {
    buscarPorIdentificador: jest.fn(),
    criar: jest.fn()
  }
}));

jest.unstable_mockModule('../config/db.js', () => ({
  default: {
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../server.js');
const alertaModel = await import('../model/alertaModel.js');
const sensorModel = await import('../model/sensor.js');

describe('APIs Mobile e Web com autenticação simulada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/mobile/sensores deve retornar lista de sensores', async () => {
    alertaModel.listarComUltimaLeitura.mockResolvedValue([
      { id: 1, nomeSala: 'Sala 1', identificador: 'sensor1', ultima_leitura: 70, nivel: 'alto' }
    ]);

    const response = await request(app).get('/api/mobile/sensores');

    expect(response.status).toBe(200);
    expect(response.body.sucesso).toBe(true);
    expect(response.body.total).toBe(1);
    expect(response.body.dados[0].identificador).toBe('sensor1');
  });

  it('GET /api/web/sensores/:id deve retornar 404 quando sensor não existir', async () => {
    sensorModel.default.buscarPorIdentificador.mockResolvedValue(null);

    const response = await request(app).get('/api/web/sensores/sensor-inexistente');

    expect(response.status).toBe(404);
    expect(response.body.sucesso).toBe(false);
    expect(response.body.erro).toBe('Sensor não encontrado');
  });

  it('GET /api/web/sensores/:id deve retornar detalhe e histórico quando existir', async () => {
    sensorModel.default.buscarPorIdentificador.mockResolvedValue({ identificador: 'sensor1', nomeSala: 'Sala 1' });
    alertaModel.listarPorSensor.mockResolvedValue([
      { valor: 80, nivel: 'alto', data_hora: '2026-01-01 12:00:00' }
    ]);

    const response = await request(app).get('/api/web/sensores/sensor1');

    expect(response.status).toBe(200);
    expect(response.body.sucesso).toBe(true);
    expect(response.body.dados.identificador).toBe('sensor1');
    expect(response.body.historico).toHaveLength(1);
    expect(response.body.dados.valor).toBe(80);
  });
});
