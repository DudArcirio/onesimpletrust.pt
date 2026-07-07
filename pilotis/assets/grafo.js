/* Grafo Pilotis — painel parlamentar dinâmico.
   Contexto por filtros: cliente → vetores temáticos → ato → comissão.
   Sem filtros: parlamento inteiro (pessoas + partidos) em force-directed.
   Dados: PILOTIS_PARLAMENTO (593 parlamentares, votos PL 2159), PILOTIS (carteiras), PILOTIS_COMISSOES. */
window.PilotisGrafo = (function () {
  const CORES = {
    luz: '#F4F2ED', grafite: '#292B26', verde: '#1B6C39', verdeCl: '#4F9C6A',
    sinal: '#C0663B', surface: '#E7E3DA', mut: '#8f9188', link: 'rgba(220,231,223,.22)',
  };
  const POL_COR = { oportunidade: CORES.verdeCl, ameaca: CORES.sinal, defensivo: '#7d8a77', tributario: '#b08968', monitorar: '#6a6d64' };
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const limpaNome = (s) => norm((s || '').replace(/^(senador|senadora|deputado|deputada)( federal)?\s*/i, '').replace(/\(.*\)/, ''));

  const BASE = window.PILOTIS_PARLAMENTO || { nodes: [], belongs: [] };
  const PESSOAS = BASE.nodes.filter(n => n.type === 'Person');
  const PARTIDOS = BASE.nodes.filter(n => n.type === 'Organization');
  const porNome = new Map(PESSOAS.map(p => [limpaNome(p.name), p]));
  const COMS = (window.PILOTIS_COMISSOES || { comissoes: [] }).comissoes;
  const CLIENTES = (window.PILOTIS || { clientes: [] }).clientes;

  // paleta categórica p/ 22 partidos (tons compatíveis com o palco grafite)
  const PAL = ['#4F9C6A', '#8FB99B', '#C8A96E', '#5B8DB3', '#B08968', '#7d8a77', '#D3CEC3',
               '#9C8AA5', '#6FA8A0', '#C0663B', '#A9B8A2', '#748CAB', '#BBA588', '#86A17D',
               '#C9B1BD', '#7FA0B0', '#94856F', '#A6C3B1', '#8E9AAF', '#B5C99A', '#CBB9A8', '#6a6d64'];
  const corPartido = (() => { const m = new Map(); let i = 0; return (sig) => { if (!m.has(sig)) m.set(sig, PAL[i++ % PAL.length]); return m.get(sig); }; })();
  const corPosicao = (p) => /a favor/i.test(p || '') ? CORES.verdeCl : /contra/i.test(p || '') ? CORES.sinal : '#6a6d64';
  const corCasa = (c) => c === 'Senado' ? '#8FB99B' : '#4F9C6A';

  const MOTRIZES_METODO = (BASE.motrizes || []).map(m => ({ ...m }));  // cf/stf/rep/esg — heurística de influência
  const LIMIAR_MOTRIZ = 2.6;  // legibilidade com 593 nós
  const S = { cliente: '', vetores: new Set(), motrizes: new Set(), ato: '', comissao: '', partido: '',
              busca: '', casas: new Set(['Câmara', 'Senado']), cor: 'partido', layout: 'force' };
  let svg, g, sim, palcoEl, W, H, nodeSel, linkSel, labSel;

  // ── montagem do grafo por contexto ─────────────────────────────────
  function cliAtual() { return CLIENTES.find(c => c.slug === S.cliente); }
  function atosDoContexto(cli, ignoraAto) {
    let atos = cli ? cli.carteira.filter(p => p.estado !== 'descartado') : [];
    if (S.vetores.size) {
      const rot = new Set([...S.vetores]);
      atos = atos.filter(p => (p.cats || []).some(c => rot.has(c)));
    }
    if (S.comissao && !ignoraAto) atos = atos.filter(p => (p.orgao || '').toUpperCase() === S.comissao);
    if (S.ato && !ignoraAto) atos = atos.filter(p => p.id === S.ato);
    return atos;
  }
  function membrosDaComissao(sigla) {
    const c = COMS.find(x => x.sigla === sigla);
    if (!c) return [];
    return c.membros.filter(m => !/suplente/i.test(m.cargo || ''));
  }

  function build() {
    const nodes = [], links = [], idx = new Map();
    const add = (n) => { if (!idx.has(n.id)) { idx.set(n.id, n); nodes.push(n); } return idx.get(n.id); };
    const liga = (a, b, tipo, forca) => links.push({ source: a, target: b, tipo, forca: forca || 1 });
    const cli = cliAtual();
    const casaOk = (p) => S.casas.has(p.metadata.casa) && (!S.partido || p.metadata.partido === S.partido);

    const addPessoa = (p, extra) => add({
      id: p.uid, tipo: 'pessoa', nome: p.name, r: 5.5,
      partido: p.metadata.partido, casa: p.metadata.casa, uf: p.metadata.uf,
      posicao: p.metadata.posicao, comissoes: p.metadata.comissoes || [], ...extra });
    const addPartido = (sig) => add({ id: 'P_' + sig, tipo: 'partido', nome: sig, r: 11 });
    const addComissao = (sig) => {
      const c = COMS.find(x => x.sigla === sig) || {};
      return add({ id: 'C_' + sig, tipo: 'comissao', nome: sig, nomeLongo: c.nome || sig, r: 13 });
    };

    if (!cli && !S.comissao) {
      // DEFAULT: parlamento inteiro
      PESSOAS.filter(casaOk).forEach(p => addPessoa(p));
      PARTIDOS.forEach(pt => addPartido(pt.name));
      BASE.belongs.forEach(b => {
        if (idx.has(b.source_uid) && idx.has(b.target_uid)) liga(b.source_uid, b.target_uid, 'partido', .35);
      });
      // motrizes do método (influência heurística por parlamentar) quando marcadas
      MOTRIZES_METODO.filter(m => S.motrizes.has(m.name)).forEach(m => {
        add({ id: m.uid, tipo: 'vetor', nome: m.name, r: 12 });
        PESSOAS.filter(casaOk).forEach(p => {
          const v = (p.metadata.influencia || {})[m.key] || 0;
          if (v >= LIMIAR_MOTRIZ) liga(p.uid, m.uid, 'influencia', Math.min((v - LIMIAR_MOTRIZ) * 2 + .3, 1));
        });
      });
      const comLink = new Set(links.map(l => l.target));
      return { nodes: nodes.filter(n => n.tipo !== 'partido' || comLink.has(n.id)), links };
    }

    if (cli) {
      const nCli = add({ id: 'CLI', tipo: 'cliente', nome: cli.nome.split(' (')[0], r: 22 });
      const vets = Object.values(cli.logica.categorias).map(v => v.rotulo)
        .filter(r => !S.vetores.size || S.vetores.has(r));
      vets.forEach(v => { add({ id: 'V_' + v, tipo: 'vetor', nome: v, r: 9 }); liga('CLI', 'V_' + v, 'tese', .8); });
      // cap de legibilidade: sem ato selecionado, mostra os top por score (o dropdown tem todos)
      const CAP_ATOS = 40;
      let atos = atosDoContexto(cli);
      let ocultos = 0;
      if (!S.ato && atos.length > CAP_ATOS) {
        atos = [...atos].sort((x, y) => (y.score || 0) - (x.score || 0)).slice(0, CAP_ATOS);
        ocultos = atosDoContexto(cli).length - CAP_ATOS;
      }
      if (ocultos) setTimeout(() => {
        const el = document.getElementById('ctxinfo');
        if (el && !el.innerHTML.includes('ocultos')) el.innerHTML += ` &nbsp;·&nbsp; top ${CAP_ATOS} por score (+${ocultos} no dropdown de atos)`;
      }, 50);
      atos.forEach(a => {
        const nA = add({ id: a.id, tipo: 'ato', nome: a.rotulo, r: S.ato === a.id ? 16 : 10,
                         polaridade: a.polaridade, ementa: a.ementa, prioridade: a.prioridade || a.sugestao,
                         orgao: a.orgao, situacao: a.situacao, fixo: S.ato === a.id });
        (a.cats || []).forEach(cat => { if (idx.has('V_' + cat)) liga(a.id, 'V_' + cat, 'tema', .7); });
        if (!(a.cats || []).some(c => idx.has('V_' + c))) liga('CLI', a.id, 'carteira', .5);
        const org = (a.orgao || '').toUpperCase();
        if (org) { addComissao(org); liga(a.id, 'C_' + org, 'tramita', .8); }
        // autor / relator no dataset
        const au = porNome.get(limpaNome(a.autor));
        if (au && casaOk(au)) { addPessoa(au, { papel: 'autor' }); liga(au.uid, a.id, 'autor', .9); }
      });
      // comissão explícita mesmo sem atos nela
      if (S.comissao) { addComissao(S.comissao); }
      // membros: quando há ato selecionado OU comissão selecionada
      const comFoco = S.comissao || (S.ato && (atos[0] || {}).orgao ? (atos[0].orgao || '').toUpperCase() : '');
      if (comFoco && idx.has('C_' + comFoco)) {
        membrosDaComissao(comFoco).forEach(m => {
          const p = porNome.get(limpaNome(m.nome));
          if (p && casaOk(p)) {
            addPessoa(p, { papel: norm(m.cargo).includes('president') ? 'presidente' : 'membro' });
            liga(p.uid, 'C_' + comFoco, 'membro', .4);
          }
        });
      }
      // partidos das pessoas presentes
      nodes.filter(n => n.tipo === 'pessoa').forEach(n => {
        if (n.partido) { addPartido(n.partido); liga(n.id, 'P_' + n.partido, 'partido', .25); }
      });
      return { nodes, links };
    }

    // comissão sem cliente: membros + partidos + atos de qualquer carteira nesse órgão
    addComissao(S.comissao);
    membrosDaComissao(S.comissao).forEach(m => {
      const p = porNome.get(limpaNome(m.nome));
      if (p && casaOk(p)) {
        addPessoa(p, { papel: norm(m.cargo).includes('president') ? 'presidente' : 'membro' });
        liga(p.uid, 'C_' + S.comissao, 'membro', .4);
        if (p.metadata.partido) { addPartido(p.metadata.partido); liga(p.uid, 'P_' + p.metadata.partido, 'partido', .2); }
      }
    });
    (window.PILOTIS.kanban || []).filter(a => (a.orgao || '').toUpperCase() === S.comissao && a.estado !== 'novo')
      .forEach(a => {
        add({ id: a.id, tipo: 'ato', nome: a.rotulo, r: 10, polaridade: a.polaridade,
              ementa: a.ementa, prioridade: a.prioridade || a.sugestao, orgao: a.orgao, situacao: a.situacao });
        liga(a.id, 'C_' + S.comissao, 'tramita', .8);
      });
    return { nodes, links };
  }

  // ── render ─────────────────────────────────────────────────────────
  function corDo(n) {
    if (n.tipo === 'pessoa') {
      if (n.papel === 'presidente' || n.papel === 'autor') return CORES.sinal;
      return S.cor === 'casa' ? corCasa(n.casa) : corPartido(n.partido);
    }
    if (n.tipo === 'partido') return CORES.surface;
    if (n.tipo === 'vetor') return CORES.verdeCl;
    if (n.tipo === 'ato') return POL_COR[n.polaridade] || '#6a6d64';
    if (n.tipo === 'comissao') return '#C8A96E';
    if (n.tipo === 'cliente') return CORES.luz;
    return CORES.mut;
  }
  const simbolo = { pessoa: d3.symbolCircle, partido: d3.symbolSquare, vetor: d3.symbolDiamond,
                    ato: d3.symbolSquare, comissao: d3.symbolWye, cliente: d3.symbolCircle };

  function render() {
    const { nodes, links } = build();
    g.selectAll('*').remove();

    linkSel = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => d.tipo === 'autor' ? CORES.sinal : d.tipo === 'tema' || d.tipo === 'tese' ? 'rgba(79,156,106,.5)' : d.tipo === 'influencia' ? 'rgba(79,156,106,.28)' : CORES.link)
      .attr('stroke-width', d => d.tipo === 'autor' || d.tipo === 'tramita' ? 1.6 : 1)
      .attr('stroke-dasharray', d => d.tipo === 'autor' ? '5 3' : null);

    nodeSel = g.append('g').selectAll('path').data(nodes).join('path')
      .attr('d', d => d3.symbol().type(simbolo[d.tipo] || d3.symbolCircle).size(d.r * d.r * 3.6)())
      .attr('fill', corDo)
      .attr('stroke', d => d.tipo === 'cliente' ? CORES.verde : d.fixo ? CORES.luz : 'rgba(41,43,38,.65)')
      .attr('stroke-width', d => d.tipo === 'cliente' ? 3 : d.fixo ? 2 : .8)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); }))
      .on('click', (e, d) => detalhe(d));

    const comLabel = nodes.filter(n => n.tipo !== 'pessoa' || nodes.length <= 90 || n.papel);
    labSel = g.append('g').selectAll('text').data(comLabel).join('text')
      .text(d => d.tipo === 'ato' ? d.nome.replace(' (SF)', '') : d.nome)
      .attr('font-family', "'JetBrains Mono',monospace")
      .attr('font-size', d => d.tipo === 'pessoa' ? 8 : d.tipo === 'cliente' ? 12 : 9.5)
      .attr('font-weight', d => d.tipo === 'pessoa' ? 400 : 700)
      .attr('fill', d => d.tipo === 'pessoa' ? '#cfccc2' : CORES.luz)
      .attr('text-anchor', 'middle').attr('pointer-events', 'none');

    // simulação — contenção suave no palco real (sem clamp na borda)
    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d =>
        ({ partido: 46, membro: 60, tema: 115, tese: 150, tramita: 90, autor: 70, carteira: 110, influencia: 200 })[d.tipo] || 70)
        .strength(d => d.forca * .5))
      .force('charge', d3.forceManyBody().strength(nodes.length > 300 ? -22 : -140).distanceMax(460))
      .force('collide', d3.forceCollide(d => d.tipo === 'vetor' ? d.r + 26 : d.r + 3.5))
      .force('cx', d3.forceX(() => W / 2).strength(.045))
      .force('cy', d3.forceY(() => H / 2).strength(.06));
    aplicaLayout(nodes, false);

    sim.on('tick', () => {
      linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
             .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
      labSel.attr('x', d => d.x).attr('y', d => d.y - d.r - 5);
    });

    // pin do nó cliente / ato focal no centro
    nodes.forEach(n => { if (n.tipo === 'cliente' || n.fixo) { n.fx = W / 2; n.fy = H / 2; } });
    if (nodes.some(n => n.tipo === 'cliente') && nodes.some(n => n.fixo)) {
      nodes.forEach(n => { if (n.tipo === 'cliente') { n.fx = W * 0.28; n.fy = H / 2; } });
    }
    aplicaBusca();
    info(nodes, links);
  }

  // layout estruturado (radial por partido/tipo) — vivo: força posicional, mantém drag e transição
  function aplicaLayout(nodes, reheat) {
    nodes = nodes || sim.nodes();
    if (S.layout === 'radial') {
      const partidos = [...new Set(nodes.filter(n => n.tipo === 'partido').map(n => n.nome))].sort();
      const ang = new Map(partidos.map((p, i) => [p, (i / Math.max(partidos.length, 1)) * 2 * Math.PI - Math.PI / 2]));
      const R = Math.min(W, H) * 0.34;
      sim.force('rx', d3.forceX(d => {
        if (d.tipo === 'partido') return W / 2 + R * Math.cos(ang.get(d.nome) || 0);
        if (d.tipo === 'pessoa' && ang.has(d.partido)) return W / 2 + (R + 62) * Math.cos(ang.get(d.partido));
        return W / 2;
      }).strength(d => d.tipo === 'pessoa' || d.tipo === 'partido' ? .28 : .05));
      sim.force('ry', d3.forceY(d => {
        if (d.tipo === 'partido') return H / 2 + R * Math.sin(ang.get(d.nome) || 0);
        if (d.tipo === 'pessoa' && ang.has(d.partido)) return H / 2 + (R + 62) * Math.sin(ang.get(d.partido));
        return H / 2;
      }).strength(d => d.tipo === 'pessoa' || d.tipo === 'partido' ? .28 : .05));
    } else {
      sim.force('rx', null).force('ry', null);
    }
    if (reheat) sim.alpha(.7).restart();
  }

  function aplicaBusca() {
    const q = norm(S.busca);
    if (!nodeSel) return;
    nodeSel.attr('opacity', d => !q || norm(d.nome).includes(q) ? 1 : .13);
    labSel.attr('opacity', d => !q || norm(d.nome).includes(q) ? 1 : .1);
    linkSel.attr('opacity', q ? .25 : 1);
    if (q) {
      const alvo = sim.nodes().find(d => d.tipo === 'pessoa' && norm(d.nome).includes(q));
      if (alvo) detalhe(alvo);
    }
  }

  function detalhe(d) {
    const el = document.getElementById('detalhe');
    let h = `<span class="fech" onclick="this.parentElement.style.display='none'">×</span>`;
    if (d.tipo === 'pessoa') {
      const base = PESSOAS.find(p => p.uid === d.id) || { metadata: {} };
      const m = base.metadata || {};
      const inf = m.influencia || {};
      const bar = (l, v) => `<div class="blab"><span>${l}</span><span style="color:#4F9C6A">${(v || 0).toFixed(1)}</span></div>
        <div class="bar"><span style="width:${Math.round((v || 0) / 3 * 100)}%"></span></div>`;
      h += `${m.foto ? `<img src="${m.foto}" onerror="this.style.display='none'">` : ''}
        <b style="font-size:14px">${d.nome}</b>
        <div class="mono" style="margin-top:2px">${d.casa || ''} · mandato em exercício</div>
        <div style="margin-top:6px">
          <span class="badge" style="background:${corPartido(d.partido)};color:#1d1f1a">${d.partido || '—'}/${d.uf || ''}</span>
          ${d.papel ? `<span class="badge" style="background:${CORES.sinal};color:#fff">${d.papel}</span>` : ''}
          ${m.relator ? `<span class="badge" style="background:${CORES.luz};color:#1d1f1a">relator</span>` : ''}
        </div>
        <div class="rot">Posição declarada (PL 2159/2021)</div>
        <span class="badge" style="background:${corPosicao(d.posicao)};color:#fff">${d.posicao || '—'}</span>
        <div class="rot">Comissões</div>
        <div>${(d.comissoes || []).join(' · ') || '—'}</div>
        <div class="rot">Influência por motriz</div>
        ${bar('Competência federativa', inf.cf)}${bar('Constitucionalidade / STF', inf.stf)}
        ${bar('Pressão reputacional', inf.rep)}${bar('Agenda internacional · ESG', inf.esg)}
        <div class="nota">Posição = voto nominal real no PL 2159/2021. Influência = heurística
        (base + voto + comissões-chave + relatoria). Sempre dado público — nunca perfil privado.</div>`;
    } else if (d.tipo === 'ato') {
      h += `<b>${d.nome}</b><div class="mono">${d.prioridade || ''} · ${d.polaridade || ''} · ${d.orgao || ''}</div>
        <div style="margin-top:6px">${(d.ementa || '').slice(0, 160)}…</div>
        <div class="mono" style="margin-top:6px">${(d.situacao || '').slice(0, 80)}</div>`;
    } else if (d.tipo === 'comissao') {
      h += `<b>${d.nome}</b><div style="margin-top:4px">${d.nomeLongo || ''}</div>`;
    } else {
      h += `<b>${d.nome}</b><div class="mono">${d.tipo}</div>`;
    }
    el.innerHTML = h;
    el.style.display = 'block';
  }

  function info(nodes, links) {
    const np = nodes.filter(n => n.tipo === 'pessoa').length;
    const partes = [`<b>${np}</b> parlamentares`];
    const na = nodes.filter(n => n.tipo === 'ato').length;
    if (na) partes.push(`<b>${na}</b> atos`);
    const nc = nodes.filter(n => n.tipo === 'comissao').length;
    if (nc) partes.push(`<b>${nc}</b> comissões`);
    partes.push(`<b>${links.length}</b> relações`);
    const ctx = [cliAtual() && cliAtual().nome.split(' (')[0], [...S.vetores].join('+') || null,
                 S.ato && (sim.nodes().find(n => n.id === S.ato) || {}).nome, S.comissao].filter(Boolean).join(' · ');
    document.getElementById('ctxinfo').innerHTML = partes.join(' &nbsp; ') + (ctx ? ` &nbsp;·&nbsp; contexto: ${ctx}` : '');
    legenda(nodes);
  }

  function legenda(nodes) {
    const L = [];
    if (S.cor === 'casa') {
      L.push(`<div><span style="background:#4F9C6A"></span>Câmara</div>`, `<div><span style="background:#8FB99B"></span>Senado</div>`);
    } else {
      L.push(`<div><span style="background:${CORES.verdeCl}"></span>Parlamentar (cor por partido)</div>`);
    }
    L.push(`<div><span class="sq" style="background:${CORES.surface}"></span>Partido</div>`);
    if (nodes.some(n => n.tipo === 'vetor')) L.push(`<div><span class="di" style="background:${CORES.verdeCl}"></span>Vetor temático</div>`);
    if (nodes.some(n => n.tipo === 'ato')) L.push(`<div><span class="sq" style="background:${POL_COR.ameaca}"></span>Ato (cor = vetor de postura)</div>`);
    if (nodes.some(n => n.tipo === 'comissao')) L.push(`<div><span style="background:#C8A96E"></span>Comissão</div>`);
    if (nodes.some(n => n.papel)) L.push(`<div><span style="background:${CORES.sinal}"></span>Autor / presidência (destaque)</div>`);
    document.getElementById('legenda').innerHTML = L.join('');
  }

  // ── filtros contextuais (dropdowns encadeados) ─────────────────────
  function montaFiltros() {
    const selC = document.getElementById('fCliente');
    CLIENTES.forEach(c => selC.insertAdjacentHTML('beforeend', `<option value="${c.slug}">${c.nome}</option>`));
    const selCom = document.getElementById('fComissao');

    function refazVetores() {
      const cont = document.getElementById('fVetores');
      const cli = cliAtual();
      document.getElementById('labVet').textContent = cli ? 'Variável motriz · vetores do cliente' : 'Variável motriz · método';
      if (cli) {
        // vetores temáticos da lógica do cliente
        cont.innerHTML = Object.values(cli.logica.categorias).map(v =>
          `<span class="chp ${v.polaridade === 'ameaca' ? 'sin' : ''} ${S.vetores.has(v.rotulo) ? 'on' : ''}" data-v="${v.rotulo}">${v.rotulo}</span>`).join('');
        cont.querySelectorAll('.chp').forEach(ch => ch.onclick = () => {
          const v = ch.dataset.v;
          S.vetores.has(v) ? S.vetores.delete(v) : S.vetores.add(v);
          ch.classList.toggle('on');
          S.ato = ''; refazAtos(); render();
        });
      } else {
        // motrizes do método (influência heurística sobre o parlamento inteiro)
        cont.innerHTML = MOTRIZES_METODO.map(m =>
          `<span class="chp ${S.motrizes.has(m.name) ? 'on' : ''}" data-m="${m.name}">${m.name}</span>`).join('');
        cont.querySelectorAll('.chp').forEach(ch => ch.onclick = () => {
          const m = ch.dataset.m;
          S.motrizes.has(m) ? S.motrizes.delete(m) : S.motrizes.add(m);
          ch.classList.toggle('on'); render();
        });
      }
    }
    function refazAtos() {
      const sel = document.getElementById('fAto');
      const cli = cliAtual();
      const salvo = S.ato;
      sel.innerHTML = '<option value="">— todos —</option>';
      if (cli) {
        atosDoContexto(cli, true).forEach(a =>
          sel.insertAdjacentHTML('beforeend', `<option value="${a.id}" ${a.id === salvo ? 'selected' : ''}>${a.rotulo} — ${(a.ementa || '').slice(0, 42)}…</option>`));
      } else {
        // sem cliente: todos os atos acompanhados (todas as carteiras)
        CLIENTES.forEach(c => c.carteira.filter(p => p.estado !== 'descartado').forEach(a =>
          sel.insertAdjacentHTML('beforeend', `<option value="${a.id}" ${a.id === salvo ? 'selected' : ''}>[${c.slug.toUpperCase()}] ${a.rotulo} — ${(a.ementa || '').slice(0, 36)}…</option>`)));
      }
    }
    function montaPartidos() {
      const sel = document.getElementById('fPartido');
      PARTIDOS.map(p => p.name).sort().forEach(sig =>
        sel.insertAdjacentHTML('beforeend', `<option value="${sig}">${sig}</option>`));
      sel.onchange = e => { S.partido = e.target.value; render(); };
    }
    function refazComissoes() {
      const cli = cliAtual();
      const atos = cli ? atosDoContexto(cli) : [];
      const relevantes = new Set(atos.map(a => (a.orgao || '').toUpperCase()).filter(Boolean));
      selCom.innerHTML = '<option value="">— todas —</option>';
      const lista = COMS.filter(c => !relevantes.size || true)
        .sort((a, b) => (relevantes.has(b.sigla) - relevantes.has(a.sigla)) || a.sigla.localeCompare(b.sigla));
      lista.forEach(c => selCom.insertAdjacentHTML('beforeend',
        `<option value="${c.sigla}" ${S.comissao === c.sigla ? 'selected' : ''}>${relevantes.has(c.sigla) ? '● ' : ''}${c.sigla} — ${(c.nome || '').replace('Comissão de ', '').slice(0, 44)}</option>`));
    }

    selC.onchange = e => { S.cliente = e.target.value; S.vetores.clear(); S.motrizes.clear(); S.ato = ''; refazVetores(); refazAtos(); refazComissoes(); render(); };
    document.getElementById('fAto').onchange = e => {
      S.ato = e.target.value;
      if (S.ato && !cliAtual()) {
        // ato escolhido sem cliente: assume o contexto do cliente dono
        const dono = CLIENTES.find(c => c.carteira.some(x => x.id === S.ato));
        if (dono) { S.cliente = dono.slug; document.getElementById('fCliente').value = dono.slug;
          S.vetores.clear(); refazVetores(); refazAtos(); }
      }
      if (S.ato) { const cli = cliAtual(); const a = cli && cli.carteira.find(x => x.id === S.ato);
        const org = a && (a.orgao || '').toUpperCase();
        if (org && COMS.some(x => x.sigla === org)) { S.comissao = org; refazComissoes(); } }
      render();
    };
    selCom.onchange = e => { S.comissao = e.target.value; render(); };
    document.getElementById('fBusca').oninput = e => { S.busca = e.target.value; aplicaBusca(); };
    document.querySelectorAll('[data-casa]').forEach(ch => ch.onclick = () => {
      const c = ch.dataset.casa;
      S.casas.has(c) ? S.casas.delete(c) : S.casas.add(c);
      ch.classList.toggle('on'); render();
    });
    document.querySelectorAll('#fCor .chp').forEach(ch => ch.onclick = () => {
      document.querySelectorAll('#fCor .chp').forEach(x => x.classList.remove('on'));
      ch.classList.add('on'); S.cor = ch.dataset.c;
      nodeSel && nodeSel.attr('fill', corDo); legenda(sim.nodes());
    });
    document.querySelectorAll('#fLay .chp').forEach(ch => ch.onclick = () => {
      document.querySelectorAll('#fLay .chp').forEach(x => x.classList.remove('on'));
      ch.classList.add('on'); S.layout = ch.dataset.l; aplicaLayout(null, true);
    });
    refazVetores(); refazAtos(); refazComissoes(); montaPartidos();
    return { refazVetores, refazAtos, refazComissoes };
  }

  // ── init ───────────────────────────────────────────────────────────
  function init(opts) {
    palcoEl = document.querySelector(opts.palco);
    W = palcoEl.clientWidth; H = palcoEl.clientHeight;
    svg = d3.select(opts.svg).attr('viewBox', null);
    g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([.25, 6]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('dblclick', () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity));
    new ResizeObserver(() => {
      W = palcoEl.clientWidth; H = palcoEl.clientHeight;
      if (sim) { sim.force('cx', d3.forceX(() => W / 2).strength(.045)).force('cy', d3.forceY(() => H / 2).strength(.06)); aplicaLayout(null, true); }
    }).observe(palcoEl);

    const refs = montaFiltros();
    // deep-link: ?ato=PL 2989/2026 → contexto do cliente dono do ato
    if (opts.ato) {
      for (const c of CLIENTES) {
        const a = c.carteira.find(x => x.rotulo.startsWith(opts.ato) || x.rotulo === opts.ato);
        if (a) {
          S.cliente = c.slug; S.ato = a.id;
          const org = (a.orgao || '').toUpperCase();
          if (org && COMS.some(x => x.sigla === org)) S.comissao = org;  // só permanentes entram no filtro
          document.getElementById('fCliente').value = c.slug;
          refs.refazVetores(); refs.refazAtos(); refs.refazComissoes();
          break;
        }
      }
    }
    if (opts.busca) { S.busca = opts.busca; document.getElementById('fBusca').value = opts.busca; }
    render();
  }

  return { init };
})();
