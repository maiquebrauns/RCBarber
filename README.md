# 💈 RC Barbearia - Sistema Completo com Agendamentos, Mercado Pago & Dashboard

Sistema profissional desenvolvido sob medida para a **RC Barbearia** (Renan Carvalho), com foco em conversão mobile, agendamentos rápidos, pagamentos online automáticos via **Mercado Pago (PIX e Cartão)** e **Dashboard Financeiro** em tempo real com apuração de lucro líquido diário e mensal.

---

## 🚀 Principais Recursos

### 1. Portal do Cliente (`/index.html`)
* **Design Dark & Gold**: Visual sofisticado de barbearia moderna, otimizado para celulares e computadores.
* **Catálogo Oficial**: 18 serviços e pacotes mensais mapeados com preços, descrições e durações.
* **Agendamento Inteligente**:
  * Escolha de barbeiro (Renan Carvalho ou outros membros da equipe).
  * Grade automática de horários disponíveis calculada em tempo real (respeitando almoço e folgas).
  * **Pagamento Online Antecipado**: Opção de gerar link de pagamento ou PIX via **Mercado Pago** sem filas.
  * Opção de pagamento no local (dinheiro, maquininha ou PIX no balcão).
* **Integração WhatsApp**: Botão flutuante e envio automático de resumo de confirmação para o WhatsApp da barbearia.

### 2. Dashboard de Gestão & Financeiro (`/admin.html`)
* **Acesso Seguro por PIN**: Proteção rápida de 4 dígitos (PIN padrão inicial: `1234`).
* **Métricas do Dia**:
  * **Pessoas Atendidas Hoje** (contador exato de clientes concluídos).
  * **Faturamento Bruto do Dia**.
  * **Saídas / Despesas do Dia**.
  * **LUCRO LÍQUIDO DO DIA** destacado com margem real.
  * Tabela de atendimentos do dia com botões de 1 clique para dar baixa ou registrar pagamento.
* **Consolidado Mensal**:
  * Total de clientes atendidos no mês.
  * Entradas totais vs. Despesas totais do mês.
  * **Lucro Líquido Acumulado do Mês**.
* **Gestão da Equipe (Múltiplos Barbeiros)**:
  * Cadastro de novos barbeiros com foto, telefone e bio.
  * Ativação e desativação com 1 clique.
* **Livro Caixa (Entradas & Saídas)**:
  * Lançamento de despesas avulsas (lâminas, produtos, energia, aluguel, etc.) para cálculo preciso de lucro.
* **Configuração Fácil do Mercado Pago**:
  * Campo no próprio painel para colar o `Access Token` e alternar entre modo Sandbox (testes) e Produção.

---

## 🛠️ Como Iniciar o Sistema

1. Abra o terminal na pasta do projeto:
   ```bash
   cd c:\Users\Administrator\Documents\RCBarber
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Acesse no navegador:
   * **Site do Cliente**: [http://localhost:3000](http://localhost:3000)
   * **Painel Administrativo**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 💳 Configurando o Mercado Pago

1. Acesse o painel de desenvolvedor do Mercado Pago: [https://www.mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel)
2. Crie uma aplicação (ou selecione uma existente) e copie seu **Access Token** de Produção.
3. No painel da barbearia (`/admin.html`), vá na aba **Mercado Pago & Ajustes**, cole o token e salve!
