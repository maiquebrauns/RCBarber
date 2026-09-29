const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'rcbarber.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('Conectado ao banco SQLite com sucesso em:', dbPath);
  }
});

// Inicialização das tabelas e dados padrão
function initDatabase() {
  db.serialize(() => {
    // 1. Tabela de Barbeiros
    db.run(`
      CREATE TABLE IF NOT EXISTS barbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        bio TEXT,
        photo_url TEXT,
        working_plan TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabela de Serviços
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL DEFAULT 'SERVIÇOS',
        name TEXT NOT NULL,
        price REAL NOT NULL,
        duration_minutes INTEGER NOT NULL,
        description TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Tabela de Clientes (com telefone como ID / Chave Primária)
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        phone TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Tabela de Agendamentos
    db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        price REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'online_mercadopago',
        payment_status TEXT NOT NULL DEFAULT 'pendente',
        status TEXT NOT NULL DEFAULT 'agendado',
        mp_preference_id TEXT,
        mp_payment_id TEXT,
        mp_payment_link TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id),
        FOREIGN KEY (service_id) REFERENCES services(id)
      )
    `);

    // 4. Tabela Financeira (Entradas e Saídas / Fluxo de Caixa)
    db.run(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'entrada' ou 'saida'
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        description TEXT,
        appointment_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      )
    `);

    // 5. Configurações gerais do sistema
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // SEED: Inserir Renan Carvalho se a tabela barbers estiver vazia
    db.get('SELECT COUNT(*) as count FROM barbers', (err, row) => {
      if (!err && row.count === 0) {
        const renanWorkingPlan = JSON.stringify({
          monday: null, // fechado
          tuesday: { start: '10:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00' }] },
          wednesday: { start: '13:00', end: '18:00', breaks: [] },
          thursday: { start: '10:30', end: '18:00', breaks: [{ start: '13:00', end: '14:00' }] },
          friday: { start: '10:00', end: '20:00', breaks: [{ start: '13:00', end: '15:00' }] },
          saturday: { start: '10:00', end: '18:00', breaks: [] },
          sunday: null // fechado
        });

        const insertBarber = db.prepare(`
          INSERT INTO barbers (name, phone, bio, photo_url, working_plan, active)
          VALUES (?, ?, ?, ?, ?, 1)
        `);

        insertBarber.run(
          'Renan Carvalho',
          '(21) 99108-1977',
          'Barbeiro especialista em cortes modernos, degradê navalhado, barba desenhada e pigmentação.',
          '/assets/images/renan-perfil.jpg',
          renanWorkingPlan
        );
        insertBarber.finalize();
        console.log('Barbeiro Renan Carvalho inserido com sucesso.');
      }
    });

    // SEED: Inserir serviços oficiais se tabela services estiver vazia
    db.get('SELECT COUNT(*) as count FROM services', (err, row) => {
      if (!err && row.count === 0) {
        const initialServices = [
          // SERVIÇOS
          { category: 'SERVIÇOS', name: 'Corte simples', price: 30.00, duration: 20, desc: 'Corte tradicional máquina ou tesoura nas pontas' },
          { category: 'SERVIÇOS', name: 'Corte disfarçado', price: 35.00, duration: 25, desc: 'Fade degradê impecável com acabamento' },
          { category: 'SERVIÇOS', name: 'Corte na tesoura', price: 35.00, duration: 40, desc: 'Corte 100% tesoura com textura e alinhamento' },
          { category: 'SERVIÇOS', name: 'Corte + pigmentação', price: 45.00, duration: 45, desc: 'Corte com realce e pigmentação nos fios/barba' },
          { category: 'SERVIÇOS', name: 'Corte + barba', price: 45.00, duration: 40, desc: 'Combo completo corte estilizado + barba alinhada' },
          { category: 'SERVIÇOS', name: 'Barba simples', price: 15.00, duration: 20, desc: 'Aparada e alinhamento básico de barba' },
          { category: 'SERVIÇOS', name: 'Barba modelada', price: 20.00, duration: 20, desc: 'Barboterapia com toalha quente e desenho na navalha' },
          { category: 'SERVIÇOS', name: 'Barba pigmentada', price: 25.00, duration: 25, desc: 'Barba modelada com aplicação de pigmento para preenchimento' },
          { category: 'SERVIÇOS', name: 'Acabamento', price: 15.00, duration: 10, desc: 'Pezinho, contornos e linhas limpas' },
          { category: 'SERVIÇOS', name: 'Alisamento', price: 15.00, duration: 10, desc: 'Alinhamento térmico ou químico dos fios' },
          { category: 'SERVIÇOS', name: 'Sobrancelha', price: 10.00, duration: 10, desc: 'Design e alinhamento de sobrancelha na navalha' },
          { category: 'SERVIÇOS', name: 'Reflexo + corte', price: 85.00, duration: 60, desc: 'Luzes/reflexo estilizado no topo + corte degradê' },
          { category: 'SERVIÇOS', name: 'Nevou + corte', price: 100.00, duration: 90, desc: 'Platinado completo dos fios com matização e corte' },
          
          // PACOTES MENSAIS
          { category: 'PACOTES MENSAIS', name: 'Pacote Simples', price: 100.00, duration: 30, desc: 'Plano mensal com cortes regulares garantidos' },
          { category: 'PACOTES MENSAIS', name: '4 Cortes disfarçado', price: 100.00, duration: 30, desc: '4 cortes no mês para manter o degradê sempre zerado' },
          { category: 'PACOTES MENSAIS', name: '4 Cortes + Sobrancelha', price: 130.00, duration: 30, desc: '4 cortes no mês com alinhamento de sobrancelhas incluído' },
          { category: 'PACOTES MENSAIS', name: 'Pacote Avançado', price: 130.00, duration: 40, desc: 'Plano mensal completo de cortes e alinhamentos' },
          { category: 'PACOTES MENSAIS', name: '4 Corte + Barba', price: 150.00, duration: 30, desc: '4 cortes com barba completa durante o mês' }
        ];

        const insertService = db.prepare(`
          INSERT INTO services (category, name, price, duration_minutes, description, active)
          VALUES (?, ?, ?, ?, ?, 1)
        `);

        initialServices.forEach(s => {
          insertService.run(s.category, s.name, s.price, s.duration, s.desc);
        });
        insertService.finalize();
        console.log('18 serviços e pacotes oficiais inseridos com sucesso.');
      }
    });

    // SEED: Configurações padrão
    const defaultSettings = [
      { key: 'salon_name', value: 'RC BARBEARIA' },
      { key: 'salon_owner', value: 'Renan Carvalho' },
      { key: 'admin_pin', value: '1234' }, // PIN de acesso ao painel admin
      { key: 'mp_access_token', value: '' }, // Token do Mercado Pago (pode ser configurado no painel)
      { key: 'mp_public_key', value: '' },
      { key: 'mp_sandbox_mode', value: 'sim' }, // 'sim' ou 'nao'
      { key: 'whatsapp_number', value: '5521991081977' },
      { key: 'address', value: 'Rua da Barbearia, Centro' }
    ];

    defaultSettings.forEach(st => {
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [st.key, st.value]);
    });
  });
}

initDatabase();

module.exports = db;
