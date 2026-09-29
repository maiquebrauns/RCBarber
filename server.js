require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public e assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Helper para buscar configuração
function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) resolve(null);
      else resolve(row ? row.value : null);
    });
  });
}

// -------------------------------------------------------------
// 1. ROTAS DE BARBEIROS (GESTÃO DE EQUIPE)
// -------------------------------------------------------------
app.get('/api/barbers', (req, res) => {
  const onlyActive = req.query.all ? '' : 'WHERE active = 1';
  db.all(`SELECT * FROM barbers ${onlyActive} ORDER BY id ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const barbers = rows.map(b => ({
      ...b,
      working_plan: b.working_plan ? JSON.parse(b.working_plan) : null
    }));
    res.json(barbers);
  });
});

app.post('/api/barbers', (req, res) => {
  const { name, phone, bio, photo_url, working_plan } = req.body;
  if (!name) return res.status(400).json({ error: 'O nome do barbeiro é obrigatório' });

  const defaultWorkingPlan = working_plan ? JSON.stringify(working_plan) : JSON.stringify({
    monday: null,
    tuesday: { start: '10:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00' }] },
    wednesday: { start: '10:00', end: '18:00', breaks: [] },
    thursday: { start: '10:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00' }] },
    friday: { start: '10:00', end: '19:00', breaks: [{ start: '13:00', end: '14:00' }] },
    saturday: { start: '09:00', end: '18:00', breaks: [] },
    sunday: null
  });

  const photo = photo_url || '/assets/images/renan-perfil.jpg';

  const stmt = db.prepare(`
    INSERT INTO barbers (name, phone, bio, photo_url, working_plan, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  stmt.run(name, phone || '', bio || '', photo, defaultWorkingPlan, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, message: 'Barbeiro adicionado com sucesso!' });
  });
  stmt.finalize();
});

app.put('/api/barbers/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, bio, photo_url, working_plan, active } = req.body;

  const planStr = typeof working_plan === 'object' ? JSON.stringify(working_plan) : working_plan;

  db.run(`
    UPDATE barbers
    SET name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        bio = COALESCE(?, bio),
        photo_url = COALESCE(?, photo_url),
        working_plan = COALESCE(?, working_plan),
        active = COALESCE(?, active)
    WHERE id = ?
  `, [name, phone, bio, photo_url, planStr, active, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Barbeiro atualizado!' });
  });
});

app.delete('/api/barbers/:id', (req, res) => {
  const { id } = req.params;
  // Desativação lógica
  db.run('UPDATE barbers SET active = 0 WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Barbeiro desativado.' });
  });
});

// -------------------------------------------------------------
// 2. ROTAS DE SERVIÇOS & PACOTES MENSAIS
// -------------------------------------------------------------
app.get('/api/services', (req, res) => {
  db.all('SELECT * FROM services WHERE active = 1 ORDER BY category DESC, price ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/services', (req, res) => {
  const { category, name, price, duration_minutes, description } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });

  const stmt = db.prepare(`
    INSERT INTO services (category, name, price, duration_minutes, description, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  stmt.run(category || 'SERVIÇOS', name, parseFloat(price), parseInt(duration_minutes) || 30, description || '', function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, message: 'Serviço cadastrado com sucesso!' });
  });
  stmt.finalize();
});

// -------------------------------------------------------------
// 3. CÁLCULO DE DISPONIBILIDADE DE HORÁRIOS
// -------------------------------------------------------------
app.get('/api/availability', (req, res) => {
  const { barber_id, date } = req.query;
  if (!barber_id || !date) {
    return res.status(400).json({ error: 'barber_id e date são obrigatórios (ex: ?barber_id=1&date=2026-09-18)' });
  }

  db.get('SELECT * FROM barbers WHERE id = ?', [barber_id], (err, barber) => {
    if (err || !barber) return res.status(404).json({ error: 'Barbeiro não encontrado.' });

    const workingPlan = barber.working_plan ? JSON.parse(barber.working_plan) : null;
    if (!workingPlan) return res.json({ available: false, slots: [], message: 'Horários não configurados.' });

    // Descobrir dia da semana (0: domingo, 1: segunda, ..., 6: sábado)
    const targetDate = new Date(date + 'T12:00:00'); // evita timezone shift
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[targetDate.getDay()];

    const daySchedule = workingPlan[dayName];
    if (!daySchedule || !daySchedule.start || !daySchedule.end) {
      return res.json({ available: false, slots: [], message: 'Barbeiro não atende neste dia da semana.' });
    }

    // Buscar agendamentos já confirmados para esse barbeiro e dia
    db.all(`
      SELECT time, duration_minutes FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.barber_id = ? AND a.date = ? AND a.status != 'cancelado'
    `, [barber_id, date], (err, appointments) => {
      if (err) return res.status(500).json({ error: err.message });

      const bookedTimes = new Set(appointments.map(a => a.time));

      // Gerar slots de 30 em 30 min
      const slots = [];
      const [startHour, startMin] = daySchedule.start.split(':').map(Number);
      const [endHour, endMin] = daySchedule.end.split(':').map(Number);

      let currentMinute = startHour * 60 + startMin;
      const endTotalMinutes = endHour * 60 + endMin;

      while (currentMinute < endTotalMinutes) {
        const h = Math.floor(currentMinute / 60).toString().padStart(2, '0');
        const m = (currentMinute % 60).toString().padStart(2, '0');
        const timeStr = `${h}:${m}`;

        // Checar se cai em algum intervalo (break)
        let inBreak = false;
        if (daySchedule.breaks && Array.isArray(daySchedule.breaks)) {
          for (const b of daySchedule.breaks) {
            const [bsh, bsm] = b.start.split(':').map(Number);
            const [beh, bem] = b.end.split(':').map(Number);
            const bStart = bsh * 60 + bsm;
            const bEnd = beh * 60 + bem;
            if (currentMinute >= bStart && currentMinute < bEnd) {
              inBreak = true;
              break;
            }
          }
        }

        // Checar se já está ocupado
        const isBooked = bookedTimes.has(timeStr);

        if (!inBreak && !isBooked) {
          slots.push(timeStr);
        }

        currentMinute += 30; // intervalos de 30 minutos
      }

      res.json({
        available: slots.length > 0,
        dayName,
        slots
      });
    });
  });
});

// -------------------------------------------------------------
// 4. CRIAÇÃO DE AGENDAMENTO & INTEGRAÇÃO MERCADO PAGO
// -------------------------------------------------------------
app.post('/api/appointments', async (req, res) => {
  const { barber_id, service_id, client_name, client_phone, date, time, payment_method } = req.body;

  if (!barber_id || !service_id || !client_name || !client_phone || !date || !time) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  // Buscar informações do serviço e barbeiro
  db.get('SELECT * FROM services WHERE id = ?', [service_id], async (err, service) => {
    if (err || !service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    db.get('SELECT * FROM barbers WHERE id = ?', [barber_id], async (err, barber) => {
      if (err || !barber) return res.status(404).json({ error: 'Barbeiro não encontrado.' });

      const price = service.price;
      const isOnlinePayment = payment_method === 'online_mercadopago';

      let mpPreferenceId = null;
      let mpPaymentLink = null;

      // Buscar Access Token do Mercado Pago
      const mpAccessToken = await getSetting('mp_access_token');
      const mpSandbox = (await getSetting('mp_sandbox_mode')) === 'sim';

      if (isOnlinePayment) {
        if (mpAccessToken && mpAccessToken.trim() !== '') {
          try {
            const client = new MercadoPagoConfig({
              accessToken: mpAccessToken.trim(),
              options: { timeout: 5000 }
            });

            const preference = new Preference(client);
            const hostUrl = req.protocol + '://' + req.get('host');

            const prefData = await preference.create({
              body: {
                items: [
                  {
                    id: String(service.id),
                    title: `RC BARBEARIA - ${service.name} (${barber.name})`,
                    quantity: 1,
                    unit_price: Number(price),
                    currency_id: 'BRL'
                  }
                ],
                payer: {
                  name: client_name,
                  phone: {
                    number: client_phone.replace(/\D/g, '')
                  }
                },
                back_urls: {
                  success: `${hostUrl}/agendamento-confirmado.html?status=success`,
                  failure: `${hostUrl}/agendamento-confirmado.html?status=failure`,
                  pending: `${hostUrl}/agendamento-confirmado.html?status=pending`
                },
                auto_return: 'approved',
                notification_url: `${hostUrl}/api/webhook/mercadopago`
              }
            });

            mpPreferenceId = prefData.id;
            mpPaymentLink = mpSandbox ? prefData.sandbox_init_point : prefData.init_point;
          } catch (mpError) {
            console.error('Erro ao gerar preferência no Mercado Pago:', mpError.message);
            // Fallback de demonstração com link simulado
            mpPaymentLink = `/pagamento-simulado.html?amount=${price}&service=${encodeURIComponent(service.name)}`;
          }
        } else {
          // Modo Demonstração / Sem token configurado ainda
          mpPaymentLink = `/pagamento-simulado.html?amount=${price}&service=${encodeURIComponent(service.name)}&client=${encodeURIComponent(client_name)}`;
        }
      }

      // Sanitizar telefone para usar como ID único
      const cleanPhone = client_phone.replace(/\D/g, '');

      // Inserir ou atualizar cliente no banco de dados com telefone como ID
      db.run(`
        INSERT INTO clients (phone, name) VALUES (?, ?)
        ON CONFLICT(phone) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
      `, [cleanPhone, client_name]);

      // Inserir agendamento no banco
      const stmt = db.prepare(`
        INSERT INTO appointments (
          barber_id, service_id, client_name, client_phone, date, time, price,
          payment_method, payment_status, status, mp_preference_id, mp_payment_link
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendado', ?, ?)
      `);

      const initialPaymentStatus = isOnlinePayment ? 'pendente' : 'pendente';

      stmt.run(
        barber_id, service_id, client_name, cleanPhone, date, time, price,
        payment_method || 'online_mercadopago', initialPaymentStatus,
        mpPreferenceId, mpPaymentLink,
        function (err) {
          if (err) return res.status(500).json({ error: err.message });

          const appointmentId = this.lastID;

          res.status(201).json({
            id: appointmentId,
            message: 'Agendamento realizado com sucesso!',
            barber_name: barber.name,
            service_name: service.name,
            date,
            time,
            price,
            payment_method,
            payment_link: mpPaymentLink,
            preference_id: mpPreferenceId
          });
        }
      );
      stmt.finalize();
    });
  });
});

// -------------------------------------------------------------
// 4.1. BUSCA DE AGENDAMENTOS POR TELEFONE (MEUS AGENDAMENTOS)
// -------------------------------------------------------------
app.get('/api/clients/:phone/appointments', (req, res) => {
  const rawPhone = req.params.phone || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 8) {
    return res.status(400).json({ error: 'Informe um número de telefone válido com DDD.' });
  }

  // Buscar cliente
  db.get('SELECT * FROM clients WHERE phone = ?', [cleanPhone], (err, clientRow) => {
    // Buscar agendamentos vinculados a este telefone
    const sql = `
      SELECT a.*, b.name as barber_name, s.name as service_name, s.duration_minutes
      FROM appointments a
      JOIN barbers b ON a.barber_id = b.id
      JOIN services s ON a.service_id = s.id
      WHERE a.client_phone = ? OR a.client_phone LIKE ?
      ORDER BY a.date DESC, a.time DESC
    `;

    db.all(sql, [cleanPhone, `%${cleanPhone.slice(-8)}%`], (err, appts) => {
      if (err) return res.status(500).json({ error: err.message });

      const clientName = clientRow ? clientRow.name : (appts.length > 0 ? appts[0].client_name : 'Cliente');

      res.json({
        found: appts.length > 0,
        client: {
          phone: cleanPhone,
          name: clientName
        },
        appointments: appts
      });
    });
  });
});

// Cancelamento pelo próprio cliente
app.post('/api/appointments/:id/cancel-by-client', (req, res) => {
  const { id } = req.params;
  const { phone } = req.body;
  const cleanPhone = (phone || '').replace(/\D/g, '');

  db.get('SELECT * FROM appointments WHERE id = ?', [id], (err, appt) => {
    if (err || !appt) return res.status(404).json({ error: 'Agendamento não encontrado.' });

    // Validar se o telefone coincide
    const apptPhone = (appt.client_phone || '').replace(/\D/g, '');
    if (!apptPhone.includes(cleanPhone.slice(-8))) {
      return res.status(403).json({ error: 'Permissão negada. Telefone não corresponde ao agendamento.' });
    }

    if (appt.status === 'cancelado') {
      return res.status(400).json({ error: 'Este agendamento já está cancelado.' });
    }

    db.run(`UPDATE appointments SET status = 'cancelado' WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Agendamento cancelado com sucesso.' });
    });
  });
});

// -------------------------------------------------------------
// 5. WEBHOOK DO MERCADO PAGO
// -------------------------------------------------------------
app.post('/api/webhook/mercadopago', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment' && data && data.id) {
    const paymentId = data.id;
    const mpAccessToken = await getSetting('mp_access_token');

    if (mpAccessToken) {
      try {
        const client = new MercadoPagoConfig({ accessToken: mpAccessToken.trim() });
        const payment = new Payment(client);
        const paymentInfo = await payment.get({ id: paymentId });

        if (paymentInfo.status === 'approved') {
          // Atualiza agendamento correspondente
          db.get('SELECT * FROM appointments WHERE mp_preference_id = ? OR id = ?', [paymentInfo.order?.id, paymentInfo.external_reference], (err, appt) => {
            if (appt) {
              db.run(`UPDATE appointments SET payment_status = 'pago', mp_payment_id = ? WHERE id = ?`, [paymentId, appt.id]);

              // Registra entrada no financeiro
              db.run(`
                INSERT INTO financial_transactions (type, category, amount, date, description, appointment_id)
                VALUES ('entrada', 'Atendimento Online (Mercado Pago)', ?, ?, ?, ?)
              `, [appt.price, appt.date, `Pagamento Mercado Pago aprovado - ${appt.client_name}`, appt.id]);
            }
          });
        }
      } catch (e) {
        console.error('Erro ao processar Webhook Mercado Pago:', e.message);
      }
    }
  }

  res.status(200).send('OK');
});

// Endpoint para confirmar pagamento simulado / teste
app.post('/api/appointments/:id/confirm-simulation', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM appointments WHERE id = ?', [id], (err, appt) => {
    if (err || !appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    db.run(`UPDATE appointments SET payment_status = 'pago' WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Registrar transação de entrada
      db.run(`
        INSERT INTO financial_transactions (type, category, amount, date, description, appointment_id)
        VALUES ('entrada', 'Atendimento Online (Mercado Pago)', ?, ?, ?, ?)
      `, [appt.price, appt.date, `Pagamento Online Aprovado - ${appt.client_name}`, appt.id]);

      res.json({ success: true, message: 'Pagamento confirmado com sucesso!' });
    });
  });
});

// -------------------------------------------------------------
// 6. DASHBOARD & MÉTRICAS (DIÁRIO, MENSAL, LUCRO)
// -------------------------------------------------------------
app.get('/api/dashboard/summary', (req, res) => {
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];
  const targetMonth = targetDate.substring(0, 7); // YYYY-MM

  // 1. Métricas do DIA
  const dailyQuery = `
    SELECT
      COUNT(CASE WHEN status = 'concluido' THEN 1 END) as attended_clients,
      COUNT(*) as total_appointments,
      SUM(CASE WHEN payment_status = 'pago' THEN price ELSE 0 END) as paid_appointments_amount
    FROM appointments
    WHERE date = ? AND status != 'cancelado'
  `;

  // Transações avulsas do DIA (entradas e saídas)
  const dailyFinanceQuery = `
    SELECT
      SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END) as direct_incomes,
      SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END) as direct_expenses
    FROM financial_transactions
    WHERE date = ?
  `;

  // Métricas do MÊS
  const monthlyFinanceQuery = `
    SELECT
      SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END) as monthly_incomes,
      SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END) as monthly_expenses
    FROM financial_transactions
    WHERE date LIKE ?
  `;

  const monthlyAppointmentsQuery = `
    SELECT
      COUNT(CASE WHEN status = 'concluido' THEN 1 END) as monthly_attended_clients,
      COUNT(*) as monthly_total_appointments
    FROM appointments
    WHERE date LIKE ? AND status != 'cancelado'
  `;

  db.get(dailyQuery, [targetDate], (err, dailyAppts) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(dailyFinanceQuery, [targetDate], (err, dailyFin) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get(monthlyFinanceQuery, [`${targetMonth}%`], (err, monthlyFin) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get(monthlyAppointmentsQuery, [`${targetMonth}%`], (err, monthlyAppts) => {
          if (err) return res.status(500).json({ error: err.message });

          const dailyDirectIncomes = dailyFin.direct_incomes || 0;
          const dailyDirectExpenses = dailyFin.direct_expenses || 0;
          
          // O total de entradas do dia considera transações diretas do caixa
          const dailyTotalIncomes = dailyDirectIncomes;
          const dailyTotalExpenses = dailyDirectExpenses;
          const dailyNetProfit = dailyTotalIncomes - dailyTotalExpenses;

          const monthlyTotalIncomes = monthlyFin.monthly_incomes || 0;
          const monthlyTotalExpenses = monthlyFin.monthly_expenses || 0;
          const monthlyNetProfit = monthlyTotalIncomes - monthlyTotalExpenses;

          res.json({
            date: targetDate,
            month: targetMonth,
            daily: {
              attended_clients: dailyAppts.attended_clients || 0,
              total_appointments: dailyAppts.total_appointments || 0,
              incomes: dailyTotalIncomes,
              expenses: dailyTotalExpenses,
              net_profit: dailyNetProfit
            },
            monthly: {
              attended_clients: monthlyAppts.monthly_attended_clients || 0,
              total_appointments: monthlyAppts.monthly_total_appointments || 0,
              incomes: monthlyTotalIncomes,
              expenses: monthlyTotalExpenses,
              net_profit: monthlyNetProfit
            }
          });
        });
      });
    });
  });
});

// -------------------------------------------------------------
// 7. LISTA E GESTÃO DE AGENDAMENTOS
// -------------------------------------------------------------
app.get('/api/appointments', (req, res) => {
  const { date, barber_id, status } = req.query;
  let sql = `
    SELECT a.*, b.name as barber_name, s.name as service_name, s.category as service_category
    FROM appointments a
    JOIN barbers b ON a.barber_id = b.id
    JOIN services s ON a.service_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    sql += ' AND a.date = ?';
    params.push(date);
  }
  if (barber_id) {
    sql += ' AND a.barber_id = ?';
    params.push(barber_id);
  }
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY a.date DESC, a.time ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Concluir ou alterar status do agendamento
app.patch('/api/appointments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'agendado', 'em_andamento', 'concluido', 'cancelado'

  db.get('SELECT * FROM appointments WHERE id = ?', [id], (err, appt) => {
    if (err || !appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    db.run('UPDATE appointments SET status = ? WHERE id = ?', [status, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Se foi concluído e o pagamento foi no local e está pago, garantir transação no caixa
      if (status === 'concluido' && appt.payment_status === 'pago') {
        db.get('SELECT id FROM financial_transactions WHERE appointment_id = ?', [id], (err, trans) => {
          if (!trans) {
            db.run(`
              INSERT INTO financial_transactions (type, category, amount, date, description, appointment_id)
              VALUES ('entrada', 'Atendimento Barbearia', ?, ?, ?, ?)
            `, [appt.price, appt.date, `Atendimento Concluído - ${appt.client_name}`, id]);
          }
        });
      }

      res.json({ success: true, message: `Status alterado para ${status}` });
    });
  });
});

// Marcar pagamento como recebido (dinheiro, pix ou cartão na hora)
app.patch('/api/appointments/:id/payment', (req, res) => {
  const { id } = req.params;
  const { payment_status, payment_method } = req.body;

  db.get('SELECT * FROM appointments WHERE id = ?', [id], (err, appt) => {
    if (err || !appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const newPaymentStatus = payment_status || 'pago';
    const newMethod = payment_method || appt.payment_method;

    db.run(`
      UPDATE appointments
      SET payment_status = ?, payment_method = ?
      WHERE id = ?
    `, [newPaymentStatus, newMethod, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      if (newPaymentStatus === 'pago') {
        db.get('SELECT id FROM financial_transactions WHERE appointment_id = ?', [id], (err, trans) => {
          if (!trans) {
            db.run(`
              INSERT INTO financial_transactions (type, category, amount, date, description, appointment_id)
              VALUES ('entrada', 'Atendimento Recebido', ?, ?, ?, ?)
            `, [appt.price, appt.date, `Atendimento Pago (${newMethod}) - ${appt.client_name}`, id]);
          }
        });
      }

      res.json({ success: true, message: 'Pagamento atualizado com sucesso!' });
    });
  });
});

// -------------------------------------------------------------
// 8. CONTROLE DE CAIXA: ENTRADAS E SAÍDAS MANUAIS
// -------------------------------------------------------------
app.get('/api/financial/transactions', (req, res) => {
  const { month, date } = req.query;
  let sql = 'SELECT * FROM financial_transactions WHERE 1=1';
  const params = [];

  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  } else if (month) {
    sql += ' AND date LIKE ?';
    params.push(`${month}%`);
  }

  sql += ' ORDER BY date DESC, id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/financial/transactions', (req, res) => {
  const { type, category, amount, date, description } = req.body;
  if (!type || !amount || !date) {
    return res.status(400).json({ error: 'Tipo (entrada/saida), valor e data são obrigatórios.' });
  }

  const stmt = db.prepare(`
    INSERT INTO financial_transactions (type, category, amount, date, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(type, category || (type === 'saida' ? 'Despesa Geral' : 'Receita'), parseFloat(amount), date, description || '', function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, message: 'Transação cadastrada com sucesso!' });
  });
  stmt.finalize();
});

app.delete('/api/financial/transactions/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM financial_transactions WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Transação excluída.' });
  });
});

// -------------------------------------------------------------
// 9. CONFIGURAÇÕES & CREDENCIAIS (MERCADO PAGO, WHATSAPP, PIN)
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settingsMap = {};
    rows.forEach(r => {
      // Mascarar parte do token do Mercado Pago se existir
      if (r.key === 'mp_access_token' && r.value) {
        settingsMap[r.key] = r.value.length > 8 
          ? r.value.substring(0, 4) + '...' + r.value.substring(r.value.length - 4) 
          : '••••••••';
      } else {
        settingsMap[r.key] = r.value;
      }
    });
    res.json(settingsMap);
  });
});

app.post('/api/settings', (req, res) => {
  const updates = req.body; // { key: value, ... }
  const keys = Object.keys(updates);

  if (keys.length === 0) return res.status(400).json({ error: 'Nenhuma configuração enviada.' });

  db.serialize(() => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    keys.forEach(key => {
      // Se não for mascara, atualiza
      if (!updates[key].includes('••••')) {
        stmt.run(key, updates[key]);
      }
    });
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Configurações salvas com sucesso!' });
    });
  });
});

// Iniciar servidor em 0.0.0.0 para acesso via rede local / celular
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const localIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIps.push({ name, address: net.address });
      }
    }
  }

  // Priorizar IP de rede Wi-Fi / Ethernet residencial (192.168.x.x ou 10.x.x.x)
  const wifiOrLan = localIps.find(i => i.address.startsWith('192.168.') || i.address.startsWith('10.')) || localIps[0];
  const mobileIp = wifiOrLan ? wifiOrLan.address : 'localhost';

  console.log(`=========================================`);
  console.log(`💈 RC Barbearia - Sistema Ativo na Rede!`);
  console.log(`💻 No Computador:    http://localhost:${PORT}`);
  console.log(`📱 NO CELULAR:       http://${mobileIp}:${PORT}`);
  console.log(`📊 Painel Admin:     http://${mobileIp}:${PORT}/admin.html`);
  console.log(`=========================================`);
});
