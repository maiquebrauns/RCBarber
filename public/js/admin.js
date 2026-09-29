// BLOQUEIO COMPLETO DE ZOOM POR PINÇA (PINCH-TO-ZOOM) E TOQUE DUPLO NO MOBILE
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

// ESTADO DO ADMIN
let currentAdminDate = new Date().toISOString().split('T')[0];
let appSettings = {};

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa filtro com a data de hoje
  const dateInput = document.getElementById('adminDateFilter');
  if (dateInput) {
    dateInput.value = currentAdminDate;
  }

  const txDateInput = document.getElementById('txDate');
  if (txDateInput) {
    txDateInput.value = currentAdminDate;
  }

  // Verificar sessão prévia
  if (sessionStorage.getItem('rcbarber_admin_logged') === 'true') {
    document.getElementById('loginModal').style.display = 'none';
    initAdminData();
  }
});

// 1. LOGIN POR PIN
async function handlePinLogin(event) {
  event.preventDefault();
  const enteredPin = document.getElementById('inputPin').value;

  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    const correctPin = settings.admin_pin || '1234';

    if (enteredPin === correctPin) {
      sessionStorage.setItem('rcbarber_admin_logged', 'true');
      document.getElementById('loginModal').style.display = 'none';
      initAdminData();
    } else {
      alert('PIN incorreto! Tente novamente.');
      document.getElementById('inputPin').value = '';
    }
  } catch (err) {
    if (enteredPin === '1234') {
      sessionStorage.setItem('rcbarber_admin_logged', 'true');
      document.getElementById('loginModal').style.display = 'none';
      initAdminData();
    } else {
      alert('PIN incorreto!');
    }
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('rcbarber_admin_logged');
  window.location.reload();
}

function initAdminData() {
  refreshDashboard();
  loadAdminBarbers();
  loadFinancialTransactions();
  loadAdminSettings();
}

// 2. NAVEGAÇÃO ENTRE ABAS
function switchTab(tabId, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  if (btnElement) btnElement.classList.add('active');

  if (tabId === 'tab-dashboard') refreshDashboard();
  if (tabId === 'tab-barbers') loadAdminBarbers();
  if (tabId === 'tab-finance') loadFinancialTransactions();
  if (tabId === 'tab-settings') loadAdminSettings();
}

// 3. RECARREGAR DASHBOARD E MÉTRICAS DO DIA/MÊS
async function refreshDashboard() {
  const dateInput = document.getElementById('adminDateFilter');
  if (dateInput && dateInput.value) {
    currentAdminDate = dateInput.value;
  }

  try {
    // 1. Carregar Resumo (Summary)
    const resSummary = await fetch(`/api/dashboard/summary?date=${currentAdminDate}`);
    const summary = await resSummary.json();

    // Atualizar Cards Diários
    document.getElementById('cardDailyAttended').textContent = summary.daily.attended_clients;
    document.getElementById('cardDailyTotalAppts').textContent = `Total de ${summary.daily.total_appointments} agendados para hoje`;
    document.getElementById('cardDailyIncomes').textContent = formatCurrency(summary.daily.incomes);
    document.getElementById('cardDailyExpenses').textContent = formatCurrency(summary.daily.expenses);
    
    const dailyProfitEl = document.getElementById('cardDailyNetProfit');
    dailyProfitEl.textContent = formatCurrency(summary.daily.net_profit);
    if (summary.daily.net_profit < 0) {
      dailyProfitEl.style.color = 'var(--danger)';
    } else {
      dailyProfitEl.style.color = 'var(--success)';
    }

    // Atualizar Cards Mensais
    document.getElementById('cardMonthlyAttended').textContent = summary.monthly.attended_clients;
    document.getElementById('cardMonthlyIncomes').textContent = formatCurrency(summary.monthly.incomes);
    document.getElementById('cardMonthlyExpenses').textContent = formatCurrency(summary.monthly.expenses);
    
    const monthlyProfitEl = document.getElementById('cardMonthlyNetProfit');
    monthlyProfitEl.textContent = formatCurrency(summary.monthly.net_profit);
    if (summary.monthly.net_profit < 0) {
      monthlyProfitEl.style.color = 'var(--danger)';
    } else {
      monthlyProfitEl.style.color = 'var(--success)';
    }

    // 2. Carregar Tabela de Agendamentos do Dia
    loadAppointmentsTable(currentAdminDate);

  } catch (err) {
    console.error('Erro ao recarregar dashboard:', err);
  }
}

// 4. CARREGAR AGENDAMENTOS DO DIA
async function loadAppointmentsTable(date) {
  const tbody = document.getElementById('appointmentsTableBody');
  const mobileList = document.getElementById('appointmentsMobileList');
  try {
    const res = await fetch(`/api/appointments?date=${date}`);
    const appointments = await res.json();

    if (appointments.length === 0) {
      const emptyMsg = `Nenhum agendamento encontrado para esta data (${date}).`;
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-dim); padding: 2rem;">
            ${emptyMsg}
          </td>
        </tr>
      `;
      if (mobileList) {
        mobileList.innerHTML = `
          <div style="text-align: center; color: var(--text-dim); padding: 2rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px;">
            <i class="fa-regular fa-calendar-xmark" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.6;"></i>
            ${emptyMsg}
          </div>
        `;
      }
      return;
    }

    // Renderizar Tabela Desktop
    tbody.innerHTML = appointments.map(a => {
      // Badges de Pagamento
      let payBadge = `<span class="badge badge-warning">Pendente</span>`;
      if (a.payment_status === 'pago') {
        const method = a.payment_method || '';
        if (method.includes('pix')) {
          payBadge = `<span class="badge" style="background:rgba(0,180,216,0.15); color:#00b4d8; border:1px solid rgba(0,180,216,0.3);"><i class="fa-brands fa-pix"></i> PAGO (PIX)</span>`;
        } else if (method.includes('cartao')) {
          payBadge = `<span class="badge" style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3);"><i class="fa-solid fa-credit-card"></i> PAGO (CARTÃO)</span>`;
        } else if (method.includes('dinheiro')) {
          payBadge = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-money-bill-wave"></i> PAGO (DINHEIRO)</span>`;
        } else if (method.includes('mercadopago')) {
          payBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> PAGO (ONLINE MP)</span>`;
        } else {
          payBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> PAGO</span>`;
        }
      }

      let statusBadge = `<span class="badge badge-info">${a.status}</span>`;
      if (a.status === 'concluido') {
        statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> Atendido</span>`;
      } else if (a.status === 'cancelado') {
        statusBadge = `<span class="badge badge-danger">Cancelado</span>`;
      } else if (a.status === 'em_andamento') {
        statusBadge = `<span class="badge badge-warning">Em Corte</span>`;
      }

      const cleanPhone = (a.client_phone || '').replace(/\D/g, '');
      const whatsLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=Olá%20${encodeURIComponent(a.client_name)},%20confirmamos%20seu%20horário%20na%20RC%20Barbearia!` : '#';

      return `
        <tr>
          <td><strong style="font-size: 1.05rem; color: var(--primary-gold);">${a.time}h</strong></td>
          <td><strong>${a.client_name}</strong></td>
          <td>
            ${cleanPhone ? `
              <a href="${whatsLink}" target="_blank" style="color: #25d366; text-decoration: none;">
                <i class="fa-brands fa-whatsapp"></i> ${a.client_phone}
              </a>
            ` : '-'}
          </td>
          <td>${a.barber_name}</td>
          <td>${a.service_name}</td>
          <td><strong>${formatCurrency(a.price)}</strong></td>
          <td>${payBadge}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right; white-space: nowrap;">
            ${a.payment_status !== 'pago' ? `
              <button class="quick-action-btn btn-action-pix" onclick="markAsPaidDirect(${a.id}, 'pix')" title="Confirmar pagamento via PIX">
                <i class="fa-brands fa-pix"></i> PIX
              </button>
              <button class="quick-action-btn btn-action-card" onclick="markAsPaidDirect(${a.id}, 'cartao')" title="Confirmar pagamento no Cartão">
                <i class="fa-solid fa-credit-card"></i> Cartão
              </button>
              <button class="quick-action-btn btn-action-money" onclick="markAsPaidDirect(${a.id}, 'dinheiro')" title="Confirmar pagamento em Dinheiro">
                <i class="fa-solid fa-money-bill-wave"></i>
              </button>
            ` : ''}

            ${a.status !== 'concluido' && a.status !== 'cancelado' ? `
              <button class="quick-action-btn btn-action-done" onclick="markAsDone(${a.id})" title="Finalizar Atendimento">
                <i class="fa-solid fa-check"></i> Concluir
              </button>
            ` : ''}

            ${a.status !== 'cancelado' ? `
              <button class="quick-action-btn btn-action-cancel" onclick="cancelAppointment(${a.id})" title="Cancelar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Renderizar Cards Mobile (100% Enquadrado sem scroll lateral)
    if (mobileList) {
      mobileList.innerHTML = appointments.map(a => {
        let payBadge = `<span class="badge badge-warning">Pendente</span>`;
        if (a.payment_status === 'pago') {
          const method = a.payment_method || '';
          if (method.includes('pix')) {
            payBadge = `<span class="badge" style="background:rgba(0,180,216,0.15); color:#00b4d8; border:1px solid rgba(0,180,216,0.3);"><i class="fa-brands fa-pix"></i> PAGO (PIX)</span>`;
          } else if (method.includes('cartao')) {
            payBadge = `<span class="badge" style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3);"><i class="fa-solid fa-credit-card"></i> PAGO (CARTÃO)</span>`;
          } else if (method.includes('dinheiro')) {
            payBadge = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-money-bill-wave"></i> PAGO (DINHEIRO)</span>`;
          } else if (method.includes('mercadopago')) {
            payBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> PAGO (ONLINE)</span>`;
          } else {
            payBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> PAGO</span>`;
          }
        }

        let statusBadge = `<span class="badge badge-info">${a.status}</span>`;
        let cardExtraClass = '';
        if (a.status === 'concluido') {
          statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> Atendido</span>`;
          cardExtraClass = 'is-completed';
        } else if (a.status === 'cancelado') {
          statusBadge = `<span class="badge badge-danger">Cancelado</span>`;
          cardExtraClass = 'is-canceled';
        } else if (a.status === 'em_andamento') {
          statusBadge = `<span class="badge badge-warning">Em Corte</span>`;
        }

        const cleanPhone = (a.client_phone || '').replace(/\D/g, '');
        const whatsLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=Olá%20${encodeURIComponent(a.client_name)},%20confirmamos%20seu%20horário%20na%20RC%20Barbearia!` : '#';

        return `
          <div class="admin-mobile-card ${cardExtraClass}">
            <div class="mobile-card-header">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="mobile-time-badge">${a.time}h</span>
                <strong style="font-size: 1rem; color: var(--text-main);">${a.client_name}</strong>
              </div>
              <div>${statusBadge}</div>
            </div>

            <div class="mobile-card-body">
              <div class="mobile-card-row">
                <span class="mobile-row-label"><i class="fa-solid fa-scissors" style="color: var(--primary-gold);"></i> Serviço:</span>
                <span class="mobile-row-val"><strong>${a.service_name}</strong> • <span style="color: var(--primary-gold); font-weight: 800;">${formatCurrency(a.price)}</span></span>
              </div>

              <div class="mobile-card-row">
                <span class="mobile-row-label"><i class="fa-solid fa-user-tie"></i> Barbeiro:</span>
                <span class="mobile-row-val">${a.barber_name}</span>
              </div>

              ${cleanPhone ? `
                <div class="mobile-card-row">
                  <span class="mobile-row-label"><i class="fa-brands fa-whatsapp" style="color: #25d366;"></i> WhatsApp:</span>
                  <a href="${whatsLink}" target="_blank" class="mobile-whats-link">
                    <i class="fa-brands fa-whatsapp"></i> ${a.client_phone}
                  </a>
                </div>
              ` : ''}

              <div class="mobile-card-row">
                <span class="mobile-row-label"><i class="fa-solid fa-credit-card"></i> Pagamento:</span>
                <span>${payBadge}</span>
              </div>
            </div>

            <div class="mobile-card-actions">
              ${a.payment_status !== 'pago' ? `
                <div class="mobile-pay-btns">
                  <button class="quick-action-btn btn-action-pix" onclick="markAsPaidDirect(${a.id}, 'pix')">
                    <i class="fa-brands fa-pix"></i> PIX
                  </button>
                  <button class="quick-action-btn btn-action-card" onclick="markAsPaidDirect(${a.id}, 'cartao')">
                    <i class="fa-solid fa-credit-card"></i> Cartão
                  </button>
                  <button class="quick-action-btn btn-action-money" onclick="markAsPaidDirect(${a.id}, 'dinheiro')">
                    <i class="fa-solid fa-money-bill-wave"></i> Dinheiro
                  </button>
                </div>
              ` : ''}

              <div class="mobile-status-btns">
                ${a.status !== 'concluido' && a.status !== 'cancelado' ? `
                  <button class="btn btn-gold btn-sm" onclick="markAsDone(${a.id})" style="flex: 1; padding: 0.55rem; font-weight: 700;">
                    <i class="fa-solid fa-check"></i> Concluir Atendimento
                  </button>
                ` : ''}

                ${a.status !== 'cancelado' ? `
                  <button class="btn btn-secondary btn-sm" onclick="cancelAppointment(${a.id})" title="Cancelar" style="padding: 0.55rem 0.8rem;">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Erro ao buscar agendamentos:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Erro ao carregar lista.</td></tr>`;
    if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 1.5rem;">Erro ao carregar lista.</div>`;
  }
}

// Ações no Atendimento
async function markAsDone(id) {
  try {
    await fetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'concluido' })
    });
    refreshDashboard();
  } catch (e) {
    alert('Erro ao atualizar: ' + e.message);
  }
}

// MARCAÇÃO DIRETA DE PAGAMENTO (1 CLIQUE: PIX, CARTÃO OU DINHEIRO)
async function markAsPaidDirect(id, method) {
  try {
    const res = await fetch(`/api/appointments/${id}/payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        payment_status: 'pago', 
        payment_method: `local_${method}` 
      })
    });
    
    if (res.ok) {
      refreshDashboard();
    } else {
      const err = await res.json();
      alert('Erro: ' + err.error);
    }
  } catch (e) {
    alert('Erro ao atualizar pagamento: ' + e.message);
  }
}

async function cancelAppointment(id) {
  if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
  try {
    await fetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelado' })
    });
    refreshDashboard();
  } catch (e) {
    alert('Erro ao cancelar: ' + e.message);
  }
}

// 5. GESTÃO DE BARBEIROS (EQUIPE)
async function loadAdminBarbers() {
  const container = document.getElementById('adminBarbersGrid');
  try {
    const res = await fetch('/api/barbers?all=1');
    const barbers = await res.json();

    container.innerHTML = barbers.map(b => `
      <div class="barber-card" style="opacity: ${b.active ? '1' : '0.5'};">
        <div class="barber-img-wrap">
          <img src="${b.photo_url || '/assets/images/renan-perfil.jpg'}" alt="${b.name}" class="barber-img" onerror="this.src='/assets/images/renan-perfil.jpg'">
          ${!b.active ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; font-weight:bold; color:#ef4444;">INATIVO</div>' : ''}
        </div>
        <div class="barber-info">
          <h3 class="barber-name">${b.name}</h3>
          <div class="barber-role"><i class="fa-solid fa-phone"></i> ${b.phone || 'Sem telefone'}</div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            ${b.active ? `
              <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="toggleBarberStatus(${b.id}, 0)">
                <i class="fa-solid fa-user-slash"></i> Desativar
              </button>
            ` : `
              <button class="btn btn-gold btn-sm" style="width: 100%;" onclick="toggleBarberStatus(${b.id}, 1)">
                <i class="fa-solid fa-user-check"></i> Reativar
              </button>
            `}
          </div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Erro ao carregar barbeiros:', err);
  }
}

function openNewBarberModal() {
  document.getElementById('barberModal').classList.add('active');
}

function closeBarberModal() {
  document.getElementById('barberModal').classList.remove('active');
}

async function handleNewBarberSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('newBarberName').value.trim();
  const phone = document.getElementById('newBarberPhone').value.trim();
  const bio = document.getElementById('newBarberBio').value.trim();
  const photo_url = document.getElementById('newBarberPhoto').value.trim();

  try {
    const res = await fetch('/api/barbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, bio, photo_url })
    });

    if (res.ok) {
      alert('Novo barbeiro adicionado com sucesso!');
      closeBarberModal();
      loadAdminBarbers();
    } else {
      const err = await res.json();
      alert('Erro: ' + err.error);
    }
  } catch (e) {
    alert('Erro ao salvar barbeiro: ' + e.message);
  }
}

async function toggleBarberStatus(id, newStatus) {
  try {
    await fetch(`/api/barbers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newStatus })
    });
    loadAdminBarbers();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

// 6. LIVRO CAIXA & FINANCEIRO
async function loadFinancialTransactions() {
  const tbody = document.getElementById('financialTableBody');
  const mobileList = document.getElementById('financialMobileList');
  const targetMonth = currentAdminDate.substring(0, 7);

  try {
    const res = await fetch(`/api/financial/transactions?month=${targetMonth}`);
    const list = await res.json();

    if (list.length === 0) {
      const emptyMsg = `Nenhuma transação avulsa registrada no caixa para o mês (${targetMonth}).`;
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">
            ${emptyMsg}
          </td>
        </tr>
      `;
      if (mobileList) {
        mobileList.innerHTML = `
          <div style="text-align: center; color: var(--text-dim); padding: 2rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px;">
            <i class="fa-solid fa-receipt" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.6;"></i>
            ${emptyMsg}
          </div>
        `;
      }
      return;
    }

    // Renderizar Tabela Desktop
    tbody.innerHTML = list.map(t => {
      const isIncome = t.type === 'entrada';
      return `
        <tr>
          <td>${t.date}</td>
          <td>
            <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">
              ${isIncome ? '🟢 Entrada' : '🔴 Saída'}
            </span>
          </td>
          <td><strong>${t.category}</strong></td>
          <td>${t.description || '-'}</td>
          <td style="font-weight: 800; color: ${isIncome ? 'var(--success)' : 'var(--danger)'};">
            ${isIncome ? '+' : '-'} ${formatCurrency(t.amount)}
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm" onclick="deleteTransaction(${t.id})" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Renderizar Cards Mobile (100% Enquadrado sem scroll lateral)
    if (mobileList) {
      mobileList.innerHTML = list.map(t => {
        const isIncome = t.type === 'entrada';
        return `
          <div class="admin-mobile-card">
            <div class="mobile-card-header">
              <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">
                  ${isIncome ? '🟢 Entrada' : '🔴 Saída'}
                </span>
                <strong style="color: var(--text-main); font-size: 0.92rem;">${t.category}</strong>
              </div>
              <div style="font-weight: 800; font-size: 1.05rem; color: ${isIncome ? 'var(--success)' : 'var(--danger)'};">
                ${isIncome ? '+' : '-'} ${formatCurrency(t.amount)}
              </div>
            </div>

            ${t.description ? `
              <div style="color: var(--text-muted); font-size: 0.83rem; margin: 0.15rem 0 0.35rem;">
                ${t.description}
              </div>
            ` : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.45rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-dim); margin-top: 0.15rem;">
              <div>
                <i class="fa-regular fa-calendar"></i> ${t.date}
              </div>
              <button class="btn btn-secondary btn-sm" onclick="deleteTransaction(${t.id})" style="padding: 0.25rem 0.65rem; font-size: 0.75rem;" title="Excluir">
                <i class="fa-solid fa-trash"></i> Excluir
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (e) {
    console.error('Erro ao carregar financeiro:', e);
  }
}

function openNewTransactionModal() {
  document.getElementById('transactionModal').classList.add('active');
}

function closeTransactionModal() {
  document.getElementById('transactionModal').classList.remove('active');
}

async function handleNewTransactionSubmit(event) {
  event.preventDefault();
  const type = document.getElementById('txType').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value;
  const category = document.getElementById('txCategory').value;
  const description = document.getElementById('txDescription').value.trim();

  try {
    const res = await fetch('/api/financial/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, date, category, description })
    });

    if (res.ok) {
      closeTransactionModal();
      loadFinancialTransactions();
      refreshDashboard();
    }
  } catch (e) {
    alert('Erro ao salvar transação: ' + e.message);
  }
}

async function deleteTransaction(id) {
  if (!confirm('Deseja excluir esta movimentação?')) return;
  try {
    await fetch(`/api/financial/transactions/${id}`, { method: 'DELETE' });
    loadFinancialTransactions();
    refreshDashboard();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

// 7. CONFIGURAÇÕES & MERCADO PAGO
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/settings');
    appSettings = await res.json();

    if (appSettings.mp_access_token) {
      document.getElementById('cfgMpAccessToken').value = appSettings.mp_access_token;
    }
    if (appSettings.mp_sandbox_mode) {
      document.getElementById('cfgMpSandbox').value = appSettings.mp_sandbox_mode;
    }
    if (appSettings.whatsapp_number) {
      document.getElementById('cfgWhatsapp').value = appSettings.whatsapp_number;
    }
  } catch (e) {
    console.error('Erro ao carregar settings:', e);
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();

  const updates = {
    mp_access_token: document.getElementById('cfgMpAccessToken').value.trim(),
    mp_sandbox_mode: document.getElementById('cfgMpSandbox').value,
    whatsapp_number: document.getElementById('cfgWhatsapp').value.trim()
  };

  const newPin = document.getElementById('cfgAdminPin').value.trim();
  if (newPin && newPin.length === 4) {
    updates.admin_pin = newPin;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (res.ok) {
      alert('Configurações salvas com sucesso!');
      loadAdminSettings();
    }
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
