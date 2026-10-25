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

// ESTADO DA APLICAÇÃO
let allServices = [];
let allBarbers = [];
let selectedServiceId = null;
let currentCategory = 'todos';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currentYear').textContent = new Date().getFullYear();

  // Definir data mínima para agendamento (hoje)
  const todayStr = new Date().toISOString().split('T')[0];
  const inputDate = document.getElementById('inputDate');
  if (inputDate) {
    inputDate.min = todayStr;
    inputDate.value = todayStr;
  }

  // Destacar o dia da semana atual na tabela de horários
  highlightToday();

  // Carregar dados da API
  loadServices();
  loadBarbers();
  loadSettings();
});

function highlightToday() {
  const days = ['day-dom', 'day-seg', 'day-ter', 'day-qua', 'day-qui', 'day-sex', 'day-sab'];
  const todayId = days[new Date().getDay()];
  const row = document.getElementById(todayId);
  if (row) {
    row.classList.add('today');
    const firstTd = row.querySelector('td');
    if (firstTd) firstTd.innerHTML += ' <span class="badge-today"><span class="radar-dot"></span> Hoje</span>';
  }
}

// 1. CARREGAR SERVIÇOS
async function loadServices() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
    renderServicesAccordion();
    populateServiceSelect();
  } catch (err) {
    console.error('Erro ao carregar serviços:', err);
    document.getElementById('servicesAccordionContainer').innerHTML = `
      <div style="text-align: center; color: var(--danger); padding: 2rem;">
        Não foi possível carregar os serviços no momento. Tente novamente mais tarde.
      </div>
    `;
  }
}

// 2. RENDERIZAR CATEGORIAS E SERVIÇOS EM ACORDEON (ESTILO SALONSOFT)
function renderServicesAccordion(searchTerm = '') {
  const container = document.getElementById('servicesAccordionContainer');
  if (!container) return;

  const term = searchTerm.toLowerCase().trim();

  // Filtrar serviços se houver busca
  const filteredServices = term 
    ? allServices.filter(s => s.name.toLowerCase().includes(term) || (s.description && s.description.toLowerCase().includes(term)))
    : allServices;

  // Agrupar por categoria
  const groups = {};
  filteredServices.forEach(s => {
    const cat = s.category || 'SERVIÇOS';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });

  const categories = Object.keys(groups);

  if (categories.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 2rem; background: var(--bg-card); border-radius: var(--radius-md);">
        Nenhum serviço encontrado para "${searchTerm}".
      </div>
    `;
    return;
  }

  // Ordenar para garantir "SERVIÇOS" primeiro, depois "PACOTES MENSAIS"
  categories.sort((a, b) => {
    if (a === 'SERVIÇOS') return -1;
    if (b === 'SERVIÇOS') return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = categories.map((cat, idx) => {
    const services = groups[cat];
    const isPlanCategory = cat === 'PACOTES MENSAIS';
    const iconClass = isPlanCategory ? 'fa-solid fa-crown' : 'fa-solid fa-scissors';
    const displayName = isPlanCategory ? 'PACOTES MENSAIS' : 'SERVIÇOS AVULSOS';
    const countLabel = `${services.length} ${services.length === 1 ? 'item' : 'itens'}`;
    
    // Deixa aberto por padrão se for o primeiro ou se estiver buscando algo
    const isOpen = term !== '' || idx === 0;

    return `
      <div class="category-accordion ${isOpen ? 'open' : ''}" id="accordion-${idx}">
        <div class="category-header" onclick="toggleCategory('accordion-${idx}')">
          <div class="category-title-wrap">
            <div class="category-icon-badge">
              <i class="${iconClass}"></i>
            </div>
            <div>
              <div class="category-title">${displayName}</div>
              <div class="category-count">${countLabel}</div>
            </div>
          </div>
          <div class="category-toggle-icon">
            <i class="fa-solid fa-chevron-down"></i>
          </div>
        </div>

        <div class="category-body">
          ${services.map(s => {
            const priceFormatted = Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            return `
              <div class="service-item-row" onclick="bookSpecificService(${s.id})">
                <div class="service-item-info">
                  <div class="service-item-name">
                    ${s.name}
                    ${isPlanCategory ? '<span class="badge badge-success" style="font-size:0.65rem;">Plano</span>' : ''}
                  </div>
                  <div class="service-item-desc">${s.description || 'Atendimento profissional de excelência.'}</div>
                  <div class="service-item-meta">
                    <span><i class="fa-regular fa-clock"></i> ${s.duration_minutes} min</span>
                  </div>
                </div>

                <div class="service-item-action">
                  <div class="service-item-price">${priceFormatted}</div>
                  <button class="btn-book-service" type="button" onclick="event.stopPropagation(); bookSpecificService(${s.id})">
                    <i class="fa-solid fa-plus"></i> Agendar
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// TOGGLE DO ACORDEON
function toggleCategory(accordionId) {
  const el = document.getElementById(accordionId);
  if (el) {
    el.classList.toggle('open');
  }
}

// BUSCA RÁPIDA DE SERVIÇOS
function handleServiceSearch(val) {
  renderServicesAccordion(val);
}

// 3. CARREGAR BARBEIROS
async function loadBarbers() {
  try {
    const res = await fetch('/api/barbers');
    allBarbers = await res.json();
    renderBarbers();
    populateBarberSelect();
  } catch (err) {
    console.error('Erro ao carregar barbeiros:', err);
  }
}

function renderBarbers() {
  const container = document.getElementById('teamContainer');
  if (!container) return;

  container.innerHTML = allBarbers.map(b => `
    <div class="barber-card">
      <div class="barber-img-wrap">
        <img src="${b.photo_url || '/assets/images/renan-perfil.jpg'}" alt="${b.name}" class="barber-img" onerror="this.src='/assets/images/renan-perfil.jpg'">
      </div>
      <div class="barber-info">
        <h3 class="barber-name">${b.name}</h3>
        <div class="barber-role">Barbeiro Especialista</div>
        <p class="barber-bio">${b.bio || 'Especialista em degradê, tesoura e visagismo masculino.'}</p>
        <button class="btn btn-outline-gold btn-sm" style="width: 100%;" onclick="bookWithBarber(${b.id})">
          <i class="fa-regular fa-calendar"></i> Agendar com ${b.name.split(' ')[0]}
        </button>
      </div>
    </div>
  `).join('');
}

// 4. POPULAR SELECTS DO MODAL
function populateBarberSelect() {
  const sel = document.getElementById('selectBarber');
  if (!sel) return;
  sel.innerHTML = allBarbers.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  if (allBarbers.length > 0) {
    onBarberOrDateChange();
  }
}

function populateServiceSelect() {
  const sel = document.getElementById('selectService');
  if (!sel) return;

  const standardServices = allServices.filter(s => s.category !== 'PACOTES MENSAIS');
  const packageServices = allServices.filter(s => s.category === 'PACOTES MENSAIS');

  let html = '';

  if (standardServices.length > 0) {
    html += '<optgroup label="✂️ SERVIÇOS AVULSOS">';
    html += standardServices.map(s => {
      const priceFormatted = Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `<option value="${s.id}" data-price="${s.price}">${s.name} - ${priceFormatted} (${s.duration_minutes} min)</option>`;
    }).join('');
    html += '</optgroup>';
  }

  if (packageServices.length > 0) {
    html += '<optgroup label="👑 PACOTES MENSAIS (PLANOS)">';
    html += packageServices.map(s => {
      const priceFormatted = Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `<option value="${s.id}" data-price="${s.price}">[Plano] ${s.name} - ${priceFormatted} (${s.duration_minutes} min)</option>`;
    }).join('');
    html += '</optgroup>';
  }

  sel.innerHTML = html;
  updateServicePrice();
}

function updateServicePrice() {
  const sel = document.getElementById('selectService');
  const notice = document.getElementById('servicePriceNotice');
  if (!sel || !notice) return;

  const selectedOpt = sel.options[sel.selectedIndex];
  if (selectedOpt) {
    const price = Number(selectedOpt.getAttribute('data-price') || 0);
    notice.textContent = `Valor: ${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
  }
}

// 5. CALCULAR HORÁRIOS DISPONÍVEIS
async function onBarberOrDateChange() {
  const barberId = document.getElementById('selectBarber').value;
  const dateVal = document.getElementById('inputDate').value;
  const slotsContainer = document.getElementById('slotsContainer');
  const selectedTimeInput = document.getElementById('selectedTime');
  const timeNotice = document.getElementById('selectedTimeNotice');

  selectedTimeInput.value = '';
  timeNotice.textContent = '';

  if (!barberId || !dateVal) return;

  slotsContainer.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 0.5rem; font-size: 0.85rem;">
      <i class="fa-solid fa-circle-notch fa-spin"></i> Consultando agenda disponível...
    </div>
  `;

  try {
    const res = await fetch(`/api/availability?barber_id=${barberId}&date=${dateVal}`);
    const data = await res.json();

    if (!data.available || data.slots.length === 0) {
      slotsContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--warning); padding: 0.75rem; font-size: 0.85rem; background: rgba(245, 158, 11, 0.1); border-radius: 8px;">
          <i class="fa-solid fa-triangle-exclamation"></i> ${data.message || 'Sem horários disponíveis para esta data. Escolha outro dia.'}
        </div>
      `;
      return;
    }

    slotsContainer.innerHTML = data.slots.map(t => `
      <button type="button" class="slot-btn" onclick="selectSlot('${t}', this)">
        ${t}
      </button>
    `).join('');
  } catch (err) {
    slotsContainer.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger); font-size: 0.85rem;">Erro ao buscar horários.</div>`;
  }
}

function selectSlot(timeStr, btnElement) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  if (btnElement) btnElement.classList.add('selected');
  document.getElementById('selectedTime').value = timeStr;
  document.getElementById('selectedTimeNotice').innerHTML = `<i class="fa-solid fa-circle-check"></i> Horário selecionado: <strong>${timeStr}</strong>`;
}

// 6. FORMAS DE PAGAMENTO
function selectPaymentOpt(labelElement) {
  document.querySelectorAll('.payment-card-opt').forEach(el => el.classList.remove('selected'));
  labelElement.classList.add('selected');
  const radio = labelElement.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
}

// 7. SELETOR DE DIAS INTERATIVO (CALENDÁRIO HORIZONTAL TOUCH)
function buildDateStrip() {
  const container = document.getElementById('dateStripContainer');
  if (!container) return;

  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  let html = '';
  const now = new Date();
  let firstAvailableDate = null;
  let firstAvailableBtnId = null;

  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dayOfWeek = d.getDay(); // 0 = Dom, 1 = Seg
    const isClosed = (dayOfWeek === 0 || dayOfWeek === 1); // Domingo ou Segunda fechado

    let weekLabel = days[dayOfWeek];
    if (i === 0) weekLabel = 'Hoje';
    else if (i === 1) weekLabel = 'Amanhã';

    const dayNumber = d.getDate();
    const monthLabel = months[d.getMonth()];
    const btnId = `date-btn-${dateStr}`;
    const fullLabel = `${weekLabel}, ${dayNumber} de ${monthLabel}`;

    if (!isClosed && !firstAvailableDate) {
      firstAvailableDate = dateStr;
      firstAvailableBtnId = btnId;
    }

    html += `
      <div class="date-card-btn ${isClosed ? 'disabled' : ''}" id="${btnId}"
           ${isClosed ? '' : `onclick="selectDate('${dateStr}', this, '${fullLabel}')"`}
           title="${fullLabel}">
        <span class="date-card-weekday">${weekLabel}</span>
        <span class="date-card-day">${dayNumber}</span>
        <span class="date-card-month">${monthLabel}</span>
        ${isClosed ? '<span class="date-card-closed-badge">Fechado</span>' : ''}
      </div>
    `;
  }

  container.innerHTML = html;

  // Seleciona o primeiro dia útil disponível
  if (firstAvailableDate) {
    const el = document.getElementById(firstAvailableBtnId);
    const label = el ? el.getAttribute('title') : '';
    selectDate(firstAvailableDate, el, label);
  }
}

function selectDate(dateStr, btnElement, labelText) {
  document.querySelectorAll('.date-card-btn').forEach(b => b.classList.remove('selected'));
  if (btnElement) {
    btnElement.classList.add('selected');
    btnElement.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }

  document.getElementById('inputDate').value = dateStr;
  const labelEl = document.getElementById('selectedDateLabel');
  if (labelEl && labelText) {
    labelEl.textContent = labelText;
  }

  onBarberOrDateChange();
}

// 8. MODAL ACTIONS & GRAVAÇÃO DO SERVIÇO ESCOLHIDO
function openBookingModal(preselectedServiceId = null, preselectedBarberId = null) {
  const modal = document.getElementById('bookingModal');
  modal.classList.add('active');

  const summaryCardGroup = document.getElementById('groupSelectedServiceSummary');
  const selectGroup = document.getElementById('groupServiceSelect');
  const selS = document.getElementById('selectService');

  // Se o usuário já escolheu o serviço anteriormente no catálogo principal
  if (preselectedServiceId) {
    const service = allServices.find(s => s.id === preselectedServiceId);
    if (service) {
      selS.value = preselectedServiceId;
      updateServicePrice();

      // Preenche o card elegante de resumo do serviço
      document.getElementById('summaryServiceName').textContent = service.name;
      const priceFormatted = Number(service.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      document.getElementById('summaryServiceMeta').textContent = `${priceFormatted} • Duração: ${service.duration_minutes} minutos`;

      // Mostra o card fixo e esconde o seletor
      summaryCardGroup.style.display = 'block';
      selectGroup.style.display = 'none';
    }
  } else {
    // Se abriu pelo botão geral do Hero, mostra o seletor para ele escolher
    summaryCardGroup.style.display = 'none';
    selectGroup.style.display = 'block';
  }

  if (preselectedBarberId) {
    const selB = document.getElementById('selectBarber');
    if (selB) selB.value = preselectedBarberId;
  }

  // Monta ou atualiza o seletor de dias interativo
  buildDateStrip();
  onBarberOrDateChange();
}

function enableServiceDropdown() {
  document.getElementById('groupSelectedServiceSummary').style.display = 'none';
  document.getElementById('groupServiceSelect').style.display = 'block';
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

function bookSpecificService(serviceId) {
  openBookingModal(serviceId, null);
}

function bookWithBarber(barberId) {
  openBookingModal(null, barberId);
}

// 8. SUBMISSÃO DO AGENDAMENTO
async function handleBookingSubmit(event) {
  event.preventDefault();

  const selectedTime = document.getElementById('selectedTime').value;
  if (!selectedTime) {
    alert('Por favor, selecione um dos horários disponíveis na lista!');
    return;
  }

  const btn = document.getElementById('btnConfirmBooking');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processando Agendamento...`;

  const payload = {
    barber_id: parseInt(document.getElementById('selectBarber').value),
    service_id: parseInt(document.getElementById('selectService').value),
    date: document.getElementById('inputDate').value,
    time: selectedTime,
    client_name: document.getElementById('clientName').value.trim(),
    client_phone: document.getElementById('clientPhone').value.trim(),
    payment_method: document.querySelector('input[name="paymentMethod"]:checked').value
  };

  try {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Erro ao realizar agendamento');
    }

    // Salva o telefone no localStorage para consultas futuras
    const cleanPhone = payload.client_phone.replace(/\D/g, '');
    localStorage.setItem('rcbarber_client_phone', cleanPhone);

    // Se o pagamento for Online (Mercado Pago) e tiver link gerado
    if (payload.payment_method === 'online_mercadopago' && result.payment_link) {
      // Redireciona para o checkout do Mercado Pago
      window.location.href = result.payment_link;
    } else {
      // Redireciona para a tela de confirmação de agendamento presencial
      window.location.href = `/agendamento-confirmado.html?id=${result.id}&name=${encodeURIComponent(result.client_name || payload.client_name)}&service=${encodeURIComponent(result.service_name)}&barber=${encodeURIComponent(result.barber_name)}&date=${result.date}&time=${result.time}&price=${result.price}&method=${payload.payment_method}`;
    }

  } catch (err) {
    alert('Erro: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// 9. CARREGAR CONFIGURAÇÕES
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    if (settings.whatsapp_number) {
      const cleanNum = settings.whatsapp_number.replace(/\D/g, '');
      const btn = document.getElementById('whatsappBtn');
      if (btn) {
        btn.href = `https://wa.me/${cleanNum}?text=Olá!%20Gostaria%20de%20tirar%20uma%20dúvida%20sobre%20a%20RC%20Barbearia.`;
      }
    }
  } catch (e) {
    console.warn('Não foi possível carregar settings:', e);
  }
}

// 10. MEUS AGENDAMENTOS (BUSCA POR TELEFONE / ID DO CLIENTE)
function openMyAppointmentsModal() {
  const modal = document.getElementById('myAppointmentsModal');
  modal.classList.add('active');

  // Recupera telefone salvo se houver
  const savedPhone = localStorage.getItem('rcbarber_client_phone');
  const inputPhone = document.getElementById('myPhoneInput');
  if (savedPhone && inputPhone) {
    inputPhone.value = formatPhoneNumber(savedPhone);
    fetchClientAppointments(savedPhone);
  }
}

function closeMyAppointmentsModal() {
  document.getElementById('myAppointmentsModal').classList.remove('active');
}

function handleSearchAppointments(event) {
  event.preventDefault();
  const phoneVal = document.getElementById('myPhoneInput').value.trim();
  const cleanPhone = phoneVal.replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 8) {
    alert('Por favor, digite seu número de telefone completo com DDD.');
    return;
  }

  localStorage.setItem('rcbarber_client_phone', cleanPhone);
  fetchClientAppointments(cleanPhone);
}

async function fetchClientAppointments(phone) {
  const container = document.getElementById('myAppointmentsResults');
  const btn = document.getElementById('btnSearchAppointments');
  if (btn) btn.disabled = true;

  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
      <i class="fa-solid fa-circle-notch fa-spin"></i> Localizando seus agendamentos...
    </div>
  `;

  try {
    const res = await fetch(`/api/clients/${phone}/appointments`);
    const data = await res.json();

    if (btn) btn.disabled = false;

    if (!data.found || data.appointments.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 2rem 1rem;">
          <i class="fa-regular fa-calendar-xmark" style="font-size: 2.2rem; color: var(--warning); margin-bottom: 0.75rem;"></i>
          <h4 style="font-size: 1.1rem; margin-bottom: 0.35rem;">Nenhum agendamento encontrado</h4>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">
            Não encontramos horários registrados para o telefone informado.
          </p>
          <button class="btn btn-gold btn-sm" onclick="closeMyAppointmentsModal(); openBookingModal();">
            <i class="fa-solid fa-calendar-plus"></i> Agendar Meu Horário Agora
          </button>
        </div>
      `;
      return;
    }

    // Exibir saudação personalizada e lista de agendamentos
    let html = `
      <div style="margin-bottom: 1rem; padding: 0.6rem 0.8rem; background: var(--primary-gold-light); border-radius: 8px; border: 1px solid rgba(229, 169, 59, 0.3); font-size: 0.9rem;">
        <i class="fa-solid fa-user-check" style="color: var(--primary-gold);"></i> Olá, <strong>${data.client.name}</strong>! Encontramos <strong>${data.appointments.length}</strong> agendamento(s):
      </div>
    `;

    html += data.appointments.map(a => {
      // Formatação de data
      let dateFormatted = a.date;
      if (a.date && a.date.includes('-')) {
        const [y, m, d] = a.date.split('-');
        dateFormatted = `${d}/${m}/${y}`;
      }

      // Status Badge
      let statusBadge = `<span class="badge badge-info">${a.status}</span>`;
      if (a.status === 'concluido') {
        statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> Concluído</span>`;
      } else if (a.status === 'cancelado') {
        statusBadge = `<span class="badge badge-danger">Cancelado</span>`;
      } else if (a.status === 'agendado') {
        statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Agendado</span>`;
      }

      // Pagamento
      let payBadge = a.payment_status === 'pago' 
        ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Pago</span>`
        : `<span class="badge badge-warning">Pagamento Pendente</span>`;

      const canCancel = a.status === 'agendado';
      const canPayOnline = a.payment_status !== 'pago' && a.mp_payment_link;

      return `
        <div class="client-appt-card">
          <div class="client-appt-header">
            <div>
              <span class="client-appt-date"><i class="fa-regular fa-calendar"></i> ${dateFormatted} às ${a.time}h</span>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="client-appt-service">
            ${a.service_name}
          </div>

          <div class="client-appt-details">
            <div><i class="fa-solid fa-user-tie" style="width: 16px;"></i> Barbeiro: <strong>${a.barber_name}</strong></div>
            <div><i class="fa-solid fa-clock" style="width: 16px;"></i> Duração estimada: ${a.duration_minutes || 30} min</div>
            <div><i class="fa-solid fa-wallet" style="width: 16px;"></i> Pagamento: ${payBadge}</div>
          </div>

          <div class="client-appt-footer">
            <div class="client-appt-price">
              ${Number(a.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center;">
              ${canPayOnline ? `
                <a href="${a.mp_payment_link}" class="btn btn-gold btn-sm">
                  <i class="fa-brands fa-pix"></i> Pagar Online
                </a>
              ` : ''}

              ${canCancel ? `
                <button class="btn btn-secondary btn-sm" onclick="cancelClientAppointment(${a.id}, '${phone}')" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);" title="Cancelar este horário">
                  <i class="fa-solid fa-xmark"></i> Cancelar
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 1rem;">Erro ao buscar agendamentos. Verifique o número digitado.</div>`;
    if (btn) btn.disabled = false;
  }
}

async function cancelClientAppointment(id, phone) {
  if (!confirm('Deseja realmente cancelar este agendamento? O horário ficará livre para outro cliente.')) return;

  try {
    const res = await fetch(`/api/appointments/${id}/cancel-by-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const result = await res.json();
    if (res.ok) {
      alert('Agendamento cancelado com sucesso!');
      fetchClientAppointments(phone);
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (e) {
    alert('Erro ao cancelar: ' + e.message);
  }
}

function formatPhoneNumber(num) {
  const clean = num.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return clean;
}
