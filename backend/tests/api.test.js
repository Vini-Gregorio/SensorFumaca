import { jest } from '@jest/globals';

jest.unstable_mockModule('../model/alertaModel.js', () => ({
  addAlerta: jest.fn(),
  getAlertas: jest.fn()
}));

jest.unstable_mockModule('../model/sensor.js', () => ({
  default: {}
}));

// MOCK DB
jest.unstable_mockModule('../config/db.js', () => ({
  default: {
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const request = (await import('supertest')).default;

const { default: app } =
  await import('../server.js');

const alertaModel =
  await import('../model/alertaModel.js');

describe('Suíte de Testes - MQ-Fire API', () => {

   test('GET /', async () => {

    const response = await request(app).get('/'); 

    expect(response.statusCode).toBe(302); //redirecionamento para /inicio
    expect(response.headers.location).toBe('/inicio'); //verifica o local do redirecionamento

  });

  beforeEach(() => {
    jest.clearAllMocks(); // Limpa os mocks antes de cada teste para evitar poluição [cite: 128]
  });

  // Refere-se ao CT-01 e CT-02 [cite: 52, 68]
  describe('POST /dados - Recepção de Telemetria do ESP32', () => {
    
    it('CT-01: Deve processar alerta vermelho e acionar background', async () => {
      const alertaModel = await import('../model/alertaModel.js');
      // Mock da função que salva o alerta e dispara telegram
      alertaModel.addAlerta.mockResolvedValue(true); 
      

      const payload = { sensor: "esp32_sala_01", valor: 85, nivel: "vermelho" };

      const response = await request(app)
        .post('/dados')
        .set('x-api-key', process.env.ESP32_TOKEN) // Requisito do seu server.js
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.mensagem).toBe("Recebido");
      // Verifica se a função background foi chamada corretamente
      expect(alertaModel.addAlerta).toHaveBeenCalledWith("esp32_sala_01", 85, "vermelho");
    });

    it('CT-02: Deve retornar erro por token inválido (Segurança extra)', async () => {
      const payload = { sensor: "esp32_sala_01", valor: 40 };

      const response = await request(app)
        .post('/dados')
        .set('x-api-key', 'token_errado')
        .send(payload);

      expect(response.status).toBe(401); // 401 Unauthorized do seu server.js
      expect(response.body.erro).toBe("Token inválido");
    });
  });

  /* Refere-se ao CT-05 [cite: 104] - Interoperabilidade Multiplataforma (App Mobile)
  describe('POST /cadastro - Interoperabilidade Multiplataforma', () => {
    
    it('CT-05: Deve retornar JSON para o App Mobile sem redirecionar', async () => {
      const payload = { email: "novoapp@email.com", senha: "minhasenha" };

      const response = await request(app)
        .post('/cadastro')
        .set('Content-Type', 'application/json')
        .send(payload);

      // Assumindo que seu userController retorna 201 ou 200 com JSON se req.is('json') for true
      expect(response.type).toMatch(/json/); 
      // Se houvesse redirecionamento, o status seria 302.
      expect(response.status).not.toBe(302); 
    });
  }); 
  */

});