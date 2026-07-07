/* Agente Pilotis — assistente conversacional local sobre os dados da plataforma.
   Zero rede: responde a partir de window.PILOTIS + window.PILOTIS_AGENDA.
   A máquina informa; as decisões continuam nos gates do consultor. */
(function () {
  const P = window.PILOTIS;
  if (!P) return;
  const AG = window.PILOTIS_AGENDA || { dias: {} };

  // ── util ──────────────────────────────────────────────────────────
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const POLN = { oportunidade: 'oportunidade', ameaca: 'ameaça', defensivo: 'defensivo', monitorar: 'monitorar', tributario: 'tributário' };
  const hoje = () => new Date().toISOString().slice(0, 10);

  function achaCliente(q) {
    if (/\banjl|jogo|loteria|aposta/.test(q)) return P.clientes.find(c => c.slug === 'anjl');
    if (/\bvale|minera|licenciamento|barrag/.test(q)) return P.clientes.find(c => c.slug === 'vale');
    if (/\bexpedia|turismo|viagem|hospeda|temporada/.test(q)) return P.clientes.find(c => c.slug === 'expedia');
    return null;
  }
  function achaAto(q) {
    const m = q.match(/(pl|plp|pec|ric|req|pdl|rqs|mpv?)\s*n?[ºo°.]?\s*(\d{2,5})/i);
    if (!m) return null;
    const alvo = (m[1] + ' ' + m[2]).toUpperCase();
    for (const c of P.clientes) {
      const p = [...c.carteira, ...(c.fila || [])].find(x => norm(x.rotulo).toUpperCase().startsWith(alvo));
      if (p) return { p, c };
    }
    return null;
  }
  const li = (arr) => arr.map(x => '• ' + x).join('\n');
  const atoLinha = (p) => `${p.rotulo} [${p.prioridade || p.sugestao || '—'} · ${POLN[p.polaridade] || '—'}] — ${p.ementa.slice(0, 90)}…`;

  // ── intents ───────────────────────────────────────────────────────
  function responder(qRaw) {
    const q = norm(qRaw);
    const cli = achaCliente(q);
    const ato = achaAto(qRaw);

    // ato específico
    if (ato) {
      const { p, c } = ato;
      const ut = p.ultimaTramitacao || {};
      let r = `${p.rotulo} · carteira ${c.nome}\n` +
        `Estado: ${p.estado} · prioridade ${p.prioridade || p.sugestao || '—'} · vetor ${POLN[p.polaridade] || '—'} · score ${p.score}\n` +
        `Autor: ${p.autor || '—'}\nÓrgão: ${p.orgao || '—'} · situação: ${(p.situacao || '—').slice(0, 90)}`;
      if (ut.despacho) r += `\nÚltimo andamento: ${ut.despacho.slice(0, 110)} (${(ut.dataHora || '').slice(0, 10)})`;
      const pro = c.prospectivas.atos.find(a => a.rotulo === p.rotulo);
      if (pro) r += `\nEstratégia pronta — abre em "${c.nome} → Estratégias"; o deck (Plano de Ação) sai pelo botão Gerar PPT.`;
      return { txt: r, sug: [`o que mudou na ${c.slug}`, 'destaques de hoje'] };
    }

    // movimentos / o que mudou
    if (/mudou|moviment|novidade|aconteceu|atualiza/.test(q)) {
      const cs = cli ? [cli] : P.clientes;
      const r = cs.map(c => {
        const n = c.nMovimentos ?? c.movimentos.length;
        const top = c.movimentos.slice(0, 3).map(m => `  – ${m.rotulo}: ${m.evento.slice(0, 80)}`).join('\n');
        return `${c.nome}: ${n} movimento(s) desde ontem${top ? '\n' + top : ''}`;
      }).join('\n\n');
      return { txt: r, sug: ['destaques de hoje', 'tarefas pendentes'] };
    }

    // destaques / ameaças
    if (/destaque|atencao|ameaca|risco|urgente|importante/.test(q)) {
      const ds = window.destaques ? destaques() : [];
      const itens = ds.filter(d => !cli || d.cli.slug === cli.slug).slice(0, 5)
        .map(d => `${d.cli.slug.toUpperCase()} · ${atoLinha(d.p)}`);
      return { txt: itens.length ? 'O que merece a tua atenção agora:\n' + li(itens)
        : 'Sem destaques críticos no momento — carteiras sob controle.', sug: ['agenda de hoje', 'atos de prioridade alta'] };
    }

    // agenda
    if (/agenda|evento|sessao|reuniao|audiencia|plenario|pauta de hoje/.test(q)) {
      const dia = /amanha/.test(q) ? Object.keys(AG.dias).sort()[1] : hoje();
      const evs = (AG.dias[dia] || Object.values(AG.dias)[0] || []).slice(0, 6);
      if (!evs.length) return { txt: 'Sem eventos na agenda capturada para ' + (dia || 'hoje') + '.', sug: ['o que mudou hoje'] };
      return { txt: `Agenda ${dia}:\n` + li(evs.map(e =>
        `${e.hora || '—'} · ${e.casa === 'camara' ? 'Câmara' : 'Senado'} ${e.orgao || ''} — ${(e.tipo || '')}${e.titulo ? ': ' + e.titulo.slice(0, 70) : ''}`)),
        sug: ['destaques de hoje', 'o que mudou hoje'] };
    }

    // prioridade alta
    if (/prioridade alta|\balta\b|critic/.test(q)) {
      const cs = cli ? [cli] : P.clientes;
      const itens = [];
      cs.forEach(c => c.carteira.filter(p => p.prioridade === 'Alta').forEach(p => itens.push(`${c.slug.toUpperCase()} · ${atoLinha(p)}`)));
      return { txt: itens.length ? 'Atos de prioridade Alta:\n' + li(itens) : 'Nenhum ato de prioridade Alta em carteira.',
        sug: ['estratégias prontas', 'o que mudou hoje'] };
    }

    // prospectivas / plano de ação / ppt
    if (/prospectiva|plano de acao|\bppt\b|\bdeck\b|apresentacao/.test(q)) {
      const cs = cli ? [cli] : P.clientes;
      const itens = [];
      cs.forEach(c => c.prospectivas.atos.forEach(a => itens.push(`${c.slug.toUpperCase()} · ${a.rotulo} (${POLN[a.polaridade] || '—'})`)));
      return { txt: itens.length ? 'Estratégias com deck pronto (Plano de Ação):\n' + li(itens) +
        '\nAbre pelo dashboard do cliente → Estratégias → Gerar PPT.' : 'Nenhuma estratégia gerada ainda.',
        sug: cs.map(c => `abrir ${c.slug}`).slice(0, 2) };
    }

    // lógica / termos
    if (/logica|termo|palavra|nucleo|vetor(es)?\b|score|criterio/.test(q)) {
      const c = cli || P.clientes[0];
      const lg = c.logica;
      return { txt: `Lógica de interesse — ${c.nome}:\n` +
        `Núcleo (${lg.nucleo.length} termos): ${lg.nucleo.slice(0, 8).join(', ')}…\n` +
        `Vetores: ${Object.values(lg.categorias).map(v => `${v.rotulo} (peso ${v.peso}, ${POLN[v.polaridade] || v.polaridade})`).join(' · ')}\n` +
        `Limiares: Alta ≥ ${lg.limiares.alta}, Média ≥ ${lg.limiares.media}.\n` +
        `Editável em "${c.nome} → Lógica de interesse" — adiciona/exclui termos e exporta o JSON para o backoffice.`,
        sug: [`abrir ${c.slug}`, 'como o score funciona'] };
    }
    if (/como o score|como funciona o score|pontuacao/.test(q)) {
      return { txt: 'Score = 5 (se algum termo do núcleo bate na ementa) + soma dos pesos dos vetores presentes. ' +
        'A polaridade dominante (oportunidade/ameaça/defensivo) orienta a postura. Tudo auditável: os termos batidos ficam registrados em cada ato.',
        sug: ['ver a lógica da vale', 'atos de prioridade alta'] };
    }

    // tarefas
    if (/tarefa|pendencia|pendente|gate|triagem/.test(q)) {
      const ts = window.tarefasPendentes ? tarefasPendentes() : [];
      return { txt: ts.length ? 'Gates aguardando o consultor:\n' + li(ts.map(t => `${t.cli.nome.split(' ')[0]} — ${t.txt}`))
        : 'Nenhum gate pendente. O vão é teu.', sug: ['o que mudou hoje', 'destaques'] };
    }

    // comissões / onde tramita
    if (/comissao|comissoes|tramita|orgao|kanban/.test(q)) {
      const cont = {};
      P.kanban.forEach(p => { const o = (p.orgao || '—').toUpperCase(); cont[o] = (cont[o] || 0) + 1; });
      const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { txt: 'Onde a carteira tramita agora:\n' + li(top.map(([o, n]) => `${o}: ${n} projeto(s)`)) +
        '\nDetalhe no painel Comissões (kanban filtrável).', sug: ['abrir comissões', 'destaques'] };
    }

    // carteira / cliente
    if (cli || /carteira|cliente|resumo/.test(q)) {
      const cs = cli ? [cli] : P.clientes;
      const r = cs.map(c => {
        const ct = c.contagens;
        const top = c.carteira.slice(0, 3).map(atoLinha);
        return `${c.nome} — ${c.carteira.length} atos em carteira ` +
          `(${ct.acompanhando || 0} acompanhando · ${(ct.lobby || 0) + (ct.prospectiva || 0)} em lobby · ${ct.relatorio || 0} com relatório) · fila de triagem: ${c.filaTriagem}\n` + li(top);
      }).join('\n\n');
      return { txt: r, sug: cli ? [`o que mudou na ${cli.slug}`, `prospectivas da ${cli.slug}`] : ['destaques de hoje', 'tarefas pendentes'] };
    }

    // navegação
    if (/abrir (anjl|vale|expedia)/.test(q)) {
      const slug = q.match(/abrir (anjl|vale|expedia)/)[1];
      location.href = 'cliente.html?c=' + slug;
      return { txt: 'Abrindo ' + slug.toUpperCase() + '…', sug: [] };
    }
    if (/abrir comissoes/.test(q)) { location.href = 'comissoes.html'; return { txt: 'Abrindo comissões…', sug: [] }; }
    if (/grafo|parlamento|influencia|mapa de poder/.test(q)) {
      return { txt: 'O grafo de influência está no Painel Parlamentar — visão geral do parlamento e dossiês ANJL e Vale (licenciamento). Caminho mínimo até o decisor, centralidade e coalizões.', sug: ['abrir parlamento'] };
    }
    if (/abrir parlamento/.test(q)) { location.href = 'parlamento.html'; return { txt: 'Abrindo…', sug: [] }; }

    // saudação / ajuda / fallback
    if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|e ai)\b/.test(q) || /quem es|o que sabes|ajuda|help|o que consegues/.test(q)) {
      return { txt: 'Sou o Agente Pilotis — respondo sobre o que a máquina já sustentou hoje: carteiras, movimentos, destaques, agenda do parlamento, prospectivas e a lógica de interesse de cada cliente. As decisões continuam tuas: triagem, prioridade e lobby.',
        sug: ['o que mudou hoje', 'destaques de hoje', 'agenda de hoje', 'atos de prioridade alta'] };
    }
    return { txt: 'Não tenho essa resposta na base local. Consigo ajudar com: movimentos por cliente, destaques, agenda, atos (ex.: "situação do PL 2989"), prospectivas, lógica de interesse e comissões.',
      sug: ['o que mudou hoje', 'situação do PL 2989', 'lógica da expedia'] };
  }

  // ── UI ────────────────────────────────────────────────────────────
  const css = `
  #agFab{position:fixed;right:22px;bottom:22px;width:54px;height:54px;border-radius:50%;background:#292B26;
    display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:80;border:1px solid rgba(27,108,57,.55);
    box-shadow:0 6px 22px rgba(41,43,38,.35);transition:transform .2s cubic-bezier(.2,.6,.2,1)}
  #agFab:hover{transform:translateY(-2px)}
  #agPanel{position:fixed;right:22px;bottom:88px;width:min(390px,92vw);max-height:min(560px,72vh);background:#292B26;
    color:#F4F2ED;border-radius:16px;z-index:81;display:none;flex-direction:column;overflow:hidden;
    border:1px solid rgba(27,108,57,.45);box-shadow:0 14px 44px rgba(41,43,38,.5);font-family:var(--sans)}
  #agPanel.on{display:flex;animation:agUp .24s cubic-bezier(.2,.6,.2,1)}
  @keyframes agUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  #agHead{padding:14px 18px;border-bottom:1px solid rgba(244,242,237,.1);display:flex;align-items:center;gap:10px}
  #agHead .k{font-family:var(--mono);font-size:10px;color:#4f9c6a;letter-spacing:.16em}
  #agHead .s{font-size:10.5px;color:#8f9188}
  #agMsgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .agm{max-width:88%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}
  .agm.bot{background:#32342e;border:1px solid rgba(244,242,237,.07);align-self:flex-start;border-bottom-left-radius:4px}
  .agm.usr{background:#1B6C39;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
  #agSugs{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px}
  #agSugs span{font-family:var(--mono);font-size:10px;border:1px solid rgba(79,156,106,.55);color:#a9cdb6;
    border-radius:999px;padding:4px 10px;cursor:pointer}
  #agSugs span:hover{background:rgba(27,108,57,.3)}
  #agIn{display:flex;gap:8px;padding:12px 14px;border-top:1px solid rgba(244,242,237,.1)}
  #agIn input{flex:1;background:#32342e;border:1px solid rgba(244,242,237,.12);border-radius:9px;color:#F4F2ED;
    padding:10px 12px;font-family:var(--sans);font-size:13px;outline:none}
  #agIn input:focus{border-color:#1B6C39}
  #agIn button{background:#1B6C39;border:none;color:#fff;border-radius:9px;padding:0 16px;cursor:pointer;font-weight:600}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.id = 'agFab';
  fab.title = 'Agente Pilotis';
  fab.innerHTML = window.cobogoSVG ? cobogoSVG(30, true) : '◈';
  const panel = document.createElement('div');
  panel.id = 'agPanel';
  panel.innerHTML = `
    <div id="agHead">${window.cobogoSVG ? cobogoSVG(24, true) : ''}
      <div><div class="k">AGENTE PILOTIS</div><div class="s">local · sobre os dados de hoje · as decisões são tuas</div></div></div>
    <div id="agMsgs"></div>
    <div id="agSugs"></div>
    <div id="agIn"><input id="agTxt" placeholder="pergunta sobre carteira, agenda, atos…" autocomplete="off">
      <button id="agGo">→</button></div>`;
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const msgs = panel.querySelector('#agMsgs');
  const sugs = panel.querySelector('#agSugs');
  const input = panel.querySelector('#agTxt');

  function add(cls, txt) {
    const d = document.createElement('div');
    d.className = 'agm ' + cls;
    d.textContent = txt;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function renderSugs(list) {
    sugs.innerHTML = (list || []).map(s => `<span>${s}</span>`).join('');
    sugs.querySelectorAll('span').forEach(el => el.onclick = () => enviar(el.textContent));
  }
  function enviar(txt) {
    const t = (txt || input.value || '').trim();
    if (!t) return;
    input.value = '';
    add('usr', t);
    const { txt: r, sug } = responder(t);
    setTimeout(() => { add('bot', r); renderSugs(sug); }, 220);
  }
  fab.onclick = () => {
    panel.classList.toggle('on');
    if (panel.classList.contains('on') && !msgs.children.length) {
      const u = (window.sessao && sessao.get()) || { nome: 'Consultor' };
      add('bot', `${u.nome.split(' ')[0]}, a máquina já varreu as duas casas hoje. Pergunta o que precisares — ou usa um atalho abaixo.`);
      renderSugs(['o que mudou hoje', 'destaques de hoje', 'agenda de hoje', 'tarefas pendentes']);
    }
    if (panel.classList.contains('on')) input.focus();
  };
  panel.querySelector('#agGo').onclick = () => enviar();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); });
})();
