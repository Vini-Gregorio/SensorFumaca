import { jest } from '@jest/globals';

jest.unstable_mockModule('../model/alertaModel.js', () => ({
  addAlerta: jest.fn(),
  getAlertas: jest.fn(),
  listarComUltimaLeitura: jest.fn(),
  listarPorSensor: jest.fn(),
  listarPorUsuario: jest.fn()
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

describe('API ESP32', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Deve retornar 401 quando o token do ESP32 for inválido', async () => {
    const payload = { sensor: 'esp32_sala_01', valor: 40 };

    const response = await request(app)
      .post('/api/esp32')
      .set('x-api-key', 'token_errado')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body.sucesso).toBe(false);
    expect(response.body.erro).toBe('Token inválido');
    expect(alertaModel.addAlerta).not.toHaveBeenCalled();
  });

  it('Deve processar leitura normal sem gerar alerta', async () => {
    const payload = { sensor: 'esp32_sala_01', valor: 20, nivel: 'normal' };

    const response = await request(app)
      .post('/api/esp32')
      .set('x-api-key', process.env.ESP32_TOKEN)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.sucesso).toBe(true);
    expect(response.body.mensagem).toContain('Leitura normal');
    expect(alertaModel.addAlerta).not.toHaveBeenCalled();
  });

  it('Deve processar alerta e acionar addAlerta no modelo', async () => {
    alertaModel.addAlerta.mockResolvedValue(123);

    const payload = { sensor: 'esp32_sala_01', valor: 85, nivel: 'vermelho' };

    const response = await request(app)
      .post('/api/esp32')
      .set('x-api-key', process.env.ESP32_TOKEN)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.sucesso).toBe(true);
    expect(response.body.mensagem).toContain('Dados recebidos');
    expect(alertaModel.addAlerta).toHaveBeenCalledWith('esp32_sala_01', 85, 'vermelho');
  });
});
