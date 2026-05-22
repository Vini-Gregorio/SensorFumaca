import { jest } from '@jest/globals';

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

jest.unstable_mockModule('../model/usuario.js', () => ({
  default: {
    buscarPorEmail: jest.fn(),
    verificarCredenciais: jest.fn(),
    criar: jest.fn()
  }
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

const usuarioModel =
  await import('../model/usuario.js');

describe('Suíte de Testes - MQ-Fire API', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Limpa os mocks antes de cada teste para evitar poluição [cite: 128]
  });

  test('GET /', async () => {

    const response = await request(app).get('/'); 

    expect(response.statusCode).toBe(302); //redirecionamento para /inicio
    expect(response.headers.location).toBe('/inicio'); //verifica o local do redirecionamento

  });
  
  // Refere-se ao CT-01 e CT-02 [cite: 52, 68]
  describe('POST /api/esp32 - Recepção de Telemetria do ESP32', () => {
    
    it('CT-01: Deve processar alerta vermelho e acionar background', async () => {
      const alertaModel = await import('../model/alertaModel.js');
      // Mock da função que salva o alerta e dispara telegram
      alertaModel.addAlerta.mockResolvedValue(true); 
      

      const payload = { sensor: "esp32_sala_01", valor: 85, nivel: "vermelho" };

      const response = await request(app)
        .post('/api/esp32')
        .set('x-api-key', process.env.ESP32_TOKEN)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.sucesso).toBe(true);
      expect(response.body.mensagem).toContain("Dados recebidos");
      // Verifica se a função background foi chamada corretamente
      expect(alertaModel.addAlerta).toHaveBeenCalledWith("esp32_sala_01", 85, "vermelho");
    });

    it('CT-02: Deve retornar erro por token inválido (Segurança extra)', async () => {
      const payload = { sensor: "esp32_sala_01", valor: 40 };

      const response = await request(app)
        .post('/api/esp32')
        .set('x-api-key', 'token_errado')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.erro).toBe("Token inválido");
    });
  });
  // Refere-se ao CT-03: Duplicidade de sensor
  describe('API Mobile - Cadastro e Validação', () => {
    
    it('CT-03: Deve bloquear cadastro de usuário duplicado via JSON', async () => {
      const usuario = usuarioModel.default;
      usuario.buscarPorEmail.mockResolvedValue({ id: 1, email: 'teste@email.com' });

      const payload = { email: 'teste@email.com', senha: 'senha123' };

      const response = await request(app)
        .post('/usuarios/register')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email já cadastrado');
    });
  });

  // Refere-se ao CT-04: Credenciais inválidas
  describe('POST /usuarios/login - Autenticação', () => {

    it('CT-04: Deve bloquear acesso com credenciais inválidas', async () => {
      usuarioModel.default.verificarCredenciais.mockResolvedValue(null);

      const payload = { email: "teste@email.com", senha: "senha_errada" };

      const response = await request(app)
        .post('/usuarios/login')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Email ou senha inválidos');
    });
  });

  // Refere-se ao CT-05: Interoperabilidade
  describe('GET /api/mobile/sensores - Interoperabilidade Multiplataforma', () => {
    
    it('CT-05: Rota Mobile deve retornar JSON estrito e não redirecionar quando não autenticado', async () => {
      const response = await request(app)
        .get('/api/mobile/sensores')
        .set('Accept', 'application/json');

      expect(response.status).toBe(401);
      expect(response.type).toMatch(/json/);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.error).toBe('Não autorizado');
    });
  });

  describe('GET /api/web/sensores - Interoperabilidade Web', () => {
    it('CT-06: Rota Web deve retornar JSON de erro ao não estar autenticado', async () => {
      const response = await request(app)
        .get('/api/web/sensores')
        .set('Accept', 'application/json');

      expect(response.status).toBe(401);
      expect(response.type).toMatch(/json/);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.error).toBe('Não autorizado');
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