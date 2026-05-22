import { jest } from '@jest/globals';

jest.unstable_mockModule('../model/usuario.js', () => ({
  default: {
    buscarPorEmail: jest.fn(),
    verificarCredenciais: jest.fn(),
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
const usuarioModel = await import('../model/usuario.js');

describe('Autenticação e cadastro de usuários', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Deve bloquear cadastro de usuário duplicado via JSON', async () => {
    usuarioModel.default.buscarPorEmail.mockResolvedValue({ id: 1, email: 'teste@email.com' });

    const payload = { email: 'teste@email.com', senha: 'senha123' };

    const response = await request(app)
      .post('/usuarios/register')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email já cadastrado');
  });

  it('Deve cadastrar novo usuário e retornar JSON de sucesso', async () => {
    usuarioModel.default.buscarPorEmail.mockResolvedValue(null);
    usuarioModel.default.criar.mockResolvedValue({ id: 5, email: 'novo@email.com' });

    const payload = { email: 'novo@email.com', senha: 'senha123' };

    const response = await request(app)
      .post('/usuarios/register')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('novo@email.com');
    expect(response.body.id).toBe(5);
    expect(usuarioModel.default.criar).toHaveBeenCalledWith('novo@email.com', 'senha123', undefined);
  });

  it('Deve bloquear login com credenciais inválidas', async () => {
    usuarioModel.default.verificarCredenciais.mockResolvedValue(null);

    const payload = { email: 'teste@email.com', senha: 'senha_errada' };

    const response = await request(app)
      .post('/usuarios/login')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Email ou senha inválidos');
  });

  it('Deve autenticar usuário com credenciais válidas', async () => {
    usuarioModel.default.verificarCredenciais.mockResolvedValue({ id: 7, email: 'user@email.com' });

    const payload = { email: 'user@email.com', senha: 'senha123' };

    const response = await request(app)
      .post('/usuarios/login')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('user@email.com');
    expect(response.body.id).toBe(7);
    expect(usuarioModel.default.verificarCredenciais).toHaveBeenCalledWith('user@email.com', 'senha123');
  });
});
