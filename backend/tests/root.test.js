import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/db.js', () => ({
  default: {
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../server.js');

describe('Root e páginas públicas', () => {
  test('GET / deve redirecionar para /inicio', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/inicio');
  });

  test('POST /logout deve redirecionar para /entrar', async () => {
    const response = await request(app).post('/logout');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/entrar');
  });
});
