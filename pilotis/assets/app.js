/* Pilotis · shell da plataforma — sessão, header, helpers */
(function () {
  const P = window.PILOTIS || {};

  // ── marca oficial v2 (Versão Verde): xadrez + cunha curva + anel-aperture ──
  // A célula é auto-contida (base creme) — funciona igual em fundo claro ou escuro.
  window.cobogoSVG = function (size, dark) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" aria-label="Pilotis">
      <rect width="120" height="120" fill="#F4F2ED"/>
      <rect x="60" width="60" height="60" fill="#1B6C39"/>
      <rect y="60" width="60" height="60" fill="#1B6C39"/>
      <path d="M0 0 L0 60 L60 60 A60 60 0 0 1 0 0 Z" fill="#292B26"/>
      <circle cx="60" cy="60" r="26.3" fill="#292B26"/>
      <circle cx="60" cy="60" r="10.1" fill="#F4F2ED"/></svg>`;
  };

  // ── sessão ────────────────────────────────────────────────────────
  window.sessao = {
    get: () => { try { return JSON.parse(localStorage.getItem('pilotis_sessao')); } catch (e) { return null; } },
    set: (u) => localStorage.setItem('pilotis_sessao', JSON.stringify(u)),
    clear: () => localStorage.removeItem('pilotis_sessao'),
  };
  window.exigeSessao = function () {
    if (!sessao.get()) { location.href = 'login.html'; return false; }
    return true;
  };

  // ── header ────────────────────────────────────────────────────────
  window.renderTopbar = function (ativo) {
    const u = sessao.get() || (P.usuario || { nome: 'Visitante', papel: '', iniciais: '?' });
    const links = [
      ['welcome.html', 'Hoje'],
      ['cliente.html?c=anjl', 'ANJL'],
      ['cliente.html?c=vale', 'Vale'],
      ['cliente.html?c=expedia', 'Expedia'],
      ['parlamento.html', 'Painel parlamentar'],
      ['estado.html', 'Estado'],
      ['comissoes.html', 'Comissões'],
    ];
    const nav = links.map(([h, t]) => `<a href="${h}" class="${ativo === t ? 'on' : ''}">${t}</a>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `<header class="topbar">
      <a class="brand" href="welcome.html">${cobogoSVG(30, true)}<span style="display:block"><b>pilotis</b><span>RIG · OS</span></span></a>
      <nav>${nav}</nav>
      <div class="userchip"><div class="av">${u.iniciais}</div>
        <div class="nm">${u.nome}<i>${u.papel}</i></div>
        <a href="#" onclick="sessao.clear();location.href='index.html';return false">sair</a></div>
    </header>`);
  };

  // ── helpers ───────────────────────────────────────────────────────
  window.$ = (s, el) => (el || document).querySelector(s);
  window.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  window.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  window.POL = { oportunidade: ['Oportunidade', 'dado'], ameaca: ['Ameaça', 'acao'], defensivo: ['Defensivo', ''], monitorar: ['Monitorar', ''], tributario: ['Tributário', ''] };
  window.pillPol = (p) => { const [t, c] = POL[p] || ['—', '']; return `<span class="pill ${c}">${t}</span>`; };
  window.pillPri = (p) => p ? `<span class="pill ${p === 'Alta' ? 'acao' : p === 'Média' ? 'dado' : ''}">${p}</span>` : '—';
  window.cliente = (slug) => (P.clientes || []).find((c) => c.slug === slug);
  window.fmtDT = (s) => (s || '').slice(0, 16).replace('T', ' · ');
  window.hojeISO = () => { const d = new Date(); return d.toISOString().slice(0, 10); };
  window.tabs = function (root) {
    $$('.tabs button', root).forEach((b) => b.addEventListener('click', () => {
      $$('.tabs button', root).forEach((x) => x.classList.remove('on')); b.classList.add('on');
      $$('.panel', root).forEach((x) => x.classList.remove('on'));
      const p = document.getElementById(b.dataset.t); p.classList.add('on');
      const f = p.querySelector('iframe[data-src]'); if (f && !f.src) f.src = f.dataset.src;
    }));
  };

  // ── tarefas do consultor (derivadas do estado das carteiras) ──────
  window.tarefasPendentes = function () {
    const t = [];
    (P.clientes || []).forEach((c) => {
      if (c.filaTriagem) t.push({ cli: c, txt: `Triar ${c.filaTriagem} descobertas relevantes na fila`, href: `cliente.html?c=${c.slug}#triagem`, tipo: 'triagem' });
      const altas = c.carteira.filter((p) => p.estado === 'acompanhando' && p.prioridade === 'Alta');
      if (altas.length) t.push({ cli: c, txt: `Decidir estratégia: ${altas.length} ato(s) prioridade Alta aguardando decisão`, href: `cliente.html?c=${c.slug}#triagem`, tipo: 'gate' });
      const rel = c.prospectivas.atos.length;
      if (rel) t.push({ cli: c, txt: `Revisar ${rel} estratégia(s) e validar escores MACTOR/SMIC`, href: `cliente.html?c=${c.slug}#prospectiva`, tipo: 'prospectiva' });
    });
    return t;
  };

  // ── destaques (o que merece atenção hoje) ─────────────────────────
  window.destaques = function () {
    const out = [];
    (P.clientes || []).forEach((c) => {
      c.carteira.forEach((p) => {
        let peso = p.score || 0;
        if (p.prioridade === 'Alta') peso += 6;
        if (p.polaridade === 'ameaca') peso += 4;
        const ut = p.ultimaTramitacao;
        if (ut && ut.dataHora && ut.dataHora >= new Date(Date.now() - 6 * 864e5).toISOString()) peso += 5;
        out.push({ cli: c, p, peso });
      });
    });
    return out.sort((a, b) => b.peso - a.peso).slice(0, 5);
  };
})();
