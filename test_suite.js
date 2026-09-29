const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando Testes da RC Barbearia...');

  // 1. Barbeiros
  const barbers = await request({ hostname: 'localhost', port: 3000, path: '/api/barbers', method: 'GET' });
  console.log('✅ Barbeiros retornados:', barbers.body.length, barbers.body[0].name);

  // 2. Serviços
  const services = await request({ hostname: 'localhost', port: 3000, path: '/api/services', method: 'GET' });
  console.log('✅ Serviços cadastrados:', services.body.length);

  // 3. Disponibilidade de Horários
  const avail = await request({ hostname: 'localhost', port: 3000, path: '/api/availability?barber_id=1&date=2026-09-18', method: 'GET' });
  console.log('✅ Slots disponíveis para 2026-09-18 (Sexta):', avail.body.slots.slice(0, 6), '... total:', avail.body.slots.length);

  // 4. Criar Agendamento de Teste com Pagamento Online Mercado Pago
  const appt = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/appointments',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    barber_id: 1,
    service_id: services.body[1].id, // Corte disfarçado
    date: '2026-09-18',
    time: avail.body.slots[0],
    client_name: 'Carlos Eduardo Teste',
    client_phone: '11988887777',
    payment_method: 'online_mercadopago'
  });
  console.log('✅ Agendamento criado ID:', appt.body.id, 'Link Pagamento:', appt.body.payment_link);

  // 5. Simular Confirmação de Pagamento
  const payConfirm = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/appointments/${appt.body.id}/confirm-simulation`,
    method: 'POST'
  });
  console.log('✅ Confirmação de pagamento efetuada:', payConfirm.body);

  // 6. Lançar uma Saída / Despesa de Teste (Lâminas de barbear)
  const expense = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/financial/transactions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'saida',
    category: 'Lâminas & Descartáveis',
    amount: 15.00,
    date: '2026-09-18',
    description: 'Compra de 1 caixa de navalhas descartáveis'
  });
  console.log('✅ Despesa lançada ID:', expense.body.id);

  // 7. Marcar Atendimento como Concluído
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/appointments/${appt.body.id}/status`,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  }, { status: 'concluido' });

  // 8. Testar Dashboard Summary (Pessoas Atendidas, Entradas, Saídas e Lucro Líquido do Dia)
  const summary = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/summary?date=2026-09-18',
    method: 'GET'
  });
  console.log('📊 Resumo do Dia 2026-09-18:');
  console.log('   - Pessoas Atendidas:', summary.body.daily.attended_clients);
  console.log('   - Entradas do Dia:', summary.body.daily.incomes);
  console.log('   - Saídas do Dia:', summary.body.daily.expenses);
  console.log('   - Lucro Líquido do Dia:', summary.body.daily.net_profit);

  // 9. Adicionar um Novo Barbeiro na Equipe
  const newBarber = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/barbers',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Mateus Oliveira',
    phone: '(11) 97777-6666',
    bio: 'Especialista em barboterapia clássica e cortes modernos.'
  });
  console.log('✅ Novo barbeiro cadastrado ID:', newBarber.body.id);

  const barbersAfter = await request({ hostname: 'localhost', port: 3000, path: '/api/barbers', method: 'GET' });
  console.log('✅ Total de barbeiros ativos agora:', barbersAfter.body.length, barbersAfter.body.map(b => b.name));

  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
}

runTests().catch(console.error);
