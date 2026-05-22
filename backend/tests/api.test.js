import { jest } from '@jest/globals';

jest.unstable_mockModule('../model/alertaModel.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../model/sensor.js', () => ({
  default: {}
}));
import request from 'supertest';
import app from '../server.js'; // Exporte o app no final do seu server.js: export default app;
import * as alertaModel from '../model/alertaModel.js';
import sensorModel from '../model/sensor.js';


describe('Suíte de Testes - MQ-Fire API', () => {

   test('GET /', async () => {

    const response = await request(app).get('/'); 

    expect(response.statusCode).toBe(200);

  });

  beforeEach(() => {
    jest.clearAllMocks(); // Limpa os mocks antes de cada teste para evitar poluição [cite: 128]
  });

  // Refere-se ao CT-01 e CT-02 [cite: 52, 68]
  describe('POST /dados - Recepção de Telemetria do ESP32', () => {
    
    it('CT-01: Deve processar alerta vermelho e acionar background', async () => {
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