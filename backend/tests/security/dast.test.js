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