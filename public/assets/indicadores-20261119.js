/* Frango da Casa — módulo Indicadores (19/11/2026)
   Só leitura: lê os dados com a sessão já aberta e mostra indicadores por lote e lembretes de dívida.
   Não grava nem altera registos. */
(function(){
  'use strict';
  var API='https://viejdosreptdznbsllhv.supabase.co/functions/v1/aviario-web';
  var KEY='sb_publishable_kZVyoNGRTeat4DuiqJFmFA_s9vXj38a';
  var TEMPLATE_KEY='fx-lembrete-modelo';
  var DEFAULT_TEMPLATE='Olá {nome}, daqui fala o Frango da Casa. Lembramos que tem um saldo em aberto de {valor}, referente a {lotes} (compra mais antiga em {data}). Agradecemos o pagamento assim que possível. Qualquer dúvida, ligue 844 331 625. Obrigado!';
  var STATUS={criacao:'Em criação',vendas:'Em vendas',facturado:'Facturado',revisao:'Por confirmar',encerrado:'Encerrado'};

  /* ---------- utilitários ---------- */
  function sum(xs,f){var t=0;for(var i=0;i<xs.length;i++)t+=f(xs[i])||0;return t;}
  function money(n){return (n/100).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';}
  function money0(n){return Math.round(n/100).toLocaleString('pt-PT')+' MT';}
  function pct(n){return isFinite(n)?(n*100).toLocaleString('pt-PT',{maximumFractionDigits:1})+'%':'—';}
  function int(n){return Math.round(n).toLocaleString('pt-PT');}
  function day(s){return s?s.split('-').reverse().join('/'):'sem data';}
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function daysBetween(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function h(html){var t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}}

  function token(){
    try{
      for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
        if(/^sb-.*-auth-token$/.test(k)){var s=JSON.parse(localStorage.getItem(k));return s&&(s.access_token||(s.currentSession&&s.currentSession.access_token));}}
    }catch(e){}
    return null;
  }
  function load(){
    var t=token();
    if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    return fetch(API+'/farm',{headers:{Authorization:'Bearer '+t,apikey:KEY},credentials:'omit',cache:'no-store'})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Não foi possível ler os dados.');return j;});});
  }

  function loadExtra(){
    var t=token();
    if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    return fetch(API+'/extra',{headers:{Authorization:'Bearer '+t,apikey:KEY},credentials:'omit',cache:'no-store'})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Não foi possível ler os dados.');return j;});});
  }
  function postExtra(op){
    var t=token();
    if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    return fetch(API+'/extra',{method:'POST',headers:{Authorization:'Bearer '+t,apikey:KEY,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify({revision:extraData?extraData.revision:0,op:op})})
      .then(function(r){return r.json().then(function(j){if(!r.ok){var e=new Error(j.error||'Não foi possível guardar.');e.status=r.status;throw e;}return j;});});
  }
  var extraData=null;

  /* ---------- cálculos ---------- */
  function paidOf(d,saleId){return sum(d.payments.filter(function(p){return p.sale===saleId;}),function(p){return p.amount;});}

  function batchStats(d,b){
    var sales=d.sales.filter(function(s){return s.batch===b.id;});
    var prod=d.production.filter(function(p){return p.batch===b.id;});
    var exps=d.expenses.filter(function(e){return e.batch===b.id;});
    var sold=sum(sales,function(s){return s.quantity;});
    var deaths=sum(prod,function(p){return p.deaths;});
    var losses=sum(prod,function(p){return p.losses;});
    var gifts=sum(prod,function(p){return p.gifts;});
    var revenue=sum(sales,function(s){return s.amount;});
    var froz=sales.filter(function(s){return s.product==='congelado';}),frozen=sum(froz,function(s){return s.quantity;}),frozenRev=sum(froz,function(s){return s.amount;});
    var lostPays=d.payments.filter(function(p){return p.compensation==='perda'&&sales.some(function(s){return s.id===p.sale;});});
    var lost=sum(lostPays,function(p){return p.amount;});
    var received=sum(sales,function(s){return paidOf(d,s.id);})-lost;
    var feed=exps.filter(function(e){return /^ra[cç][aã]o/i.test(e.category||'');});
    var feedCost=sum(feed,function(e){return e.amount;});
    var feedQty=sum(feed,function(e){return e.quantity;});
    var cost=b.purchaseCost+sum(exps,function(e){return e.amount;});
    var balance=b.quantity-sold-deaths-losses-gifts;
    var avgPrice=sold?revenue/sold:0;
    var profit=revenue-cost;
    var ref=b.status==='encerrado'?null:today();
    var age=b.date&&ref?daysBetween(b.date,ref):null;
    var breakEven=avgPrice?Math.max(0,Math.ceil((cost-revenue)/avgPrice)):null;
    return {frozen:frozen,frozenRev:frozenRev,lost:lost,b:b,sold:sold,deaths:deaths,losses:losses,gifts:gifts,balance:balance,revenue:revenue,received:received,debt:revenue-received-lost,
      cost:cost,feedCost:feedCost,feedQty:feedQty,avgPrice:avgPrice,profit:profit,
      mortality:b.quantity?deaths/b.quantity:NaN,sellRate:b.quantity?sold/b.quantity:NaN,
      costPerBird:b.quantity?cost/b.quantity:NaN,costPerSold:sold?cost/sold:NaN,feedPerBird:b.quantity?feedCost/b.quantity:NaN,
      profitPerSold:sold?profit/sold:NaN,margin:revenue?profit/revenue:NaN,receivedRate:revenue?received/revenue:NaN,
      age:age,breakEven:breakEven};
  }

  function debtors(d){
    var by={},customers={};
    (d.customers||[]).forEach(function(c){customers[c.id]=c;});
    d.sales.forEach(function(s){
      var debt=s.amount-paidOf(d,s.id);if(debt<=0)return;
      var key=s.customerId||('n:'+(s.customer||'').trim().toLowerCase());
      var c=s.customerId&&customers[s.customerId];
      var g=by[key]||(by[key]={id:s.customerId||'',name:(c&&c.name)||s.customer||'Cliente',phone:(c&&c.phone)||'',number:c&&c.number,debt:0,sales:0,oldest:null,due:null,batches:{}});
      g.debt+=debt;g.sales++;
      if(s.date&&(!g.oldest||s.date<g.oldest))g.oldest=s.date;
      if(s.dueDate&&(!g.due||s.dueDate<g.due))g.due=s.dueDate;
      var b=d.batches.find(function(x){return x.id===s.batch;});g.batches[b?b.name:'lote']=1;
    });
    return Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return b.debt-a.debt;});
  }

  function waPhone(p){
    var digits=String(p||'').replace(/\D/g,'');
    if(digits.length===9&&/^[82]/.test(digits))return '258'+digits;
    if(digits.length===12&&digits.indexOf('258')===0)return digits;
    if(digits.length===14&&digits.indexOf('00258')===0)return digits.slice(2);
    return digits.length>=9?digits:'';
  }

  /* ---------- interface ---------- */
  var overlay,view='lotes',lastData=null;

  function tone(val,good,bad,higherIsBetter){
    if(!isFinite(val))return '';
    if(higherIsBetter)return val>=good?'good':val<bad?'bad':'warn';
    return val<=good?'good':val>bad?'bad':'warn';
  }

  function stat(label,value,cls,hint){
    return '<div class="fxi-stat '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+value+'</strong>'+(hint?'<small>'+hint+'</small>':'')+'</div>';
  }

  function birdBar(s){
    var q=s.b.quantity||1,parts=[['sold',s.sold,'Vendidas'],['dead',s.deaths,'Mortes'],['lost',s.losses+s.gifts,'Perdas e ofertas'],['left',Math.max(0,s.balance),'Saldo']];
    return '<div class="fxi-bar" role="img" aria-label="'+parts.map(function(p){return p[2]+': '+int(p[1]);}).join(', ')+'">'+
      parts.map(function(p){return p[1]>0?'<i class="'+p[0]+'" style="flex:'+p[1]/q+'" title="'+p[2]+': '+int(p[1])+'"></i>':'';}).join('')+'</div>'+
      '<div class="fxi-legend">'+parts.map(function(p){return '<span><b class="'+p[0]+'"></b>'+p[2]+' '+int(p[1])+'</span>';}).join('')+'</div>';
  }

  function renderLotes(d){
    var list=d.batches.filter(function(b){return b.quantity>0;}).map(function(b){return batchStats(d,b);})
      .sort(function(a,b){return (b.b.date||'').localeCompare(a.b.date||'');});
    if(!list.length)return '<div class="fxi-empty">Ainda não há lotes com aves registadas.</div>';
    var closed=list.filter(function(s){return s.b.status==='encerrado'&&s.sold>0;});
    var best=closed.slice().sort(function(a,b){return b.profitPerSold-a.profitPerSold;})[0];
    var allQ=sum(list,function(s){return s.b.quantity;}),allD=sum(list,function(s){return s.deaths;});
    var soldAll=sum(closed,function(s){return s.sold;});
    var avgProfit=soldAll?sum(closed,function(s){return s.profit;})/soldAll:NaN;
    var av=timeAverages(d);
    var head='<div class="fxi-summary">'+
      stat('Mortalidade média',pct(allD/allQ),tone(allD/allQ,.05,.1),int(allD)+' mortes em '+int(allQ)+' aves')+
      stat('Lucro por frango vendido',isFinite(avgProfit)?money(avgProfit):'—',isFinite(avgProfit)?(avgProfit>=0?'good':'bad'):'','média dos lotes encerrados')+
      stat('Melhor lote',best?esc(best.b.name):'—','',best?money(best.profitPerSold)+' de lucro por frango':'ainda sem lotes encerrados com vendas')+
      stat('Até à 1.ª venda',av.toFirst!==null?'dia '+int(av.toFirst):'—','',av.toFirst!==null?'média · dia 1 = chegada ao aviário':'falta a data de chegada dos lotes')+
      stat('Duração média do lote',daysLabel(av.duration),'',av.duration!==null?'da chegada ao encerramento':'falta chegada e encerramento')+
      '</div>';
    var cards=list.map(function(s){
      var b=s.b,st=STATUS[b.status]||b.status,tl=timeline(d,b);
      var note='';
      if(b.status!=='encerrado'&&s.profit<0&&s.breakEven!==null){
        note=s.breakEven<=s.balance
          ?'<p class="fxi-note">Faltam vender <b>'+int(s.breakEven)+'</b> frangos ao preço médio para cobrir os custos (há '+int(s.balance)+' em saldo).</p>'
          :'<p class="fxi-note bad">Mesmo vendendo os '+int(s.balance)+' frangos em saldo ao preço médio, o lote não cobre os custos actuais.</p>';
      } else if(b.status==='encerrado'&&s.balance>0){
        note='<p class="fxi-note bad">Lote encerrado com <b>'+int(s.balance)+'</b> aves sem destino registado (venda, morte, perda ou oferta). Os indicadores ficam mais certos depois de as registar.</p>';
      } else if(b.status!=='encerrado'&&s.sold===0){
        note='<p class="fxi-note">Custo até agora: <b>'+money(s.costPerBird)+'</b> por ave. Para não perder, o preço de venda médio tem de ficar acima deste valor.</p>';
      }
      return '<article class="fxi-card">'+
        '<header><div><h3>'+esc(b.name)+'</h3><p>'+(tl.waiting?'Facturado '+day(tl.invoiced)+' · <b>por levantar</b>':tl.arrival?'Chegou '+day(tl.arrival)+(tl.duration!==null?' · <b>'+daysLabel(tl.duration)+'</b>':tl.dayN!==null?' · <b>dia '+int(tl.dayN)+'</b>':''):'Facturado '+day(b.date))+'</p></div><span class="fxi-pill s-'+esc(b.status)+'">'+esc(st)+'</span></header>'+
        birdBar(s)+
        '<div class="fxi-grid">'+
          stat('Mortalidade',pct(s.mortality),tone(s.mortality,.05,.1))+
          stat('Vendidas',pct(s.sellRate),'',int(s.sold)+' de '+int(b.quantity)+(s.frozen?' · '+int(s.sold-s.frozen)+' vivos, '+int(s.frozen)+' congelados':''))+
          stat('Custo por ave',money(s.costPerBird),'','custo total '+money0(s.cost))+
          stat('Ração por ave',isFinite(s.feedPerBird)&&s.feedCost?money(s.feedPerBird):'—','',s.feedCost?money0(s.feedCost)+(s.feedQty?' · '+int(s.feedQty)+' un.':''):'sem despesas de ração')+
          stat('Preço médio',s.sold?money(s.avgPrice):'—','',s.sold?(s.frozen?(s.sold>s.frozen?'vivo '+money0((s.revenue-s.frozenRev)/(s.sold-s.frozen))+' · ':'')+'congelado '+money0(s.frozenRev/s.frozen):'receita '+money0(s.revenue)):'sem vendas')+
          stat('Lucro por frango',s.sold?money(s.profitPerSold):'—',s.sold?(s.profitPerSold>=0?'good':'bad'):'',s.sold?'margem '+pct(s.margin):'')+
          stat('Resultado',money(s.profit),s.profit>=0?'good':'bad')+
          stat('Recebido',s.revenue?pct(s.receivedRate):'—',s.revenue?tone(s.receivedRate,.95,.8,true):'',(s.debt>0?money0(s.debt)+' em dívida':'nada em dívida')+(s.lost?' · '+money0(s.lost)+' perdido':''))+
        '</div>'+note+lotTimeHtml(d,b,tl,av)+'</article>';
    }).join('');
    var rows=list.map(function(s){
      return '<tr><td>'+esc(s.b.name)+'</td><td>'+esc(STATUS[s.b.status]||s.b.status)+'</td><td class="n">'+int(s.b.quantity)+'</td><td class="n '+tone(s.mortality,.05,.1)+'">'+pct(s.mortality)+'</td><td class="n">'+money(s.costPerBird)+'</td><td class="n">'+(s.sold?money(s.avgPrice):'—')+'</td><td class="n '+(s.sold?(s.profitPerSold>=0?'good':'bad'):'')+'">'+(s.sold?money(s.profitPerSold):'—')+'</td><td class="n '+(s.profit>=0?'good':'bad')+'">'+money(s.profit)+'</td></tr>';
    }).join('');
    return head+'<div class="fxi-cards">'+cards+'</div>'+
      '<section class="fxi-compare"><h3>Comparação entre lotes</h3><div class="fxi-scroll"><table><thead><tr><th>Lote</th><th>Estado</th><th class="n">Aves</th><th class="n">Mortalidade</th><th class="n">Custo por ave</th><th class="n">Preço médio</th><th class="n">Lucro por frango</th><th class="n">Resultado</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p class="fxi-foot">Custos = compra dos pintos + despesas registadas no lote. Salários e despesas gerais não entram aqui. Lucro por frango = resultado ÷ frangos vendidos.</p></section>';
  }

  function message(tpl,g){
    return tpl.replace(/\{nome\}/g,g.name)
      .replace(/\{valor\}/g,money(g.debt))
      .replace(/\{lotes\}/g,Object.keys(g.batches).join(', '))
      .replace(/\{data\}/g,day(g.oldest))
      .replace(/\{compras\}/g,String(g.sales));
  }

  function renderLembretes(d){
    var list=debtors(d),t=today();
    if(!list.length)return '<div class="fxi-empty">Nenhum cliente com dívida. 🎉</div>';
    var tpl=store(TEMPLATE_KEY)||DEFAULT_TEMPLATE;
    var total=sum(list,function(g){return g.debt;});
    var rows=list.map(function(g,i){
      var days=g.oldest?daysBetween(g.oldest,t):null;
      var overdue=g.due&&g.due<t;
      var ph=waPhone(g.phone);
      return '<tr><td><b>'+esc(g.name)+'</b>'+(g.number?'<small>CLI-'+String(g.number).padStart(4,'0')+'</small>':'')+'<small>'+esc(g.phone||'sem telefone')+'</small></td>'+
        '<td class="n bad">'+money(g.debt)+'</td><td>'+esc(Object.keys(g.batches).join(', '))+'<small>'+g.sales+(g.sales===1?' compra':' compras')+'</small></td>'+
        '<td>'+day(g.oldest)+(days!==null?'<small class="'+(days>30?'bad':days>7?'warn':'')+'">há '+days+' dias</small>':'')+(overdue?'<small class="bad">prazo passou a '+day(g.due)+'</small>':'')+'</td>'+
        '<td class="fxi-act">'+(ph?'<a class="fxi-wa" target="_blank" rel="noopener" data-i="'+i+'" href="#">WhatsApp</a>':'<span class="fxi-muted">Sem telefone</span>')+'</td></tr>';
    }).join('');
    return '<div class="fxi-summary">'+stat('Clientes com dívida',int(list.length))+stat('Total em dívida',money(total),'bad')+
      stat('Dívidas com mais de 30 dias',int(list.filter(function(g){return g.oldest&&daysBetween(g.oldest,t)>30;}).length),'warn')+'</div>'+
      '<section class="fxi-template"><label for="fxi-tpl">Mensagem do lembrete</label>'+
      '<textarea id="fxi-tpl" rows="3">'+esc(tpl)+'</textarea>'+
      '<p class="fxi-foot">Pode usar {nome}, {valor}, {lotes}, {data} e {compras}. O botão abre o WhatsApp com a mensagem pronta; só é enviada quando carregar em enviar. <button type="button" class="fxi-link" id="fxi-tpl-reset">Repor texto original</button></p></section>'+
      '<section class="fxi-compare"><div class="fxi-scroll"><table class="fxi-debts"><thead><tr><th>Cliente</th><th class="n">Em dívida</th><th>Lotes</th><th>Compra mais antiga</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }

  /* ---------- Criação (ração e peso) e stock de insumos ---------- */
  function num(n,dec){return isFinite(n)?Number(n).toLocaleString('pt-PT',{maximumFractionDigits:dec==null?1:dec}):'—';}
  function role(){return extraData&&extraData.access||{role:'member',permissions:{}};}
  function hasAny(list,ms){var a=role();if(a.role==='owner')return true;var xs=(a.permissions&&a.permissions[list])||[];return ms.some(function(m){return xs.indexOf(m)>=0;});}
  function canGrowth(){return hasAny('create',['production']);}
  function canMove(){return hasAny('create',['production','expenses']);}
  function canManage(){var a=role();return a.role==='owner'||a.role==='manager'&&hasAny('edit',['production','expenses']);}
  var criBatch='',flash='';
  function itemBalance(x,id){return sum(x.supplyMoves.filter(function(m){return m.item===id;}),function(m){return m.type==='consumo'?-m.qty:m.qty;});}
  function growthOf(x,b){return x.growth.filter(function(g){return g.batch===b;}).sort(function(a,b){return a.date.localeCompare(b.date)||0;});}
  function opts(list,sel){return list.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===sel?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');}
  function flashHtml(){if(!flash)return '';var f=flash;flash='';return '<div class="fxi-flash '+(f.bad?'bad':'')+'">'+esc(f.text)+'</div>';}

  function renderCriacao(d){
    var x=extraData.extra,t=extraData.today||today();
    var batches=d.batches.filter(function(b){return b.quantity>0;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
    if(!batches.length)return '<div class="fxi-empty">Ainda não há lotes.</div>';
    if(!criBatch||!batches.some(function(b){return b.id===criBatch;})){var open=batches.find(function(b){return b.status!=='encerrado';});criBatch=(open||batches[0]).id;}
    var b=batches.find(function(z){return z.id===criBatch;}),s=batchStats(d,b),gs=growthOf(x,b.id);
    var feed=sum(gs,function(g){return g.feedKg;});
    var weighed=gs.filter(function(g){return g.avgWeightKg>0;}),last=weighed[weighed.length-1];
    var alive=Math.max(0,s.balance),birds=alive+s.sold;
    var biomass=last?last.avgWeightKg*birds:0;
    var fcr=biomass>0&&feed>0?feed/biomass:NaN;
    var costKg=biomass>0?s.cost/biomass:NaN;
    var age=b.date?daysBetween(b.date,b.status==='encerrado'&&gs.length?gs[gs.length-1].date:t):null;
    var rows='',acc=0,prev=null;
    gs.forEach(function(g){
      acc+=g.feedKg;
      var ageAt=b.date?daysBetween(b.date,g.date):null,gain='—';
      if(g.avgWeightKg>0&&prev){var dd=daysBetween(prev.date,g.date);if(dd>0)gain=num((g.avgWeightKg-prev.avgWeightKg)*1000/dd,0)+' g/dia';}
      if(g.avgWeightKg>0)prev=g;
      rows+='<tr><td>'+day(g.date)+'</td><td class="n">'+(ageAt!==null?ageAt+' d':'—')+'</td><td class="n">'+(g.feedKg?num(g.feedKg)+' kg':'—')+'</td><td class="n">'+num(acc)+' kg</td><td class="n">'+(g.avgWeightKg?num(g.avgWeightKg*1000,0)+' g':'—')+'</td><td class="n">'+gain+'</td><td>'+esc(g.note||'')+'<small>'+esc(g.by||'')+'</small></td><td class="fxi-act">'+(canManage()?'<button type="button" class="fxi-link bad" data-del-growth="'+esc(g.id)+'">Apagar</button>':'')+'</td></tr>';
    });
    var items=x.supplyItems.filter(function(i){return i.active;});
    var form=canGrowth()?'<form class="fxi-form" id="fxi-growth-form"><h3>Novo registo da criação</h3><div class="fxi-fields">'+
      '<label>Data<input type="date" name="date" required max="'+t+'" value="'+t+'"></label>'+
      '<label>Ração consumida desde o último registo (kg)<input type="number" name="feedKg" min="0" step="0.1" inputmode="decimal"></label>'+
      '<label>Peso médio de uma amostra (g por ave)<input type="number" name="avgWeightG" min="0" step="1" inputmode="numeric"></label>'+
      '<label>Nota<input type="text" name="note" maxlength="300" placeholder="Ex.: pesadas 20 aves"></label>'+
      (items.length&&canMove()?'<label>Descontar do stock<select name="item"><option value="">Não descontar</option>'+opts(items.map(function(i){return [i.id,i.name+' ('+i.unit+')'];}),'')+'</select></label><label>Quantidade a descontar<input type="number" name="qty" min="0" step="0.01" inputmode="decimal"></label>':'')+
      '</div><div class="fxi-form-actions"><button type="submit" class="fxi-primary">Guardar registo</button><span class="fxi-muted">Indique a ração, o peso, ou os dois.</span></div></form>':'';
    return flashHtml()+'<div class="fxi-pick"><label>Lote <select id="fxi-cri-batch">'+opts(batches.map(function(z){return [z.id,z.name+' · '+(STATUS[z.status]||z.status)];}),criBatch)+'</select></label></div>'+
      '<div class="fxi-summary fxi-summary4">'+
        stat('Idade do lote',age!==null?age+' dias':'—','','entrada '+day(b.date))+
        stat('Peso médio',last?num(last.avgWeightKg*1000,0)+' g':'—','',last?'pesagem de '+day(last.date):'sem pesagens')+
        stat('Conversão alimentar',isFinite(fcr)?num(fcr,2):'—',isFinite(fcr)?tone(fcr,1.7,2.1):'',isFinite(fcr)?'kg de ração por kg de frango':'precisa de ração e peso')+
        stat('Custo por kg',isFinite(costKg)?money(costKg):'—','',isFinite(costKg)?'custo do lote ÷ peso estimado':'precisa de peso médio')+
      '</div>'+
      '<div class="fxi-summary fxi-summary4">'+
        stat('Ração registada',num(feed)+' kg','',gs.length+(gs.length===1?' registo':' registos'))+
        stat('Aves vivas',int(alive),'',int(s.sold)+' vendidas · '+int(s.deaths)+' mortes')+
        stat('Peso estimado',biomass?num(biomass,0)+' kg':'—','','aves vivas e vendidas × peso médio')+
        stat('Ração por ave',birds&&feed?num(feed/birds,2)+' kg':'—','','ração registada ÷ aves vivas e vendidas')+
      '</div>'+form+
      '<section class="fxi-compare"><h3>Registos da criação · '+esc(b.name)+'</h3><div class="fxi-scroll"><table><thead><tr><th>Data</th><th class="n">Idade</th><th class="n">Ração</th><th class="n">Ração acumulada</th><th class="n">Peso médio</th><th class="n">Ganho diário</th><th>Nota</th><th></th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="8" class="fxi-muted">Ainda não há registos para este lote.</td></tr>')+'</tbody></table></div>'+
      '<p class="fxi-foot">Conversão alimentar = ração registada ÷ (peso médio × aves vivas e vendidas). Quanto mais baixa, melhor; abaixo de 1,7 é bom para frango de corte. Valores aproximados: dependem de registar toda a ração e de pesar uma amostra de aves.</p></section>';
  }

  function renderStock(d){
    var x=extraData.extra,t=extraData.today||today();
    var items=x.supplyItems.slice().sort(function(a,b){return (b.active-a.active)||a.name.localeCompare(b.name);});
    var low=items.filter(function(i){return i.active&&itemBalance(x,i.id)<=i.minimum;});
    var rows=items.map(function(i){
      var ms=x.supplyMoves.filter(function(m){return m.item===i.id;});
      var inn=sum(ms.filter(function(m){return m.type==='entrada';}),function(m){return m.qty;}),out=sum(ms.filter(function(m){return m.type==='consumo';}),function(m){return m.qty;}),adj=sum(ms.filter(function(m){return m.type==='ajuste';}),function(m){return m.qty;});
      var bal=inn-out+adj,isLow=i.active&&bal<=i.minimum;
      return '<tr'+(i.active?'':' class="fxi-off"')+'><td><b>'+esc(i.name)+'</b>'+(i.active?'':'<small>inactivo</small>')+'</td><td>'+esc(i.unit)+'</td><td class="n">'+num(inn,2)+'</td><td class="n">'+num(out,2)+'</td><td class="n">'+(adj?num(adj,2):'—')+'</td><td class="n '+(isLow?'bad':'good')+'"><b>'+num(bal,2)+'</b></td><td class="n">'+num(i.minimum,2)+'</td><td>'+(isLow?'<span class="fxi-pill s-low">Repor</span>':'<span class="fxi-pill s-vendas">OK</span>')+'</td><td class="fxi-act">'+(canManage()?'<button type="button" class="fxi-link" data-edit-item="'+esc(i.id)+'">Editar</button>':'')+'</td></tr>';
    }).join('');
    var active=items.filter(function(i){return i.active;});
    var batches=d.batches.filter(function(b){return b.quantity>0;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
    var moveForm=canMove()&&active.length?'<form class="fxi-form" id="fxi-move-form"><h3>Novo movimento</h3><div class="fxi-fields">'+
      '<label>Insumo<select name="item" required>'+opts(active.map(function(i){return [i.id,i.name+' ('+i.unit+')'];}),'')+'</select></label>'+
      '<label>Tipo<select name="type"><option value="entrada">Entrada (compra)</option><option value="consumo">Consumo</option><option value="ajuste">Ajuste de contagem (+/−)</option></select></label>'+
      '<label>Quantidade<input type="number" name="qty" step="0.01" required inputmode="decimal"></label>'+
      '<label>Data<input type="date" name="date" required max="'+t+'" value="'+t+'"></label>'+
      '<label class="fxi-batch-field">Lote (consumo)<select name="batch"><option value="">Sem lote</option>'+opts(batches.filter(function(b){return b.status!=='encerrado';}).concat(batches.filter(function(b){return b.status==='encerrado';})).map(function(b){return [b.id,b.name];}),'')+'</select></label>'+
      '<label>Nota<input type="text" name="note" maxlength="300" placeholder="Ex.: fornecedor, factura"></label>'+
      '</div><div class="fxi-form-actions"><button type="submit" class="fxi-primary">Guardar movimento</button><span class="fxi-muted">As compras continuam a ser registadas como despesas; aqui conta-se a quantidade.</span></div></form>':'';
    var itemForm=canManage()?'<form class="fxi-form" id="fxi-item-form"><h3 id="fxi-item-title">Novo insumo</h3><input type="hidden" name="id"><div class="fxi-fields">'+
      '<label>Nome<input type="text" name="name" required maxlength="80" placeholder="Ex.: Ração inicial A1"></label>'+
      '<label>Unidade<input type="text" name="unit" required maxlength="20" placeholder="saco, kg, frasco"></label>'+
      '<label>Stock mínimo<input type="number" name="minimum" min="0" step="0.01" value="0" inputmode="decimal"></label>'+
      '<label class="fxi-check"><input type="checkbox" name="active" checked> Activo</label>'+
      '</div><div class="fxi-form-actions"><button type="submit" class="fxi-primary">Guardar insumo</button><button type="button" class="fxi-link" id="fxi-item-reset">Limpar</button></div></form>':'';
    var moves=x.supplyMoves.slice().sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,60).map(function(m){
      var i=x.supplyItems.find(function(z){return z.id===m.item;})||{name:'?',unit:''};
      var b=d.batches.find(function(z){return z.id===m.batch;});
      var label={entrada:'Entrada',consumo:'Consumo',ajuste:'Ajuste'}[m.type];
      return '<tr><td>'+day(m.date)+'</td><td>'+esc(i.name)+'</td><td>'+label+'</td><td class="n '+(m.type==='consumo'||m.qty<0?'bad':'good')+'">'+(m.type==='consumo'?'−':m.qty>0?'+':'')+num(Math.abs(m.qty),2)+' '+esc(i.unit)+'</td><td>'+(b?esc(b.name):'—')+'</td><td>'+esc(m.note||'')+'<small>'+esc(m.by||'')+'</small></td><td class="fxi-act">'+(canManage()&&!m.growthId?'<button type="button" class="fxi-link bad" data-del-move="'+esc(m.id)+'">Apagar</button>':'')+'</td></tr>';
    }).join('');
    var byBatch={};x.supplyMoves.filter(function(m){return m.type==='consumo'&&m.batch;}).forEach(function(m){var k=m.batch+'|'+m.item;byBatch[k]=(byBatch[k]||0)+m.qty;});
    var cons=Object.keys(byBatch).map(function(k){var p=k.split('|'),b=d.batches.find(function(z){return z.id===p[0];}),i=x.supplyItems.find(function(z){return z.id===p[1];});return [b?b.name:'?',i?i.name:'?',byBatch[k],i?i.unit:''];}).sort(function(a,b){return a[0].localeCompare(b[0])||a[1].localeCompare(b[1]);});
    return flashHtml()+
      (low.length?'<div class="fxi-flash bad">Abaixo do mínimo: '+low.map(function(i){return esc(i.name)+' ('+num(itemBalance(x,i.id),2)+' '+esc(i.unit)+')';}).join(', ')+'.</div>':'')+
      (items.length?'<section class="fxi-compare"><h3>Insumos e saldos</h3><div class="fxi-scroll"><table><thead><tr><th>Insumo</th><th>Unidade</th><th class="n">Entradas</th><th class="n">Consumos</th><th class="n">Ajustes</th><th class="n">Saldo</th><th class="n">Mínimo</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>':'<div class="fxi-empty">Ainda não há insumos. '+(canManage()?'Comece por criar os insumos (por exemplo, Ração inicial, Ração crescimento, Vacina Gumboro).':'O administrador tem de criar os insumos.')+'</div>')+
      moveForm+itemForm+
      (cons.length?'<section class="fxi-compare"><h3>Consumo por lote</h3><div class="fxi-scroll"><table><thead><tr><th>Lote</th><th>Insumo</th><th class="n">Consumido</th></tr></thead><tbody>'+cons.map(function(c){return '<tr><td>'+esc(c[0])+'</td><td>'+esc(c[1])+'</td><td class="n">'+num(c[2],2)+' '+esc(c[3])+'</td></tr>';}).join('')+'</tbody></table></div></section>':'')+
      (moves?'<section class="fxi-compare"><h3>Últimos movimentos</h3><div class="fxi-scroll"><table><thead><tr><th>Data</th><th>Insumo</th><th>Tipo</th><th class="n">Quantidade</th><th>Lote</th><th>Nota</th><th></th></tr></thead><tbody>'+moves+'</tbody></table></div></section>':'');
  }

  function saveOp(op,okText){
    var body=overlay.querySelector('.fxi-body');body.classList.add('fxi-busy');
    return postExtra(op).then(function(j){extraData.extra=j.extra;extraData.revision=j.revision;flash={text:okText};render();})
      .catch(function(e){
        if(e.status===409)return fetchExtra().then(function(){flash={text:'Os dados mudaram entretanto. Confira e repita.',bad:true};render();});
        flash={text:e.message,bad:true};render();
      }).then(function(){body.classList.remove('fxi-busy');});
  }
  function fld(f,n){return f.querySelector('[name="'+n+'"]');}
  function val(f,n){var el=fld(f,n);return el?String(el.value).trim():'';}
  function bindExtra(body,d){
    var sel=body.querySelector('#fxi-cri-batch');if(sel)sel.addEventListener('change',function(){criBatch=sel.value;render();});
    var gf=body.querySelector('#fxi-growth-form');
    if(gf)gf.addEventListener('submit',function(e){e.preventDefault();
      var op={kind:'growth.add',batch:criBatch,date:val(gf,'date'),feedKg:Number(val(gf,'feedKg')||0),avgWeightKg:Number(val(gf,'avgWeightG')||0)/1000,note:val(gf,'note')};
      if(val(gf,'item'))op.consume={item:val(gf,'item'),qty:Number(val(gf,'qty')||0)};
      saveOp(op,'Registo da criação guardado.');});
    body.querySelectorAll('[data-del-growth]').forEach(function(b){b.addEventListener('click',function(){
      if(b.dataset.armed){saveOp({kind:'growth.delete',id:b.dataset.delGrowth},'Registo apagado.');return;}
      b.dataset.armed='1';b.textContent='Confirmar';});});
    var mf=body.querySelector('#fxi-move-form');
    if(mf){
      var ty=fld(mf,'type'),bf=mf.querySelector('.fxi-batch-field');
      var sync=function(){bf.style.display=ty.value==='consumo'?'':'none';};ty.addEventListener('change',sync);sync();
      mf.addEventListener('submit',function(e){e.preventDefault();
        saveOp({kind:'supply.move',item:val(mf,'item'),type:val(mf,'type'),qty:Number(val(mf,'qty')),date:val(mf,'date'),batch:val(mf,'type')==='consumo'?val(mf,'batch'):'',note:val(mf,'note')},'Movimento guardado.');});
    }
    body.querySelectorAll('[data-del-move]').forEach(function(b){b.addEventListener('click',function(){
      if(b.dataset.armed){saveOp({kind:'supply.move.delete',id:b.dataset.delMove},'Movimento apagado.');return;}
      b.dataset.armed='1';b.textContent='Confirmar';});});
    var itf=body.querySelector('#fxi-item-form');
    if(itf){
      itf.addEventListener('submit',function(e){e.preventDefault();
        saveOp({kind:'supply.item',id:val(itf,'id')||undefined,name:val(itf,'name'),unit:val(itf,'unit'),minimum:Number(val(itf,'minimum')||0),active:fld(itf,'active').checked},'Insumo guardado.');});
      body.querySelector('#fxi-item-reset').addEventListener('click',function(){itf.reset();fld(itf,'id').value='';body.querySelector('#fxi-item-title').textContent='Novo insumo';});
      body.querySelectorAll('[data-edit-item]').forEach(function(b){b.addEventListener('click',function(){
        var i=extraData.extra.supplyItems.find(function(z){return z.id===b.dataset.editItem;});if(!i)return;
        fld(itf,'id').value=i.id;fld(itf,'name').value=i.name;fld(itf,'unit').value=i.unit;fld(itf,'minimum').value=i.minimum;fld(itf,'active').checked=i.active;
        body.querySelector('#fxi-item-title').textContent='Editar insumo · '+i.name;itf.scrollIntoView({behavior:'smooth',block:'center'});});});
    }
  }

  /* ---------- Fecho do dia (Visão geral › Fechos diários) ---------- */
  var closeState={at:0,loading:false};
  function closeData(){
    if(closeState.loading||Date.now()-closeState.at<15000)return;
    closeState.loading=true;
    fetchExtra().then(function(){closeState.loading=false;closeState.at=Date.now();closeUi(true);});
  }
  function closeUi(force){
    var headEl=document.querySelector('main .frango-daily-heading');if(!headEl)return;
    var input=headEl.querySelector('input[type=date]');if(!input)return;
    var box=headEl.parentNode.querySelector('.fx-close');
    if(!extraData){closeData();return;}
    var x=extraData.extra,owner=role().role==='owner',dt=input.value,closed=!!(x.closedUntil&&dt&&dt<=x.closedUntil);
    var key=[x.closedUntil,dt,owner].join('|');
    if(box&&box.dataset.k===key&&!force)return;
    if(!box){box=document.createElement('div');box.className='fx-close';headEl.parentNode.insertBefore(box,headEl.nextSibling);}
    box.dataset.k=key;
    box.className='fx-close'+(closed?' is-closed':'');
    box.innerHTML='<span class="fx-close-state">'+(closed?'🔒 O dia '+day(dt)+' está fechado.':'Dia '+day(dt)+' aberto.')+(x.closedUntil?' Fechado até <b>'+day(x.closedUntil)+'</b>.':' Ainda não há dias fechados.')+'</span>'+
      (owner&&dt?(closed?'<button type="button" class="mini-button" data-act="day.reopen">Reabrir este dia</button>':'<button type="button" class="mini-button fx-close-btn" data-act="day.close">Fechar o dia '+day(dt)+'</button>'):'')+
      '<small>'+(closed?'Os registos até esta data já não podem ser criados, alterados nem apagados.':'Depois de fechar, ninguém altera registos com data até este dia (inclusive) sem o administrador o reabrir.')+(owner&&!closed&&x.closedUntil&&dt>x.closedUntil?' Fecha também os dias anteriores ainda abertos.':'')+'</small><button type="button" class="fx-close-hist text-button">Ver histórico de fechos</button><span class="fx-close-msg"></span>';
    box.querySelector('.fx-close-hist').addEventListener('click',function(){open('fechos');});
    var btn=box.querySelector('button[data-act]');
    if(btn)btn.addEventListener('click',function(){
      if(!btn.dataset.armed){btn.dataset.armed='1';btn.textContent=btn.dataset.act==='day.close'?'Confirmar fecho até '+day(dt):'Confirmar reabertura';return;}
      btn.disabled=true;
      postExtra({kind:btn.dataset.act,date:dt}).then(function(j){extraData.extra=j.extra;extraData.revision=j.revision;closeUi(true);})
        .catch(function(e){btn.disabled=false;box.querySelector('.fx-close-msg').textContent=e.message;if(e.status===409)fetchExtra().then(function(){closeUi(true);});});
    });
  }

  /* ---------- Histórico de fechos ---------- */
  var ACC=[['standard','Standard Bank'],['emola','e-Mola'],['numerario','Numerário']];
  function addDay(d,n){var x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}
  function byAcc(xs){var o={standard:0,emola:0,numerario:0};xs.forEach(function(x){var a=x.account||'standard';o[a]=(o[a]||0)+x.amount;});return o;}
  function dayData(f,d){
    var sales=f.sales.filter(function(s){return s.date===d;});
    var paidBy=function(id){return sum(f.payments.filter(function(p){return p.sale===id&&p.date&&p.date<=d;}),function(p){return p.amount;});};
    var rec=f.payments.filter(function(p){return p.date===d&&!p.compensation;});
    var outs=f.expenses.filter(function(e){return e.date===d&&!e.compensationPayment;}).map(function(e){return {account:e.account,amount:e.amount,label:(e.category==='Salários'?'Salário · '+(e.employee||e.description):(e.description||e.category)),batch:e.batch};})
      .concat(f.batches.filter(function(b){return b.date===d&&b.purchaseCost>0;}).map(function(b){return {account:b.account,amount:b.purchaseCost,label:'Compra de pintos · '+b.name,batch:b.id};}))
      .concat((f.investments||[]).filter(function(i){return i.date===d;}).map(function(i){return {account:i.account,amount:i.amount,label:'Investimento · '+i.description,batch:''};}));
    return {date:d,salesList:sales,recList:rec,outList:outs,paidBy:paidBy,
      st:{sales:sales.length,birds:sum(sales,function(s){return s.quantity;}),salesAmount:sum(sales,function(s){return s.amount;}),received:sum(rec,function(p){return p.amount;}),receivedBy:byAcc(rec),
        compensated:sum(f.payments.filter(function(p){return p.date===d&&p.compensation;}),function(p){return p.amount;}),out:sum(outs,function(o){return o.amount;}),outBy:byAcc(outs),
        debtEnd:sum(sales,function(s){return Math.max(0,s.amount-paidBy(s.id));})}};
  }
  function rangeDays(f,from,to){var out=[];for(var d=from;d<=to;d=addDay(d,1)){var x=dayData(f,d);if(x.st.sales||x.st.received||x.st.out||x.st.compensated||d===to)out.push(x);}return out;}
  function totalOf(days){var t={sales:0,birds:0,salesAmount:0,received:0,receivedBy:{standard:0,emola:0,numerario:0},compensated:0,out:0,outBy:{standard:0,emola:0,numerario:0},debtEnd:0};
    days.forEach(function(x){var s=x.st||x;['sales','birds','salesAmount','received','compensated','out','debtEnd'].forEach(function(k){t[k]+=s[k]||0;});Object.keys(s.receivedBy||{}).forEach(function(k){t.receivedBy[k]=(t.receivedBy[k]||0)+s.receivedBy[k];});Object.keys(s.outBy||{}).forEach(function(k){t.outBy[k]=(t.outBy[k]||0)+s.outBy[k];});});return t;}
  function diffs(a,b){var out=[];[['salesAmount','Vendas'],['received','Recebido'],['out','Saídas'],['debtEnd','Dívida no fim do dia']].forEach(function(k){if((a[k[0]]||0)!==(b[k[0]]||0))out.push(k[1]+': '+money(a[k[0]]||0)+' → '+money(b[k[0]]||0));});return out;}
  function rangeLabel(from,to){return from===to?day(to):day(from)+' a '+day(to);}
  function when(iso){try{return new Date(iso).toLocaleString('pt-PT',{timeZone:'Africa/Maputo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return iso;}}

  function renderFechos(d){
    var x=extraData.extra,log=(x.closeLog||[]).slice();
    if(!log.length)return '<div class="fxi-empty">Ainda não há dias fechados. Feche um dia em Visão geral › Fechos diários das vendas.</div>';
    var owner=role().role==='owner',missing=log.some(function(e){return e.action==='fechar'&&!e.snap&&x.closedUntil&&e.date<=x.closedUntil;});
    var rows=log.map(function(e,i){
      if(e.action==='reabrir')return '<tr class="fxi-reopen"><td><b>'+day(e.date)+'</b></td><td colspan="6"><span class="fxi-pill s-revisao">Reaberto</span> Os registos a partir de '+day(e.date)+' voltaram a poder ser alterados.</td><td>'+esc(when(e.at))+'<small>'+esc(e.by||'')+'</small></td><td></td></tr>';
      var snap=e.snap,from=snap?snap.from:e.date,to=e.date;
      var cur=totalOf(rangeDays(d,from,to).map(function(z){return z.st;}));
      var base=snap?snap.total:null,ch=base?diffs(base,cur):[];
      var still=x.closedUntil&&to<=x.closedUntil;
      var t=base||cur;
      var recAcc=ACC.filter(function(a){return t.receivedBy&&t.receivedBy[a[0]];}).map(function(a){return a[1]+' '+money0(t.receivedBy[a[0]]);}).join(' · ');
      var state=!snap?'<span class="fxi-pill">Sem fotografia</span><small>fechado antes desta função</small>':ch.length?'<span class="fxi-pill s-low">Alterado depois do fecho</span><small>'+esc(ch.join(' · '))+'</small>':'<span class="fxi-pill s-vendas">Confere</span>'+(still?'':'<small>dia reaberto depois</small>');
      return '<tr><td><b>'+rangeLabel(from,to)+'</b>'+(snap&&snap.backfilled?'<small>fotografia criada depois</small>':'')+'</td><td class="n">'+money(t.salesAmount)+'<small>'+int(t.birds)+' frangos · '+t.sales+(t.sales===1?' venda':' vendas')+'</small></td>'+
        '<td class="n">'+money(t.received)+(recAcc?'<small>'+esc(recAcc)+'</small>':'')+'</td><td class="n">'+money(t.out)+'</td><td class="n">'+money(t.debtEnd)+'</td>'+
        '<td>'+(still?'<span class="fxi-pill s-facturado">Fechado</span>':'<span class="fxi-pill s-revisao">Reaberto</span>')+'</td><td>'+state+'</td><td>'+esc(when(e.at))+'<small>'+esc(e.by||'')+'</small></td>'+
        '<td class="fxi-act"><button type="button" class="fxi-link" data-print-close="'+i+'">Imprimir</button></td></tr>';
    }).join('');
    return flashHtml()+'<div class="fxi-summary">'+stat('Fechado até',x.closedUntil?day(x.closedUntil):'—','',x.closedUntil?'registos até esta data estão bloqueados':'nenhum dia fechado')+
      stat('Fechos feitos',int(log.filter(function(e){return e.action==='fechar';}).length))+stat('Reaberturas',int(log.filter(function(e){return e.action==='reabrir';}).length),log.some(function(e){return e.action==='reabrir';})?'warn':'')+'</div>'+
      (missing&&owner?'<div class="fxi-flash">Há fechos feitos antes de existir a fotografia dos totais. <button type="button" class="fxi-link" id="fxi-backfill">Criar a fotografia agora</button> (os dias continuam fechados, por isso os valores são os do fecho).</div>':'')+
      '<section class="fxi-compare"><h3>Histórico de fechos</h3><div class="fxi-scroll"><table><thead><tr><th>Dia(s)</th><th class="n">Vendas</th><th class="n">Recebido</th><th class="n">Saídas de dinheiro</th><th class="n">Dívida no fim do dia</th><th>Estado</th><th>Confere com o fecho?</th><th>Fechado em</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p class="fxi-foot">Em cada fecho o sistema guarda uma fotografia dos totais. Só o administrador pode reabrir um dia; se depois disso algum registo mudar, a linha mostra "Alterado depois do fecho" e o que mudou. "Imprimir" gera a folha do fecho com os registos actuais desse(s) dia(s).</p></section>';
  }
  function bindFechos(body,d){
    var bf=body.querySelector('#fxi-backfill');
    if(bf)bf.addEventListener('click',function(){saveOp({kind:'close.backfill'},'Fotografia dos fechos anteriores criada.');});
    body.querySelectorAll('[data-print-close]').forEach(function(b){b.addEventListener('click',function(){var e=extraData.extra.closeLog[+b.dataset.printClose];if(e)printClose(d,e);});});
  }
  function accName(a){var x=ACC.find(function(z){return z[0]===(a||'standard');});return x?x[1]:a;}
  function printClose(f,e){
    var snap=e.snap,from=snap?snap.from:e.date,to=e.date,days=rangeDays(f,from,to);
    var cur=totalOf(days.map(function(z){return z.st;})),ch=snap?diffs(snap.total,cur):[];
    var still=extraData.extra.closedUntil&&to<=extraData.extra.closedUntil;
    var bname=function(id){var b=f.batches.find(function(z){return z.id===id;});return b?b.name:'—';};
    var tbl=function(head,rows,foot){return '<table><thead><tr>'+head.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+head.length+'">Sem registos.</td></tr>')+'</tbody>'+(foot?'<tfoot>'+foot+'</tfoot>':'')+'</table>';};
    var body=days.map(function(x){var s=x.st;
      return '<section><h2>'+day(x.date)+'</h2><div class="tot"><div><span>Vendas</span><b>'+money(s.salesAmount)+'</b><small>'+int(s.birds)+' frangos</small></div><div><span>Recebido</span><b>'+money(s.received)+'</b></div><div><span>Saídas de dinheiro</span><b>'+money(s.out)+'</b></div><div><span>Dívida no fim do dia</span><b>'+money(s.debtEnd)+'</b></div></div>'+
        '<h3>Por conta</h3>'+tbl(['Conta','Entradas','Saídas','Diferença'],ACC.map(function(a){var i=s.receivedBy[a[0]]||0,o=s.outBy[a[0]]||0;return '<tr><td>'+a[1]+'</td><td>'+money(i)+'</td><td>'+money(o)+'</td><td>'+money(i-o)+'</td></tr>';}),'<tr><th>Total</th><th>'+money(s.received)+'</th><th>'+money(s.out)+'</th><th>'+money(s.received-s.out)+'</th></tr>')+
        '<h3>Vendas do dia</h3>'+tbl(['Cliente','Lote','Frangos','Preço','Total','Pago até ao fim do dia','Dívida'],x.salesList.map(function(v){var p=x.paidBy(v.id);return '<tr><td>'+esc(v.customer)+'</td><td>'+esc(bname(v.batch))+'</td><td>'+int(v.quantity)+'</td><td>'+money(v.unitPrice)+'</td><td>'+money(v.amount)+'</td><td>'+money(Math.min(p,v.amount))+'</td><td>'+money(Math.max(0,v.amount-p))+'</td></tr>';}),'<tr><th colspan="4">Total</th><th>'+money(s.salesAmount)+'</th><th></th><th>'+money(s.debtEnd)+'</th></tr>')+
        '<h3>Recebimentos do dia</h3>'+tbl(['Cliente','Lote','Data da venda','Conta','Valor'],x.recList.map(function(p){var v=f.sales.find(function(z){return z.id===p.sale;})||{};return '<tr><td>'+esc(v.customer||'—')+'</td><td>'+esc(bname(v.batch))+'</td><td>'+day(v.date)+'</td><td>'+accName(p.account)+'</td><td>'+money(p.amount)+'</td></tr>';}),'<tr><th colspan="4">Total</th><th>'+money(s.received)+'</th></tr>')+
        '<h3>Saídas de dinheiro</h3>'+tbl(['Descrição','Lote','Conta','Valor'],x.outList.map(function(o){return '<tr><td>'+esc(o.label)+'</td><td>'+(o.batch?esc(bname(o.batch)):'Geral')+'</td><td>'+accName(o.account)+'</td><td>'+money(o.amount)+'</td></tr>';}),'<tr><th colspan="3">Total</th><th>'+money(s.out)+'</th></tr>')+'</section>';}).join('');
    var css='@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#163e31;font-size:11px;margin:0}'+
      'header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #075b43;padding-bottom:10px;margin-bottom:10px}header img{height:54px}header h1{font-size:18px;margin:0}header p{margin:2px 0 0;color:#58796a}'+
      '.stamp{margin-left:auto;text-align:right;font-size:10px;color:#58796a}.stamp b{display:block;font-size:12px;color:'+(still?'#1e3a5f':'#8a4b08')+'}'+
      '.warn{border:1px solid #f3c98b;background:#fff4e5;color:#8a4b08;padding:6px 8px;border-radius:6px;margin:6px 0}'+
      'section{page-break-inside:auto;margin-top:8px}section+section{page-break-before:always}h2{font-size:15px;margin:10px 0 6px}h3{font-size:12px;margin:12px 0 4px}'+
      '.tot{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tot div{border:1px solid #cfdcd3;border-radius:6px;padding:7px}.tot span{display:block;font-size:10px;color:#58796a}.tot b{font-size:13px}.tot small{display:block;color:#6c7f73}'+
      'table{width:100%;border-collapse:collapse;font-size:10.5px}th,td{border:1px solid #d6e1da;padding:4px 6px;text-align:left}thead th{background:#edf4ee;font-size:10px}tfoot th{background:#f4f8f5}tr{page-break-inside:avoid}'+
      '.sign{display:flex;gap:40px;margin-top:30px}.sign div{flex:1;border-top:1px solid #163e31;padding-top:4px;font-size:10px;color:#58796a}';
    var head='<header><img src="'+location.origin+'/logo-documentos.png" alt=""><div><h1>Fecho de caixa · '+rangeLabel(from,to)+'</h1><p>Frango da Casa</p></div><div class="stamp"><b>'+(still?'Dia fechado':'Dia reaberto')+'</b>Fechado em '+esc(when(e.at))+' por '+esc(e.by||'')+'<br>Impresso em '+esc(when(new Date().toISOString()))+'</div></header>'+
      (ch.length?'<div class="warn">Atenção: os registos mudaram depois do fecho. '+esc(ch.join(' · '))+'.</div>':'')+(!snap?'<div class="warn">Este fecho foi feito antes de existir a fotografia dos totais; os valores são os actuais.</div>':'');
    var html='<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Fecho de caixa '+rangeLabel(from,to)+'</title><style>'+css+'</style></head><body>'+head+body+'<div class="sign"><div>Preparado por</div><div>Verificado por</div></div></body></html>';
    var old=document.getElementById('fx-print-frame');if(old)old.remove();
    var fr=document.createElement('iframe');fr.id='fx-print-frame';fr.setAttribute('aria-hidden','true');fr.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);var doc=fr.contentDocument;doc.open();doc.write(html);doc.close();
    var done=false,go=function(){if(done)return;done=true;try{fr.contentWindow.focus();fr.contentWindow.print();}catch(err){}};
    var img=doc.querySelector('img');if(img&&!img.complete){img.onload=img.onerror=go;setTimeout(go,1500);}else setTimeout(go,50);
  }

  /* ---------- Datas dos lotes: facturação, chegada ao aviário (dia 1), vendas e encerramento ---------- */
  // Facturado = pintos pagos e ainda por levantar. Chegada = dia em que o lote passa a «Em criação» (dia 1 da criação).
  // As datas automáticas são gravadas pela base de dados ao mudar o estado; o administrador corrige-as em «Datas dos lotes».
  var lotDates={map:{},canEdit:false,loaded:false,loading:false,error:''};
  function lotsApi(body){
    var t=token();if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    var o={headers:{Authorization:'Bearer '+t,apikey:KEY},credentials:'omit',cache:'no-store'};
    if(body){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
    return fetch(API.replace(/aviario-web$/,'aviario-lots'),o).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Não foi possível ler as datas dos lotes.');return j;});});
  }
  function setLotDates(j){var m={};(j.dates||[]).forEach(function(x){m[x.batch_id]={arrival:x.arrival||'',closed:x.closed||'',arrivalSource:x.arrival_source,closedSource:x.closed_source};});lotDates.map=m;lotDates.canEdit=!!j.canEdit;lotDates.loaded=true;lotDates.error='';}
  function fetchLotDates(then){
    if(lotDates.loading)return;lotDates.loading=true;
    lotsApi().then(setLotDates).catch(function(e){lotDates.error=e.message;lotDates.loaded=true;})
      .then(function(){lotDates.loading=false;if(then)then();if(overlay&&overlay.classList.contains('open'))render();});
  }
  function timeline(d,b){
    var x=lotDates.map[b.id]||{},sales=d.sales.filter(function(s){return s.batch===b.id&&s.date;}).map(function(s){return s.date;}).sort();
    var first=sales[0]||'',last=sales[sales.length-1]||'',arrival=x.arrival||'',closed=b.status==='encerrado'?(x.closed||''):'';
    var t=today(),ref=closed||(b.status==='encerrado'?last:t);
    return {invoiced:b.date||'',arrival:arrival,arrivalSource:x.arrivalSource,closed:closed,closedSource:x.closedSource,first:first,last:last,
      wait:arrival&&b.date?daysBetween(b.date,arrival):null,
      dayN:arrival&&b.status!=='facturado'&&ref?daysBetween(arrival,ref)+1:null,
      toFirst:arrival&&first?daysBetween(arrival,first)+1:null,
      salesDays:first&&last?daysBetween(first,last)+1:null,
      duration:arrival&&closed?daysBetween(arrival,closed)+1:null,
      waiting:b.status==='facturado'};
  }
  function avg(xs){xs=xs.filter(function(v){return v!==null&&isFinite(v);});return xs.length?xs.reduce(function(a,b){return a+b;},0)/xs.length:null;}
  function timeAverages(d){
    var tls=d.batches.filter(function(b){return b.quantity>0;}).map(function(b){return timeline(d,b);});
    return {wait:avg(tls.map(function(x){return x.wait;})),toFirst:avg(tls.map(function(x){return x.toFirst;})),salesDays:avg(tls.filter(function(x){return x.duration!==null;}).map(function(x){return x.salesDays;})),duration:avg(tls.map(function(x){return x.duration;})),
      n:{toFirst:tls.filter(function(x){return x.toFirst!==null;}).length,duration:tls.filter(function(x){return x.duration!==null;}).length}};
  }
  function dayLabel(n){return n===null?'—':'dia '+int(n);}
  function daysLabel(n){return n===null||!isFinite(n)?'—':int(n)+(Math.round(n)===1?' dia':' dias');}
  function lotTimeHtml(d,b,tl,av){
    if(tl.waiting)return '<p class="fxi-note">Facturado a '+day(tl.invoiced)+': pintos pagos, ainda por levantar'+(tl.invoiced?' (há '+int(daysBetween(tl.invoiced,today()))+' dias)':'')+'. Ao chegarem ao aviário, mude o estado para «Em criação»: esse dia conta como dia 1.</p>';
    if(!tl.arrival)return '<p class="fxi-note">Sem data de chegada ao aviário. '+(lotDates.canEdit?'Preencha-a em Indicadores › Datas dos lotes para o sistema medir os tempos deste lote.':'O administrador pode preenchê-la em Datas dos lotes.')+'</p>';
    var parts=['Chegou a <b>'+day(tl.arrival)+'</b>'+(tl.wait!==null?' ('+daysLabel(tl.wait)+' depois da facturação)':'')];
    if(tl.toFirst!==null)parts.push('1.ª venda no <b>'+dayLabel(tl.toFirst)+'</b>');
    else if(b.status!=='encerrado'&&av.toFirst!==null){var exp=addDay(tl.arrival,Math.round(av.toFirst)-1);parts.push('1.ª venda prevista por volta de <b>'+day(exp)+'</b> (média dos lotes: dia '+int(av.toFirst)+')');}
    if(tl.salesDays!==null)parts.push('vendas durante '+daysLabel(tl.salesDays));
    if(tl.duration!==null)parts.push('encerrado no <b>'+dayLabel(tl.duration)+'</b>');
    return '<p class="fxi-note fxi-time">'+parts.join(' · ')+'.</p>';
  }
  function renderDatas(d){
    var lots=d.batches.filter(function(b){return b.quantity>0;}).slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
    var av=timeAverages(d),edit=lotDates.canEdit,t=today();
    var src=function(s){return s==='manual'?'<small>corrigida à mão</small>':s==='auto'?'<small>automática</small>':'';};
    var rows=lots.map(function(b){
      var tl=timeline(d,b),x=lotDates.map[b.id]||{};
      return '<tr data-lot="'+esc(b.id)+'"><td><b>'+esc(b.name)+'</b><small>'+esc(STATUS[b.status]||b.status)+'</small></td>'+
        '<td>'+day(tl.invoiced)+'</td>'+
        '<td>'+(edit?'<input type="date" data-f="arrival" value="'+esc(x.arrival||'')+'" min="'+esc(b.date||'')+'" max="'+t+'">':(x.arrival?day(x.arrival):'—'))+src(x.arrival?x.arrivalSource:'')+'</td>'+
        '<td>'+(tl.first?day(tl.first):'—')+(tl.toFirst!==null?'<small>'+dayLabel(tl.toFirst)+'</small>':'')+'</td>'+
        '<td>'+(tl.last?day(tl.last):'—')+(tl.salesDays!==null?'<small>'+daysLabel(tl.salesDays)+' de vendas</small>':'')+'</td>'+
        '<td>'+(b.status==='encerrado'?(edit?'<input type="date" data-f="closed" value="'+esc(x.closed||'')+'" max="'+t+'">':(x.closed?day(x.closed):'—'))+src(x.closed?x.closedSource:''):'<span class="fxi-muted">—</span>')+'</td>'+
        '<td class="n"><b>'+(tl.duration!==null?daysLabel(tl.duration):tl.dayN!==null?dayLabel(tl.dayN)+' (em curso)':'—')+'</b></td>'+
        '<td class="fxi-act">'+(edit?'<button type="button" class="fxi-primary fxi-sm" data-save-lot="'+esc(b.id)+'">Guardar</button>':'')+'</td></tr>';
    }).join('');
    return flashHtml()+(lotDates.error?'<div class="fxi-flash bad">'+esc(lotDates.error)+'</div>':'')+
      '<div class="fxi-summary fxi-summary4">'+
        stat('Espera até ao levantamento',daysLabel(av.wait),'','média entre a facturação e a chegada')+
        stat('Até à 1.ª venda',av.toFirst!==null?'dia '+int(av.toFirst):'—','',av.n.toFirst?'média de '+av.n.toFirst+(av.n.toFirst===1?' lote':' lotes')+' (dia 1 = chegada)':'precisa da data de chegada')+
        stat('Período de vendas',daysLabel(av.salesDays),'','média dos lotes encerrados')+
        stat('Duração do lote',daysLabel(av.duration),'',av.n.duration?'da chegada ao encerramento · '+av.n.duration+(av.n.duration===1?' lote':' lotes'):'precisa da chegada e do encerramento')+
      '</div>'+
      '<section class="fxi-compare"><h3>Datas dos lotes</h3><div class="fxi-scroll"><table class="fxi-dates"><thead><tr><th>Lote</th><th>Facturado</th><th>Chegada ao aviário (dia 1)</th><th>1.ª venda</th><th>Última venda</th><th>Encerrado</th><th class="n">Duração</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p class="fxi-foot">Facturado = pintos pagos ao fornecedor, ainda por levantar (data do lote). A chegada é gravada sozinha no dia em que o lote passa a «Em criação» e conta como dia 1; o encerramento é gravado no dia em que passa a «Encerrado». As vendas vêm dos registos. '+(edit?'Pode corrigir as datas aqui (por exemplo, nos lotes antigos) e carregar em «Guardar».':'Só o administrador corrige as datas.')+'</p></section>';
  }
  function bindDatas(body,d){
    body.querySelectorAll('[data-save-lot]').forEach(function(bt){bt.addEventListener('click',function(){
      var tr=bt.closest('tr'),id=bt.getAttribute('data-save-lot');
      var a=tr.querySelector('[data-f=arrival]'),c=tr.querySelector('[data-f=closed]');
      var cur=lotDates.map[id]||{};
      bt.disabled=true;bt.textContent='A guardar…';
      lotsApi({batch:id,arrival:a?(a.value||null):(cur.arrival||null),closed:c?(c.value||null):(cur.closed||null)})
        .then(function(j){setLotDates(j);var b=d.batches.find(function(z){return z.id===id;});flash={text:'Datas de '+(b?b.name:'lote')+' guardadas.'};render();})
        .catch(function(e){flash={text:e.message,bad:true};render();});
    });});
  }
  // Depois de a app gravar (por exemplo, mudar o estado de um lote), volta a ler as datas.
  (function(){
    if(window.__fxLotFetch)return;window.__fxLotFetch=true;
    var orig=window.fetch;
    window.fetch=function(input,init){
      var p=orig.apply(this,arguments);
      try{
        var url=typeof input==='string'?input:(input&&input.url)||'',method=(init&&init.method)||(input&&input.method)||'GET';
        if(method==='POST'&&/\/aviario-web\/(farm|batches)/.test(url.split('?')[0]))p.then(function(r){if(r.ok)setTimeout(function(){lotDates.loading=false;fetchLotDates(function(){});},800);}).catch(function(){});
      }catch(e){}
      return p;
    };
  })();

  /* ---------- Previsão de compras (lotes em criação e facturados) ---------- */
  // Regras guardadas no servidor (função aviario-plan); o administrador muda-as em «Editar regras».
  // Regras originais: por cada 100 pintos 1 saco de Ração A1 e 3 sacos de Ração A2; por lote 1 saco de carvão e 1 vitamina.
  var DEFAULT_RULES=[
    {id:'a1',label:'Ração A1',unit:'saco',category:'Ração',mode:'per100',qty:1,keyword:'a1'},
    {id:'a2',label:'Ração A2',unit:'saco',category:'Ração',mode:'per100',qty:3,keyword:'a2'},
    {id:'carvao',label:'Carvão',unit:'saco',category:'Custos de Produção (Utilidades)',mode:'perLot',qty:1,keyword:'carvao'},
    {id:'vitamina',label:'Vitamina',unit:'un.',category:'Sanidade Animal',mode:'perLot',qty:1,keyword:'vitamin'}
  ];
  var CATS=['Ração','Transporte','Sanidade Animal','Custos de Produção (Utilidades)','Abate e congelação','Outros'];
  var planData={rules:null,revision:0,canEdit:false,loaded:false,loading:false,updatedAt:null,updatedBy:''},planEdit=null;
  function planRules(){return planData.rules===null||!Array.isArray(planData.rules)?DEFAULT_RULES:planData.rules;}
  function planApi(body){
    var t=token();if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    var o={headers:{Authorization:'Bearer '+t,apikey:KEY},credentials:'omit',cache:'no-store'};
    if(body){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
    return fetch(API.replace(/aviario-web$/,'aviario-plan'),o).then(function(r){return r.json().then(function(j){if(!r.ok){var e=new Error(j.error||'Não foi possível ler as regras.');e.status=r.status;throw e;}return j;});});
  }
  function fetchPlan(){
    if(planData.loading)return;planData.loading=true;
    planApi().then(function(j){planData.rules=j.rules;planData.revision=j.revision||0;planData.canEdit=!!j.canEdit;planData.updatedAt=j.updatedAt;planData.updatedBy=j.updatedBy||'';})
      .catch(function(e){planData.error=e.message;})
      .then(function(){planData.loading=false;planData.loaded=true;if(overlay&&view==='previsao')render();});
  }
  var PLAN_STATUS={criacao:1,facturado:1};
  var payForm=null,dirtyFarm=false;
  function plainTxt(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
  function priceOf(d,label){var p=((d.settings&&d.settings.expensePrices)||[]).find(function(x){return plainTxt(x.description)===plainTxt(label);});return p?p.unitPrice:0;}
  function rulePrice(d,r){return r.price||priceOf(d,r.label);}
  function ruleMatch(r,e){
    var k=plainTxt(r.keyword).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(!k)return false;
    var re=new RegExp('(^|[^a-z0-9])'+k+(k.length>=4?'':'(?![a-z0-9])'));
    return re.test(plainTxt(e.description))&&(e.category===r.category||plainTxt(r.keyword).length>=4);
  }
  function ruleText(r){var u=r.unit;if(r.qty!==1&&/[aeiou]$/i.test(u))u+='s';return num(r.qty,2)+' '+u+(r.mode==='per100'?' por 100 pintos':' por lote');}
  function planFor(d,b){
    var exps=d.expenses.filter(function(e){return e.batch===b.id;});
    var used={};
    var items=planRules().map(function(it){
      var need=it.mode==='per100'?Math.ceil(b.quantity*it.qty/100):it.qty;
      var mine=exps.filter(function(e){if(used[e.id])return false;var ok=ruleMatch(it,e);if(ok)used[e.id]=1;return ok;});
      var bought=sum(mine,function(e){return e.quantity;}),spent=sum(mine,function(e){return e.amount;});
      var price=rulePrice(d,it),left=Math.max(0,Math.ceil(need-bought));
      return {it:it,need:need,bought:bought,spent:spent,price:price,left:left,leftCost:left*price,planCost:Math.round(need*price)};
    });
    var trans=exps.filter(function(e){return e.category==='Transporte'||/^transporte|delivery/.test(plainTxt(e.description));});
    var other=exps.filter(function(e){return !used[e.id]&&trans.indexOf(e)<0;});
    return {b:b,items:items,trans:trans,other:other,
      plan:sum(items,function(x){return x.planCost;}),left:sum(items,function(x){return x.leftCost;}),
      spent:sum(exps,function(e){return e.amount;}),transCost:sum(trans,function(e){return e.amount;})};
  }
  (function(){try{if(document.getElementById('fx-plan-css'))return;var st=document.createElement('style');st.id='fx-plan-css';st.textContent=
    '.fxi-plan-rules{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 14px;padding:10px 14px;border:1px solid #d6e1da;border-radius:12px;background:#f7faf8;font-size:13px;line-height:1.45}.fxi-plan-rules small{color:#6c7f73}'+
    '.fxi-rules{margin-bottom:16px}.fxi-rules table input,.fxi-rules table select{width:100%;min-width:90px;padding:6px 8px;font:inherit;font-size:13px;border:1px solid #cfdcd3;border-radius:8px;background:#fff;box-sizing:border-box}'+
    '.fxi-rules table input.fxi-num{min-width:80px;text-align:right}.fxi-rules table input.fxi-unit{min-width:70px}.fxi-rules [data-f=label]{min-width:150px}.fxi-rules [data-f=mode]{min-width:165px}.fxi-rules [data-f=category]{min-width:190px}.fxi-rules [data-f=keyword]{min-width:110px}.fxi-rules [data-f=price]{min-width:120px}.fxi-rules td{vertical-align:middle}.fxi-rules .fxi-form-actions+.fxi-form-actions{margin-top:8px}';
    document.head.appendChild(st);}catch(e){}})();
  function planEditorHtml(d){
    var rows=planEdit.map(function(r,i){
      var std=priceOf(d,r.label);
      return '<tr data-rule="'+i+'">'+
        '<td><input type="text" data-f="label" maxlength="60" value="'+esc(r.label)+'" aria-label="Nome"></td>'+
        '<td><select data-f="mode" aria-label="Como se conta">'+opts([['per100','Por cada 100 pintos'],['perLot','Por lote']],r.mode)+'</select></td>'+
        '<td><input type="number" data-f="qty" min="0.01" step="0.01" inputmode="decimal" value="'+(r.qty||'')+'" aria-label="Quantidade" class="fxi-num"></td>'+
        '<td><input type="text" data-f="unit" maxlength="15" value="'+esc(r.unit)+'" aria-label="Unidade" class="fxi-unit"></td>'+
        '<td><select data-f="category" aria-label="Categoria">'+opts(CATS.map(function(c){return [c,c];}),r.category)+'</select></td>'+
        '<td><input type="text" data-f="keyword" maxlength="40" value="'+esc(r.keyword)+'" aria-label="Palavra que reconhece as compras"></td>'+
        '<td><input type="number" data-f="price" min="0.01" step="0.01" inputmode="decimal" value="'+(r.price?String(r.price/100):'')+'" placeholder="'+(std?'padrão '+(std/100).toLocaleString('pt-PT'):'sem preço padrão')+'" aria-label="Preço (MT)" class="fxi-num"></td>'+
        '<td class="fxi-act"><button type="button" class="fxi-link bad" data-rule-del="'+i+'">Remover</button></td></tr>';
    }).join('');
    return '<section class="fxi-form fxi-rules" id="fxi-rules"><h3>Regras da previsão</h3>'+
      '<p class="fxi-muted">Cada regra diz quanto um lote precisa de comprar. «Palavra» é a parte da descrição que reconhece o que já foi comprado (ex.: «a1» em «Ração A1»). Deixe o preço vazio para usar o preço padrão das despesas.</p>'+
      '<div class="fxi-scroll"><table><thead><tr><th>Nome</th><th>Como se conta</th><th class="n">Quantidade</th><th>Unidade</th><th>Categoria</th><th>Palavra</th><th class="n">Preço (MT)</th><th></th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="8" class="fxi-muted">Sem regras. Adicione pelo menos uma.</td></tr>')+'</tbody></table></div>'+
      '<div class="fxi-form-actions"><button type="button" class="fxi-link" id="fxi-rule-add">+ Adicionar regra</button><button type="button" class="fxi-link" id="fxi-rule-reset">Repor regras originais</button></div>'+
      '<div class="fxi-form-actions"><button type="button" class="fxi-primary" id="fxi-rule-save">Guardar regras</button><button type="button" class="fxi-link" id="fxi-rule-cancel">Cancelar</button><span class="fxi-muted">As novas regras valem logo para todos os lotes em criação e facturados.</span></div></section>';
  }
  function bindPlanEditor(body){
    var box=body.querySelector('#fxi-rules');if(!box)return;
    box.addEventListener('input',function(e){
      var tr=e.target.closest('[data-rule]'),f=e.target.getAttribute('data-f');if(!tr||!f)return;
      var r=planEdit[+tr.getAttribute('data-rule')],v=e.target.value;
      if(f==='qty')r.qty=Number(v);else if(f==='price')r.price=v===''?null:Math.round(Number(v)*100);else r[f]=v;
    });
    box.addEventListener('change',function(e){var t=e.target;if(t.tagName==='SELECT')t.dispatchEvent(new Event('input',{bubbles:true}));});
    box.querySelectorAll('[data-rule-del]').forEach(function(b){b.addEventListener('click',function(){planEdit.splice(+b.getAttribute('data-rule-del'),1);render();});});
    box.querySelector('#fxi-rule-add').addEventListener('click',function(){planEdit.push({id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),label:'',unit:'un.',category:'Outros',mode:'perLot',qty:1,keyword:'',price:null});render();
      var last=overlay.querySelector('#fxi-rules tbody tr:last-child input');if(last)last.focus();});
    box.querySelector('#fxi-rule-reset').addEventListener('click',function(){planEdit=JSON.parse(JSON.stringify(DEFAULT_RULES));render();});
    box.querySelector('#fxi-rule-cancel').addEventListener('click',function(){planEdit=null;render();});
    box.querySelector('#fxi-rule-save').addEventListener('click',function(){
      var bt=this;bt.disabled=true;bt.textContent='A guardar…';
      var rules=planEdit.map(function(r){var x={id:r.id,label:String(r.label||'').trim(),unit:String(r.unit||'').trim(),category:r.category,mode:r.mode,qty:Number(r.qty),keyword:String(r.keyword||'').trim()};if(r.price)x.price=r.price;return x;});
      planApi({revision:planData.revision,rules:rules}).then(function(j){
        planData.rules=j.rules;planData.revision=j.revision;planData.updatedAt=j.updatedAt;planData.updatedBy=j.updatedBy;planEdit=null;
        flash={text:'Regras guardadas. A previsão já usa as novas regras.'};render();
      }).catch(function(e){
        flash={text:e.message,bad:true};
        if(e.status===409){planData.loaded=false;}
        render();
      });
    });
  }
  function canPay(){var a=(lastData&&lastData.access)||role();return a.role==='owner'||((a.permissions&&a.permissions.create)||[]).indexOf('expenses')>=0;}
  function payFormHtml(p){
    var t=today();
    return '<form class="fxi-form fxi-pay" id="fxi-pay-form"><h3>'+esc(p.title)+'</h3><div class="fxi-fields">'+
      (p.transport?'<label>Tipo<select name="description"><option>Transporte de Compra</option><option>Delivery</option></select></label>':'<label>Descrição<input type="text" name="description" required maxlength="200" value="'+esc(p.description)+'"></label>')+
      '<label>Quantidade'+(p.unit?' ('+esc(p.unit)+')':'')+'<input type="number" name="qty" required min="0.01" step="0.01" inputmode="decimal" value="'+(p.qty||1)+'"></label>'+
      '<label>Preço unitário (MT)<input type="number" name="price" required min="0.01" step="0.01" inputmode="decimal" value="'+(p.price?String(p.price/100):'')+'"></label>'+
      '<label>Total<output name="total" class="fxi-total">—</output></label>'+
      '<label>Data<input type="date" name="date" required max="'+t+'" value="'+t+'"></label>'+
      '<label>Conta<select name="account">'+ACC.map(function(a){return '<option value="'+a[0]+'">'+a[1]+'</option>';}).join('')+'</select></label>'+
      '</div><div class="fxi-form-actions"><button type="submit" class="fxi-primary">Gravar despesa no lote</button><button type="button" class="fxi-link" id="fxi-pay-cancel">Cancelar</button><span class="fxi-muted">Fica registada como despesa de '+esc(p.batchName)+' na categoria '+esc(p.category)+'.</span></div></form>';
  }
  function renderPrevisao(d){
    var lots=d.batches.filter(function(b){return PLAN_STATUS[b.status]&&b.quantity>0;}).sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
    var editor=planEdit?planEditorHtml(d):'';
    var rulesBar='<div class="fxi-plan-rules"><span><b>Regras:</b> '+(planRules().length?planRules().map(function(r){return esc(r.label)+' — '+esc(ruleText(r));}).join(' · '):'nenhuma')+(planData.updatedAt?' <small>(alteradas a '+esc(when(planData.updatedAt))+(planData.updatedBy?' por '+esc(planData.updatedBy):'')+')</small>':'')+'</span>'+
      (planData.canEdit&&!planEdit?'<button type="button" class="fxi-primary fxi-sm" id="fxi-rules-edit">Editar regras</button>':'')+'</div>';
    if(!lots.length)return flashHtml()+rulesBar+editor+'<div class="fxi-empty">Não há lotes em criação nem facturados.</div>';
    var plans=lots.map(function(b){return planFor(d,b);});
    var noPrice=planRules().filter(function(it){return !rulePrice(d,it);}).map(function(it){return it.label;});
    var pay=canPay();
    var cards=plans.map(function(p){
      var b=p.b;
      var rows=p.items.map(function(x){
        var done=x.left===0;
        return '<tr><td><b>'+esc(x.it.label)+'</b><small>'+esc(ruleText(x.it))+'</small></td>'+
          '<td class="n">'+num(x.need,0)+'</td><td class="n">'+(x.bought?num(x.bought,2):'—')+(x.spent?'<small>'+money(x.spent)+'</small>':'')+'</td>'+
          '<td class="n '+(done?'good':'')+'"><b>'+(done?'0':num(x.left,0))+'</b></td><td class="n">'+(x.price?money(x.price):'<span class="bad">sem preço</span>')+'</td><td class="n"><b>'+(done?'—':money(x.leftCost))+'</b></td>'+
          '<td>'+(done?'<span class="fxi-pill s-vendas">Comprado</span>':'<span class="fxi-pill s-revisao">Por comprar</span>')+'</td>'+
          '<td class="fxi-act">'+(pay&&!done?'<button type="button" class="fxi-primary fxi-sm" data-pay="'+esc(b.id)+'|'+esc(x.it.id)+'">Pagar</button>':'')+'</td></tr>';
      }).join('');
      var trows=p.trans.map(function(e){return '<tr class="fxi-manual"><td><b>'+esc(e.description||e.category)+'</b><small>registado manualmente</small></td><td class="n">—</td><td class="n">'+num(e.quantity,2)+'<small>'+day(e.date)+'</small></td><td class="n">—</td><td class="n">'+money(e.unitCost)+'</td><td class="n">'+money(e.amount)+'</td><td><span class="fxi-pill s-vendas">Pago</span></td><td></td></tr>';}).join('');
      var form=payForm&&payForm.batch===b.id?'<tr class="fxi-pay-row"><td colspan="8">'+payFormHtml(payForm)+'</td></tr>':'';
      var perBird=b.quantity?(b.purchaseCost+p.spent+p.left)/b.quantity:NaN;
      return '<article class="fxi-card fxi-plan">'+
        '<header><div><h3>'+esc(b.name)+'</h3><p>'+(function(){var tl=timeline(d,b);return int(b.quantity)+' pintos · facturado '+day(b.date)+(tl.waiting?' · <b>por levantar</b>':tl.arrival?' · chegou '+day(tl.arrival)+(tl.dayN!==null?' (<b>dia '+int(tl.dayN)+'</b>)':''):'');})()+'</p></div><span class="fxi-pill s-'+esc(b.status)+'">'+esc(STATUS[b.status]||b.status)+'</span></header>'+
        '<div class="fxi-grid">'+
          stat('Previsto (insumos)',money(p.plan))+
          stat('Falta comprar',money(p.left),p.left?'warn':'good',p.left?'segundo os preços padrão':'tudo comprado')+
          stat('Já gasto no lote',money(p.spent),'',p.transCost?'inclui '+money0(p.transCost)+' de transporte':'')+
          stat('Custo previsto por ave',isFinite(perBird)?money(perBird):'—','','pintos + gasto + o que falta')+
        '</div>'+
        '<div class="fxi-scroll"><table class="fxi-plan-table"><thead><tr><th>Item</th><th class="n">Previsto</th><th class="n">Já comprado</th><th class="n">Falta</th><th class="n">Preço</th><th class="n">Custo do que falta</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+trows+form+'</tbody></table></div>'+
        (pay?'<div class="fxi-plan-actions"><button type="button" class="fxi-link" data-trans="'+esc(b.id)+'">+ Registar transporte (compra ou delivery)</button></div>':'')+
      '</article>';
    }).join('');
    var tot=sum(plans,function(p){return p.left;});
    return flashHtml()+'<div class="fxi-summary">'+stat('Lotes em criação ou facturados',int(lots.length),'',lots.map(function(b){return b.name;}).join(', '))+
      stat('Total a comprar',money(tot),tot?'warn':'good','insumos em falta segundo as regras')+
      stat('Regras',int(planRules().length),'',planData.rules===null?'regras originais':'definidas pelo administrador')+'</div>'+rulesBar+editor+
      (noPrice.length?'<div class="fxi-flash bad">Sem preço padrão para: '+esc(noPrice.join(', '))+'. Defina-o nos preços padrão das despesas para a previsão contar com ele.</div>':'')+
      '<div class="fxi-cards fxi-cards1">'+cards+'</div>'+
      '<p class="fxi-foot">A previsão usa o preço de cada regra ou, se estiver vazio, o preço padrão das despesas. "Já comprado" soma as despesas do lote cuja descrição tem a palavra da regra. Os transportes não entram na previsão: registam-se à mão. Quantidades por 100 pintos arredondadas para cima (ex.: 150 pintos com 1 saco por 100 = 2 sacos).</p>';
  }
  function saveExpense(rec){
    var body=overlay.querySelector('.fxi-body');body.classList.add('fxi-busy');
    var t=token();if(!t){flash={text:'A sessão terminou. Volta a entrar.',bad:true};render();body.classList.remove('fxi-busy');return;}
    return load().then(function(j){
      var owner=j.access&&j.access.role==='owner',payload;
      if(owner){var st=j.state;st.expenses=(st.expenses||[]).concat([rec]);payload={revision:j.revision,state:st};}
      else payload={revision:j.revision,operation:{kind:'expense',record:rec}};
      return fetch(API+'/farm',{method:'POST',headers:{Authorization:'Bearer '+t,apikey:KEY,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(payload)})
        .then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||'Não foi possível gravar a despesa.');return x;});});
    }).then(function(x){
      lastData={state:x.state,revision:x.revision,access:x.access};dirtyFarm=true;payForm=null;
      flash={text:'Despesa gravada: '+rec.description+' · '+money(rec.amount)+' em '+accName(rec.account)+'. As outras páginas actualizam ao fechar esta janela.'};render();
    }).catch(function(e){flash={text:e.message,bad:true};render();}).then(function(){body.classList.remove('fxi-busy');});
  }
  function bindPrevisao(body,d){
    body.querySelectorAll('[data-pay]').forEach(function(bt){bt.addEventListener('click',function(){
      var k=bt.dataset.pay.split('|'),b=d.batches.find(function(z){return z.id===k[0];}),x=planFor(d,b).items.find(function(z){return z.it.id===k[1];});
      payForm={batch:b.id,batchName:b.name,title:'Pagar '+x.it.label+' · '+b.name,description:x.it.label,category:x.it.category,unit:x.it.unit,qty:x.left,price:x.price};render();
      var f=overlay.querySelector('#fxi-pay-form');if(f)f.scrollIntoView({behavior:'smooth',block:'center'});
    });});
    body.querySelectorAll('[data-trans]').forEach(function(bt){bt.addEventListener('click',function(){
      var b=d.batches.find(function(z){return z.id===bt.dataset.trans;});
      payForm={batch:b.id,batchName:b.name,title:'Registar transporte · '+b.name,transport:true,category:'Transporte',unit:'',qty:1,price:0};render();
      var f=overlay.querySelector('#fxi-pay-form');if(f)f.scrollIntoView({behavior:'smooth',block:'center'});
    });});
    var f=body.querySelector('#fxi-pay-form');if(!f)return;
    var calc=function(){var q=Number(val(f,'qty')),p=Number(val(f,'price'));f.querySelector('output').textContent=q>0&&p>0?money(Math.round(q*Math.round(p*100))):'—';};
    f.addEventListener('input',calc);calc();
    body.querySelector('#fxi-pay-cancel').addEventListener('click',function(){payForm=null;render();});
    f.addEventListener('submit',function(e){e.preventDefault();
      var q=Math.round(Number(val(f,'qty'))*100)/100,unit=Math.round(Number(val(f,'price'))*100),desc=val(f,'description');
      if(!(q>0)||!(unit>0)||!desc){flash={text:'Indique a descrição, a quantidade e o preço.',bad:true};render();return;}
      saveExpense({id:(crypto.randomUUID?crypto.randomUUID():'exp-'+Date.now()+'-'+Math.random().toString(36).slice(2)),batch:payForm.batch,date:val(f,'date'),category:payForm.category,description:desc,quantity:q,unitCost:unit,amount:Math.round(q*unit),account:val(f,'account')});
    });
  }

  /* ---------- Dívidas perdidas ---------- */
  var perdaCustomer='',perdaArmed=false;
  function postFarm(path,extra){
    var t=token();if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    return load().then(function(j){
      return fetch(API+path,{method:'POST',headers:{Authorization:'Bearer '+t,apikey:KEY,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(Object.assign({revision:j.revision},extra))})
        .then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||'Não foi possível gravar.');return x;});});
    });
  }
  function lostGroups(d){
    var by={};
    d.payments.filter(function(p){return p.compensation==='perda';}).forEach(function(p){
      var k=p.writeOff||p.id,s=d.sales.find(function(z){return z.id===p.sale;})||{},c=(d.customers||[]).find(function(z){return z.id===s.customerId;});
      var g=by[k]||(by[k]={group:p.writeOff||'',name:(c&&c.name)||s.customer||'Cliente',number:c&&c.number,date:p.date,reason:String(p.note||'').replace(/^Dívida perdida · /,''),total:0,batches:{}});
      g.total+=p.amount;var b=d.batches.find(function(z){return z.id===s.batch;});g.batches[b?b.name:'lote']=(g.batches[b?b.name:'lote']||0)+p.amount;
    });
    return Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  }
  function renderPerdas(d){
    var owner=lastData.access&&lastData.access.role==='owner',groups=lostGroups(d),list=debtors(d).filter(function(g){return g.id;});
    var lostTotal=sum(groups,function(g){return g.total;}),open=sum(list,function(g){return g.debt;});
    if(perdaCustomer&&!list.some(function(g){return g.id===perdaCustomer;}))perdaCustomer='';
    var form='';
    if(owner){
      var g=list.find(function(x){return x.id===perdaCustomer;});
      var lines=g?d.sales.filter(function(s){return s.customerId===g.id&&s.amount-paidOf(d,s.id)>0;}).map(function(s){var b=d.batches.find(function(z){return z.id===s.batch;});return '<li>'+esc(b?b.name:'lote')+' · venda de '+day(s.date)+' · <b>'+money(s.amount-paidOf(d,s.id))+'</b></li>';}).join(''):'';
      form='<form class="fxi-form" id="fxi-perda-form"><h3>Dar dívida como perdida</h3><div class="fxi-fields">'+
        '<label>Cliente<select name="customer" required><option value="">Escolha o cliente</option>'+list.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===perdaCustomer?' selected':'')+'>'+esc(x.name)+' · '+money(x.debt)+'</option>';}).join('')+'</select></label>'+
        '<label>Data<input type="date" name="date" required max="'+today()+'" value="'+today()+'"></label>'+
        '<label class="fxi-wide">Motivo<input type="text" name="reason" required minlength="3" maxlength="300" placeholder="Ex.: cliente saiu da cidade, não atende"></label>'+
        '</div>'+(g?'<div class="fxi-perda-detail"><p>Fica como perdida <b>toda a dívida restante</b> de '+esc(g.name)+': <b class="bad">'+money(g.debt)+'</b></p><ul>'+lines+'</ul></div>':'')+
        '<div class="fxi-form-actions"><button type="submit" class="fxi-primary fxi-danger"'+(g?'':' disabled')+'>'+(perdaArmed&&g?'Confirmar: dar '+money(g.debt)+' como perdido':'Dar como perdida')+'</button>'+(perdaArmed?'<button type="button" class="fxi-link" id="fxi-perda-cancel">Cancelar</button>':'')+
        '<span class="fxi-muted">A venda fica no histórico; a dívida sai das cobranças e o valor passa a custo do lote. Não mexe nas contas. Pode ser anulada.</span></div></form>';
    }
    var rows=groups.map(function(g,i){
      return '<tr><td>'+day(g.date)+'</td><td><b>'+esc(g.name)+'</b>'+(g.number?'<small>CLI-'+String(g.number).padStart(4,'0')+'</small>':'')+'</td><td>'+esc(Object.keys(g.batches).join(', '))+'</td><td>'+esc(g.reason)+'</td><td class="n bad"><b>'+money(g.total)+'</b></td>'+
        '<td class="fxi-act">'+(owner&&g.group?'<button type="button" class="fxi-link bad" data-undo-perda="'+esc(g.group)+'">Anular</button>':'')+'</td></tr>';
    }).join('');
    return flashHtml()+'<div class="fxi-summary">'+stat('Total dado como perdido',money(lostTotal),lostTotal?'bad':'',groups.length+(groups.length===1?' registo':' registos'))+
      stat('Clientes com dívida perdida',int(Object.keys(groups.reduce(function(o,g){o[g.name]=1;return o;},{})).length))+
      stat('Ainda por cobrar',money(open),open?'warn':'good',int(list.length)+' clientes com dívida')+'</div>'+
      form+
      '<section class="fxi-compare"><h3>Dívidas dadas como perdidas</h3><div class="fxi-scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Lotes</th><th>Motivo</th><th class="n">Valor perdido</th><th></th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="6" class="fxi-muted">Ainda não há dívidas dadas como perdidas.</td></tr>')+'</tbody></table></div>'+
      '<p class="fxi-foot">Só o administrador pode dar uma dívida como perdida ou anular. Se o cliente voltar a pagar, anule primeiro a dívida perdida e depois registe o pagamento.</p></section>';
  }
  function bindPerdas(body,d){
    var f=body.querySelector('#fxi-perda-form');
    body.querySelectorAll('[data-undo-perda]').forEach(function(bt){bt.addEventListener('click',function(){
      if(!bt.dataset.armed){bt.dataset.armed='1';bt.textContent='Confirmar anulação';return;}
      body.classList.add('fxi-busy');
      postFarm('/customers/write-off/undo',{group:bt.dataset.undoPerda}).then(function(x){lastData={state:x.state,revision:x.revision,access:x.access};dirtyFarm=true;flash={text:'Dívida perdida anulada. A dívida voltou para as cobranças.'};render();})
        .catch(function(e){flash={text:e.message,bad:true};render();}).then(function(){body.classList.remove('fxi-busy');});
    });});
    if(!f)return;
    fld(f,'customer').addEventListener('change',function(){perdaCustomer=fld(f,'customer').value;perdaArmed=false;var r=val(f,'reason');render();var nf=overlay.querySelector('#fxi-perda-form');if(nf)fld(nf,'reason').value=r;});
    var cancel=body.querySelector('#fxi-perda-cancel');if(cancel)cancel.addEventListener('click',function(){perdaArmed=false;var r=val(f,'reason');render();var nf=overlay.querySelector('#fxi-perda-form');if(nf)fld(nf,'reason').value=r;});
    f.addEventListener('submit',function(e){e.preventDefault();
      var reason=val(f,'reason'),date=val(f,'date');
      if(!perdaCustomer||reason.length<3){flash={text:'Escolha o cliente e escreva o motivo.',bad:true};render();return;}
      if(!perdaArmed){perdaArmed=true;render();var nf=overlay.querySelector('#fxi-perda-form');if(nf){fld(nf,'reason').value=reason;fld(nf,'date').value=date;}return;}
      body.classList.add('fxi-busy');
      var name=(debtors(d).find(function(g){return g.id===perdaCustomer;})||{}).name||'';
      postFarm('/customers/write-off',{customerId:perdaCustomer,date:date,reason:reason}).then(function(x){
        lastData={state:x.state,revision:x.revision,access:x.access};dirtyFarm=true;perdaArmed=false;perdaCustomer='';
        flash={text:'Dívida de '+name+' dada como perdida. As outras páginas actualizam ao fechar esta janela.'};render();
      }).catch(function(e){perdaArmed=false;flash={text:e.message,bad:true};render();}).then(function(){body.classList.remove('fxi-busy');});
    });
  }

  function render(){
    var body=overlay.querySelector('.fxi-body');
    overlay.querySelectorAll('.fxi-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.v===view);b.setAttribute('aria-selected',b.dataset.v===view);});
    var ext=view==='previsao';document.querySelectorAll('aside .fx-ind-btn').forEach(function(b){b.classList.toggle('cur',b.classList.contains('fx-cri-btn')===ext);});
    if(!lastData){body.innerHTML='<div class="fxi-empty">A carregar os dados…</div>';return;}
    var d=lastData.state;
    d.customers=d.customers||[];d.payments=d.payments||[];d.production=d.production||[];d.expenses=d.expenses||[];
    if(!lotDates.loaded&&!lotDates.loading)fetchLotDates();
    if(view==='previsao'){if(!planData.loaded&&!planData.loading)fetchPlan();body.innerHTML=renderPrevisao(d);bindPrevisao(body,d);bindPlanEditor(body);var eb=body.querySelector('#fxi-rules-edit');if(eb)eb.addEventListener('click',function(){planEdit=JSON.parse(JSON.stringify(planRules()));render();var r=overlay.querySelector('#fxi-rules');if(r)r.scrollIntoView({behavior:'smooth',block:'start'});});return;}
    if(view==='datas'){body.innerHTML=lotDates.loaded?renderDatas(d):'<div class="fxi-empty">A carregar as datas dos lotes…</div>';bindDatas(body,d);return;}
    if(view==='perdas'){body.innerHTML=renderPerdas(d);bindPerdas(body,d);return;}
    if(view==='fechos'){
      if(!extraData){body.innerHTML='<div class="fxi-empty'+(extraError?' bad':'')+'">'+esc(extraError||'A carregar os dados…')+'</div>';return;}
      body.innerHTML=renderFechos(d);bindFechos(body,d);return;
    }
    if(view==='criacao'||view==='stock'){
      if(!extraData){body.innerHTML='<div class="fxi-empty'+(extraError?' bad':'')+'">'+esc(extraError||'A carregar os dados…')+'</div>';return;}
      body.innerHTML=view==='criacao'?renderCriacao(d):renderStock(d);
      bindExtra(body,d);
      return;
    }
    body.innerHTML=view==='lotes'?renderLotes(d):renderLembretes(d);
    if(view==='lembretes'){
      var list=debtors(d),ta=body.querySelector('#fxi-tpl');
      if(ta){
        ta.addEventListener('input',function(){store(TEMPLATE_KEY,ta.value);});
        body.querySelector('#fxi-tpl-reset').addEventListener('click',function(){ta.value=DEFAULT_TEMPLATE;store(TEMPLATE_KEY,DEFAULT_TEMPLATE);});
        body.querySelectorAll('.fxi-wa').forEach(function(a){
          a.addEventListener('click',function(){
            var g=list[+a.dataset.i];
            a.href='https://wa.me/'+waPhone(g.phone)+'?text='+encodeURIComponent(message(ta.value||DEFAULT_TEMPLATE,g));
          });
        });
      }
    }
  }

  function canView(access){
    if(!access)return false;
    if(access.role==='owner')return true;
    var v=(access.permissions&&access.permissions.view)||[];
    return v.indexOf('batches')>=0||v.indexOf('overview')>=0||v.indexOf('reports')>=0||view==='previsao'&&v.indexOf('expenses')>=0;
  }

  function open(v){
    if(typeof v==='string')view=v;
    if(!overlay){
      overlay=h('<div class="fxi-overlay" role="dialog" aria-modal="true" aria-labelledby="fxi-title">'+
        '<div class="fxi-panel"><header class="fxi-top"><div><p class="eyebrow">FRANGO DA CASA</p><h1 id="fxi-title">Indicadores</h1><p class="fxi-sub">Como está a correr cada lote, quem falta pagar e os fechos de caixa.</p></div>'+
        '<div class="fxi-top-actions"><button type="button" class="fxi-refresh" title="Actualizar">Actualizar</button><button type="button" class="fxi-close" aria-label="Fechar">✕</button></div></header>'+
        '<div class="fxi-tabs" role="tablist"><button type="button" role="tab" data-v="lotes">Indicadores por lote</button><button type="button" role="tab" data-v="lembretes">Lembretes de dívida</button><button type="button" role="tab" data-v="fechos">Histórico de fechos</button><button type="button" role="tab" data-v="perdas">Dívidas perdidas</button><button type="button" role="tab" data-v="datas">Datas dos lotes</button></div>'+
        '<div class="fxi-body"></div></div></div>');
      document.body.appendChild(overlay);
      overlay.querySelector('.fxi-close').addEventListener('click',close);
      overlay.querySelector('.fxi-refresh').addEventListener('click',fetchAndRender);
      overlay.querySelectorAll('.fxi-tabs button').forEach(function(b){b.addEventListener('click',function(){view=b.dataset.v;render();});});
      document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.classList.contains('open'))close();});
    }
    var plan=view==='previsao';
    lotDates.loaded=false;
    overlay.querySelector('#fxi-title').textContent=plan?'Previsão de compras':'Indicadores';
    overlay.querySelector('.fxi-sub').textContent=plan?'O que cada lote em criação ou facturado ainda precisa de comprar, quanto custa, e o pagamento a partir daqui.':'Como está a correr cada lote, quem falta pagar e os fechos de caixa.';
    overlay.querySelector('.fxi-tabs').style.display=plan?'none':'';
    if(!plan)payForm=null;
    if(view!=='perdas')perdaArmed=false;
    overlay.classList.add('open');document.documentElement.classList.add('fxi-lock');
    var aside=document.querySelector('aside.sidebar');if(aside)aside.classList.add('fxi-on');
    fetchAndRender();
  }
  function close(){
    if(!overlay)return;overlay.classList.remove('open');document.documentElement.classList.remove('fxi-lock');
    if(dirtyFarm){dirtyFarm=false;location.reload();return;}
    var aside=document.querySelector('aside.sidebar');if(aside)aside.classList.remove('fxi-on');
  }
  var extraError='';
  function fetchExtra(){
    extraError='';
    return loadExtra().then(function(j){extraData=j;}).catch(function(e){extraData=null;extraError=e.message;});
  }
  function fetchAndRender(){
    lastData=null;render();
    fetchExtra().then(function(){if(lastData)render();});
    load().then(function(j){
      if(!canView(j.access)){overlay.querySelector('.fxi-body').innerHTML='<div class="fxi-empty">A tua conta não tem acesso aos indicadores.</div>';return;}
      lastData=j;render();
    }).catch(function(e){overlay.querySelector('.fxi-body').innerHTML='<div class="fxi-empty bad">'+esc(e.message)+'</div>';});
  }

  /* ---------- entrada no menu ---------- */
  var ICON='<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
  var ICON2='<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';
  function mount(){
    var nav=document.querySelector('aside.sidebar nav');
    if(!nav||nav.querySelector('.fx-ind-btn'))return;
    var btn=h('<button type="button" class="fx-ind-btn">'+ICON+'<span>Indicadores</span><span class="fx-new">novo</span></button>');
    btn.addEventListener('click',function(e){e.preventDefault();open(view==='previsao'?'lotes':undefined);});
    var btn2=h('<button type="button" class="fx-ind-btn fx-cri-btn">'+ICON2+'<span>Previsão de compras</span><span class="fx-new">novo</span></button>');
    btn2.addEventListener('click',function(e){e.preventDefault();open('previsao');});
    var mgmt=nav.querySelector('.management-label');
    if(mgmt){nav.insertBefore(btn,mgmt);nav.insertBefore(btn2,mgmt);}else{nav.appendChild(btn);nav.appendChild(btn2);}
    nav.addEventListener('click',function(e){var b=e.target.closest('button');if(b&&b!==btn&&b!==btn2&&!b.classList.contains('nav-group-toggle'))close();},true);
  }
  /* ---------- Cobranças: botão WhatsApp em cada cliente com dívida ---------- */
  var cob={data:null,at:0,loading:false};
  function cobData(){
    if(cob.loading||Date.now()-cob.at<5000)return;
    cob.loading=true;
    load().then(function(j){var d=j.state;d.customers=d.customers||[];d.payments=d.payments||[];cob.data=d;cob.access=j.access;cob.at=Date.now();cob.loading=false;cobranca();})
      .catch(function(){cob.loading=false;cob.at=Date.now();});
  }
  function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();}
  function cobranca(){
    var h1=document.querySelector('main h1');
    if(!h1||h1.textContent.trim()!=='Cobranças')return;
    var head=document.querySelector('main .page-heading .heading-actions');
    if(head&&!head.querySelector('.fx-wa-open')){
      var ob=h('<button type="button" class="secondary fx-wa-open">Mensagem dos lembretes</button>');
      ob.addEventListener('click',function(){view='lembretes';open();});
      head.appendChild(ob);
    }
    var cells=document.querySelectorAll('main th.matrix-customer');
    if(!cells.length)return;
    cobData();
    if(!cob.data)return;
    var list=debtors(cob.data);
    cells.forEach(function(th){
      var box=th.querySelector('.customer-row-actions');if(!box||box.querySelector('.fx-wa-mini,.fx-lost-mini'))return;
      var name=th.querySelector('span'),num=null;
      th.querySelectorAll('small').forEach(function(s){var m=/^CLI-(\d+)$/.exec(s.textContent.trim());if(m)num=+m[1];});
      var g=list.find(function(x){return num!=null&&x.number===num;})||list.find(function(x){return name&&norm(x.name)===norm(name.textContent);});
      if(!g)return;
      if(cob.access&&cob.access.role==='owner'&&g.id){
        var lb=h('<button type="button" class="mini-button fx-lost-mini">Dar como perdida</button>');
        lb.addEventListener('click',function(){perdaCustomer=g.id;perdaArmed=false;open('perdas');});
        box.appendChild(lb);
      }
      if(!waPhone(g.phone))return;
      var a=h('<a class="mini-button fx-wa-mini" target="_blank" rel="noopener" href="#">WhatsApp</a>');
      a.addEventListener('click',function(){var cur=debtors(cob.data);g=cur.find(function(x){return x.number!=null&&x.number===g.number;})||cur.find(function(x){return norm(x.name)===norm(g.name);})||g;a.href='https://wa.me/'+waPhone(g.phone)+'?text='+encodeURIComponent(message(store(TEMPLATE_KEY)||DEFAULT_TEMPLATE,g));});
      box.appendChild(a);
    });
  }

  /* ---------- Imprimir o fecho do dia (Visão geral › Fechos diários) ---------- */
  function printDaily(){
    var sec=document.querySelector('main section.frango-daily');if(!sec)return;
    var input=sec.querySelector('.frango-daily-heading input[type=date]'),dt=input?input.value:'';
    var c=sec.cloneNode(true);
    c.querySelectorAll('.frango-daily-heading,.fx-close,button,input,script').forEach(function(n){n.remove();});
    c.querySelectorAll('[data-fx]').forEach(function(n){n.removeAttribute('data-fx');});
    var closed=extraData&&extraData.extra&&extraData.extra.closedUntil&&dt&&dt<=extraData.extra.closedUntil;
    var name=(document.querySelector('aside.sidebar .brand strong,aside.sidebar strong')||{}).textContent||'Frango da Casa';
    var now=new Date().toLocaleString('pt-PT',{timeZone:'Africa/Maputo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    var css='@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#163e31;font-size:11px;margin:0}'+
      'header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #075b43;padding-bottom:10px;margin-bottom:14px}header img{height:54px}'+
      'header h1{font-size:18px;margin:0}header p{margin:2px 0 0;color:#58796a;font-size:11px}.stamp{margin-left:auto;text-align:right;font-size:10px;color:#58796a}'+
      '.stamp b{display:block;font-size:12px;color:'+(closed?'#1e3a5f':'#8a4b08')+'}'+
      'h3{font-size:13px;margin:16px 0 6px}h3 small{font-weight:normal;color:#6c7f73}'+
      '.frango-daily-totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.frango-daily-totals>div{border:1px solid #cfdcd3;border-radius:6px;padding:8px}'+
      '.frango-daily-totals span{display:block;font-size:10px;color:#58796a}.frango-daily-totals strong{font-size:14px}'+
      'p{margin:8px 0;line-height:1.4}table{width:100%;border-collapse:collapse;margin-top:4px;font-size:10.5px}th,td{border:1px solid #d6e1da;padding:5px 6px;text-align:left;vertical-align:top;font-size:10.5px}'+
      'thead th{background:#edf4ee;font-size:10px}tfoot th,tfoot td{background:#f4f8f5;font-weight:bold}tr{page-break-inside:avoid}'+
      '.sign{display:flex;gap:40px;margin-top:36px}.sign div{flex:1;border-top:1px solid #163e31;padding-top:4px;font-size:10px;color:#58796a}';
    var html='<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Fecho de '+day(dt)+'</title><style>'+css+'</style></head><body>'+
      '<header><img src="'+location.origin+'/logo-documentos.png" alt=""><div><h1>Fecho diário das vendas</h1><p>'+esc(name)+'</p></div>'+
      '<div class="stamp"><b>'+(closed?'Dia fechado':'Dia ainda aberto')+'</b>Impresso em '+esc(now)+'</div></header>'+
      c.innerHTML+'<div class="sign"><div>Preparado por</div><div>Verificado por</div></div></body></html>';
    var old=document.getElementById('fx-print-frame');if(old)old.remove();
    var f=document.createElement('iframe');f.id='fx-print-frame';f.setAttribute('aria-hidden','true');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    var d=f.contentDocument;d.open();d.write(html);d.close();
    var done=false,go=function(){if(done)return;done=true;try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}};
    var img=d.querySelector('img');if(img&&!img.complete){img.onload=img.onerror=go;setTimeout(go,1500);}else setTimeout(go,50);
  }
  function printUi(){
    var headEl=document.querySelector('main .frango-daily-heading');if(!headEl||headEl.querySelector('.fx-print-day'))return;
    var b=h('<button type="button" class="secondary fx-print-day">Imprimir fecho</button>');
    b.addEventListener('click',printDaily);
    headEl.appendChild(b);
  }

  /* ---------- Cobranças: exportação por lote (Excel e PDF) no formato das tabelas lado a lado ---------- */
  function debtGroups(groups){
    return groups.map(function(g){return {name:g.name,total:g.total,rows:g.rows.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name),'pt',{sensitivity:'base'});})};});
  }
  function xesc(v){return String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function zip(files){
    var enc=new TextEncoder(),parts=[],dir=[],offset=0,dirSize=0;
    Object.keys(files).forEach(function(name){
      var path=enc.encode(name),bytes=enc.encode(files[name]),crc=0xffffffff;
      for(var i=0;i<bytes.length;i++){crc^=bytes[i];for(var k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
      crc=(crc^0xffffffff)>>>0;
      var local=new Uint8Array(30+path.length),central=new Uint8Array(46+path.length),l=new DataView(local.buffer),c=new DataView(central.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,path.length,true);local.set(path,30);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);central.set(local.subarray(4,28),6);c.setUint32(42,offset,true);central.set(path,46);
      parts.push(local,bytes);dir.push(central);offset+=local.length+bytes.length;dirSize+=central.length;
    });
    var end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,dir.length,true);end.setUint16(10,dir.length,true);end.setUint32(12,dirSize,true);end.setUint32(16,offset,true);
    return parts.concat(dir,[end.buffer]);
  }
  function debtWorkbook(groups){
    groups=debtGroups(groups);
    var NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PKG='http://schemas.openxmlformats.org/package/2006/relationships';
    // estilos: fonte (0 normal, 1 negrito), cor (0 nenhuma, 2 cabeçalho, 3 amarelo, 4 total), formato (0 ou 164 = MZN), alinhamento, bordas
    var xfs=[],xfKey={},borders=[],bKey={};
    function border(l,r,t,b){var k=[l,r,t,b].join('');if(bKey[k]===undefined){bKey[k]=borders.length;borders.push('<border>'+[['left',l],['right',r],['top',t],['bottom',b]].map(function(x){return x[1]?'<'+x[0]+' style="thin"><color rgb="FF000000"/></'+x[0]+'>':'<'+x[0]+'/>';}).join('')+'<diagonal/></border>');}return bKey[k];}
    border(0,0,0,0);
    function style(o){var b=border(o.l?1:0,o.r?1:0,o.t?1:0,o.b?1:0),k=[o.bold?1:0,o.fill||0,o.money?164:0,o.align||'',b].join('|');
      if(xfKey[k]===undefined){xfKey[k]=xfs.length;xfs.push('<xf numFmtId="'+(o.money?164:0)+'" fontId="'+(o.bold?1:0)+'" fillId="'+(o.fill||0)+'" borderId="'+b+'" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"'+(o.align?' applyAlignment="1"><alignment horizontal="'+o.align+'" vertical="center"/></xf>':'/>'));}
      return xfKey[k];}
    style({});
    function col(i){var r='';for(i++;i;i=Math.floor((i-1)/26))r=String.fromCharCode(65+(i-1)%26)+r;return r;}
    var maxRows=Math.max.apply(null,groups.map(function(g){return g.rows.length;}).concat([0]));
    var firstRow=2,lastTableRow=firstRow+maxRows+1,frameBottom=lastTableRow+1,lastCol=groups.length*4,cells={};
    function put(c,r,v,st){cells[r]=cells[r]||{};cells[r][c]={v:v,s:st};}
    groups.forEach(function(g,gi){
      var c0=1+gi*4,end=firstRow+g.rows.length+1;
      put(c0,firstRow,'Ordem',{bold:1,fill:2,align:'center',l:1,t:1});
      put(c0+1,firstRow,'Nome',{bold:1,fill:2,align:'center',t:1});
      put(c0+2,firstRow,'Dívida · '+g.name,{bold:1,fill:2,align:'right',r:1,t:1});
      g.rows.forEach(function(row,i){var r=firstRow+1+i,y=row.multiple?3:0;
        put(c0,r,i+1,{fill:y,align:'center',l:1});put(c0+1,r,row.name,{fill:y});put(c0+2,r,row.amount/100,{fill:y,money:1,align:'right',r:1});});
      put(c0,end,'',{l:1,b:1});put(c0+1,end,'Total',{bold:1,fill:4,b:1});put(c0+2,end,g.total/100,{bold:1,fill:4,money:1,align:'right',r:1,b:1});
    });
    // moldura exterior
    for(var r=1;r<=frameBottom;r++)for(var c=0;c<=lastCol;c++){
      var top=r===1,bot=r===frameBottom,left=c===0,right=c===lastCol;if(!(top||bot||left||right))continue;
      if(cells[r]&&cells[r][c])continue;put(c,r,'',{l:left,r:right,t:top,b:bot});}
    var rows=[];
    for(var rr=1;rr<=frameBottom;rr++){var cs=cells[rr]||{},keys=Object.keys(cs).map(Number).sort(function(a,b){return a-b;});
      rows.push('<row r="'+rr+'"'+(rr===firstRow?' ht="18" customHeight="1"':'')+'>'+keys.map(function(c){var x=cs[c],ref=col(c)+rr,s=style(x.s);
        if(x.v===''||x.v===undefined)return '<c r="'+ref+'" s="'+s+'"/>';
        return typeof x.v==='number'?'<c r="'+ref+'" s="'+s+'"><v>'+x.v+'</v></c>':'<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+xesc(x.v)+'</t></is></c>';}).join('')+'</row>');}
    var widths=[];for(var ci=0;ci<=lastCol;ci++)widths.push('<col min="'+(ci+1)+'" max="'+(ci+1)+'" width="'+(ci===0||ci===lastCol?2.5:[7,22,20,3][(ci-1)%4])+'" customWidth="1"/>');
    var fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'].concat(['FFE7EDE9','FFFFF354','FFDCEBD7'].map(function(c){return '<fill><patternFill patternType="solid"><fgColor rgb="'+c+'"/><bgColor indexed="64"/></patternFill></fill>';}));
    var sheet='<worksheet xmlns="'+NS+'" xmlns:r="'+REL+'"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>'+widths.join('')+'</cols><sheetData>'+rows.join('')+'</sheetData>'+
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    var stylesXml='<styleSheet xmlns="'+NS+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;MZN&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="'+fills.length+'">'+fills.join('')+'</fills><borders count="'+borders.length+'">'+borders.join('')+'</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+xfs.length+'">'+xfs.join('')+'</cellXfs></styleSheet>';
    var ct='application/vnd.openxmlformats-officedocument.spreadsheetml.';
    return zip({
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="'+ct+'sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="'+ct+'styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="'+ct+'worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="'+PKG+'"><Relationship Id="rId1" Type="'+REL+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="'+NS+'" xmlns:r="'+REL+'"><sheets><sheet name="Cobranças por lote" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="'+PKG+'"><Relationship Id="rId1" Type="'+REL+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+REL+'/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':stylesXml,
      'xl/worksheets/sheet1.xml':sheet
    });
  }
  window.fxDebtExcel=function(groups){
    var url=URL.createObjectURL(new Blob(debtWorkbook(groups),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    var a=document.createElement('a');a.href=url;a.download='cobrancas-por-lote-'+today()+'.xlsx';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1500);
  };
  window.fxDebtPrint=function(groups){
    groups=debtGroups(groups);
    var nb=String.fromCharCode(160),mz=function(c){var neg=c<0,v=Math.abs(Math.round(c)),i=String(Math.floor(v/100)).replace(/\B(?=(\d{3})+(?!\d))/g,nb),d=String(v%100).padStart(2,'0');return (neg?'-':'')+i+','+d+nb+'MZN';};
    var all=sum(groups,function(g){return g.total;});
    var tables=groups.map(function(g,gi){
      return '<table><thead><tr><th class="o">Ordem</th><th>Nome</th><th class="m">Dívida · '+esc(g.name)+'</th></tr></thead><tbody>'+
        g.rows.map(function(r,i){return '<tr'+(r.multiple?' class="y"':'')+'><td class="o">'+(i+1)+'</td><td>'+esc(r.name)+'</td><td class="m">'+mz(r.amount)+'</td></tr>';}).join('')+
        '<tr class="t"><td class="o blank"></td><td>Total</td><td class="m">'+mz(g.total)+'</td></tr></tbody></table>';
    });
    var rowsHtml='';for(var ri=0;ri<tables.length;ri+=4)rowsHtml+='<div class="row">'+tables.slice(ri,ri+4).join('')+'</div>';
    var css='@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Calibri,Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:9px}'+
      'h1{font-size:15px;margin:0 0 2px}p.s{margin:0 0 8px;color:#444;font-size:10px}'+
      '.frame{border:1.5px solid #000;padding:6px;display:block;width:max-content}.row{display:flex;align-items:flex-start;gap:10px}.row+.row{margin-top:10px}'+
      'table{border-collapse:collapse;border:1.5px solid #000;font-size:9px}th,td{padding:1px 4px;white-space:nowrap;text-align:left}'+
      'thead th{background:#e7ede9;font-weight:bold;text-align:center}thead th.m{text-align:right}td.o,th.o{text-align:center;width:30px}td.m{text-align:right}'+
      'tr.y td{background:#fff354}tr.t td{background:#dcebd7;font-weight:bold}tr.t td.blank{background:#fff}'+
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
    var html='<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Cobranças por lote</title><style>'+css+'</style></head><body>'+
      '<h1>Frango da Casa · Cobranças por lote</h1><p class="s">'+esc(new Date().toLocaleDateString('pt-PT',{timeZone:'Africa/Maputo'}))+' · Total em dívida: <b>'+mz(all)+'</b> · Amarelo: cliente com dívida em mais de um lote.</p>'+
      '<div class="frame">'+rowsHtml+'</div></body></html>';
    var old=document.getElementById('fx-print-frame');if(old)old.remove();
    var fr=document.createElement('iframe');fr.id='fx-print-frame';fr.setAttribute('aria-hidden','true');fr.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    fr.style.width='1200px';fr.style.height='800px';
    document.body.appendChild(fr);var doc=fr.contentDocument;doc.open();doc.write(html);doc.close();
    setTimeout(function(){
      // Ocupa uma folha A4 deitada (cerca de 1020 x 640 px úteis): aumenta ou reduz o tamanho, sem ficar ilegível.
      try{var b=doc.body,fr2=doc.querySelector('.frame').getBoundingClientRect(),w=fr2.right,hh=fr2.bottom,z=Math.min(1.6,1020/w,640/hh);b.style.zoom=String(Math.max(z,0.55));}catch(e){}
      try{fr.contentWindow.focus();fr.contentWindow.print();}catch(e){}
    },120);
  };

  /* ---------- Relatórios: resumo de cada lote (entradas, saídas, gastos, lucro bruto e líquido) ---------- */
  function addDays(d,n){var x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}
  function monthEnd(m){var y=+m.slice(0,4),n=+m.slice(5,7);return new Date(Date.UTC(y,n,0,12)).toISOString().slice(0,10);}
  function lotRange(farm,r,t){
    var b=r.batch,x=lotDates.map[b.id]||{};if(!b.date||b.status==='facturado')return null;
    var startD=x.arrival||b.date,end=t;
    if(b.status==='encerrado'&&x.closed)end=x.closed;
    else if(b.status==='encerrado'){
      end=startD;
      r.sales.forEach(function(s){if(s.date&&s.date>end)end=s.date;});
      farm.production.forEach(function(p){if(p.batch===b.id&&p.date&&p.date>end)end=p.date;});
    }
    return {start:startD,end:end<startD?startD:end};
  }
  // Salários de cada mês divididos pelos lotes activos nesse mês, na proporção dos dias de cada lote no mês.
  function salaryShares(farm,rows){
    var t=today(),byMonth={},share={},months={},loose=0,looseMonths=[];
    (farm.expenses||[]).forEach(function(e){
      if(e.category!=='Salários'||e.batch)return;
      var m=e.referenceMonth||(e.date||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))return;
      byMonth[m]=(byMonth[m]||0)+(e.amount||0);
    });
    var ranges=rows.map(function(r){return lotRange(farm,r,t);});
    Object.keys(byMonth).sort().forEach(function(m){
      var a=m+'-01',z=monthEnd(m),days=ranges.map(function(g){
        if(!g)return 0;var s=g.start>a?g.start:a,e=g.end<z?g.end:z;
        return e<s?0:daysBetween(s,e)+1;});
      var all=days.reduce(function(x,y){return x+y;},0);
      if(!all){loose+=byMonth[m];looseMonths.push(m);return;}
      var given=0,lastI=-1;days.forEach(function(d,i){if(d)lastI=i;});
      days.forEach(function(d,i){
        if(!d)return;var id=rows[i].batch.id,v=i===lastI?byMonth[m]-given:Math.round(byMonth[m]*d/all);
        given+=v;share[id]=(share[id]||0)+v;(months[id]=months[id]||[]).push(m);
      });
    });
    return {share:share,months:months,ranges:ranges,loose:loose,looseMonths:looseMonths};
  }
  var MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  function monthsLabel(ms){
    if(!ms||!ms.length)return '—';
    return ms.map(function(m){return MES[+m.slice(5,7)-1]+'/'+m.slice(2,4);}).join(', ');
  }
  window.fxLotSummary=function(o){
    try{
      var h=o.h,farm=o.farm,money=o.money,all=o.rows.filter(function(r){return r.batch.quantity>0;});
      if(!all.length)return null;
      var shown=o.detail?[o.detail]:all;
      var sal=salaryShares(farm,all);
      var cat=function(r){var x=o.sales(farm,r.batch.id).rows;return x;};
      var data=shown.map(function(r,i){
        var c=cat(r),froz=r.sales.filter(function(s){return s.product==='congelado';});
        var chicks=r.costs&&r.costs.get?(r.costs.get('Compra de pintos')||0):(r.batch.purchaseCost||0);
        var salary=sal.share[r.batch.id]||0,gross=r.revenue-r.cost;
        var g=sal.ranges[all.indexOf(r)];
        return {tl:timeline(farm,r.batch),r:r,c:c,frozen:sum(froz,function(s){return s.quantity;}),chicks:chicks,other:r.cost-chicks,salary:salary,gross:gross,net:gross-salary,range:g,months:sal.months[r.batch.id]};
      });
      var many=data.length>1;
      var tot=function(f){return sum(data,f);};
      var anyFrozen=data.some(function(x){return x.frozen>0;});
      var qty=function(n){return Math.round(n).toLocaleString('pt-PT');};
      var catCell=function(k){return function(x){var c=x.c[k]||{quantity:0,amount:0};return c.quantity?qty(c.quantity)+' · '+money(c.amount):'0';};};
      var catTot=function(k){var q=tot(function(x){return (x.c[k]||{}).quantity||0;}),a=tot(function(x){return (x.c[k]||{}).amount||0;});return q?qty(q)+' · '+money(a):'0';};
      var tone=function(v){return {color:v<0?'#b42318':'#067647',fontWeight:700};};
      var L=[
        ['sec','Frangos'],
        ['row','Pintos que entraram',function(x){return qty(x.r.batch.quantity);},function(){return qty(tot(function(x){return x.r.batch.quantity;}));},'b'],
        ['row','Vendidos',function(x){return qty(x.r.sold);},function(){return qty(tot(function(x){return x.r.sold;}));},'b'],
        ['row','· pagas no acto',catCell(0),function(){return catTot(0);},'i'],
        ['row','· pagas parcialmente',catCell(1),function(){return catTot(1);},'i'],
        ['row','· a crédito',catCell(2),function(){return catTot(2);},'i']
      ];
      if(anyFrozen)L.push(['row','· dos quais congelados',function(x){return qty(x.frozen);},function(){return qty(tot(function(x){return x.frozen;}));},'i']);
      L=L.concat([
        ['row','Mortes',function(x){return qty(x.r.deaths);},function(){return qty(tot(function(x){return x.r.deaths;}));}],
        ['row','Ofertas',function(x){return qty(x.r.gifts);},function(){return qty(tot(function(x){return x.r.gifts;}));}],
        ['row','Outras saídas (perdas)',function(x){return qty(x.r.losses);},function(){return qty(tot(function(x){return x.r.losses;}));}],
        ['row','Ainda no lote',function(x){return qty(x.r.available);},function(){return qty(tot(function(x){return x.r.available;}));}],
        ['sec','Tempos (dia 1 = chegada ao aviário)'],
        ['row','Facturado em',function(x){return day(x.tl.invoiced);},function(){return '';}],
        ['row','Chegada ao aviário',function(x){return x.tl.waiting?'por levantar':x.tl.arrival?day(x.tl.arrival):'sem data';},function(){var a=avg(data.map(function(x){return x.tl.wait;}));return a!==null?'espera média '+daysLabel(a):'';}],
        ['row','1.ª venda',function(x){return x.tl.toFirst!==null?dayLabel(x.tl.toFirst)+' · '+day(x.tl.first):x.tl.first?day(x.tl.first):'—';},function(){var a=avg(data.map(function(x){return x.tl.toFirst;}));return a!==null?'média: dia '+int(a):'';}],
        ['row','Dias de vendas',function(x){return daysLabel(x.tl.salesDays);},function(){var a=avg(data.filter(function(x){return x.tl.duration!==null;}).map(function(x){return x.tl.salesDays;}));return a!==null?'média '+daysLabel(a):'';}],
        ['row','Duração do lote',function(x){return x.tl.duration!==null?daysLabel(x.tl.duration)+' · encerrado '+day(x.tl.closed):x.tl.dayN!==null?dayLabel(x.tl.dayN)+' (em curso)':'—';},function(){var a=avg(data.map(function(x){return x.tl.duration;}));return a!==null?'média '+daysLabel(a):'';},'b'],
        ['sec','Dinheiro'],
        ['row','Compra de pintos',function(x){return money(x.chicks);},function(){return money(tot(function(x){return x.chicks;}));}],
        ['row','Despesas do lote',function(x){return money(x.other);},function(){return money(tot(function(x){return x.other;}));}],
        ['row','Gasto total do lote',function(x){return money(x.r.cost);},function(){return money(tot(function(x){return x.r.cost;}));},'b'],
        ['row','Total vendido',function(x){return money(x.r.revenue);},function(){return money(tot(function(x){return x.r.revenue;}));},'b'],
        ['row','Lucro bruto',function(x){return money(x.gross);},function(){return money(tot(function(x){return x.gross;}));},'g',function(x){return x.gross;},function(){return tot(function(x){return x.gross;});}],
        ['row','Salários dos meses do lote',function(x){return x.salary?'− '+money(x.salary):money(0);},function(){var s=tot(function(x){return x.salary;});return s?'− '+money(s):money(0);}],
        ['row','· meses considerados',function(x){return monthsLabel(x.months);},function(){return '';},'i'],
        ['row','Lucro líquido',function(x){return money(x.net);},function(){return money(tot(function(x){return x.net;}));},'n',function(x){return x.net;},function(){return tot(function(x){return x.net;});}]
      ]);
      var heads=[''].concat(data.map(function(x){return x.r.batch.name;}));if(many)heads.push('Total');
      var cellStyle={textAlign:'right',whiteSpace:'nowrap'};
      var body=L.map(function(l,i){
        if(l[0]==='sec')return h('tr',{children:h('th',{colSpan:heads.length,scope:'colgroup',style:{background:'#edf4ee',textAlign:'left',paddingTop:8},children:l[1]})},'s'+i);
        var kind=l[4]||'',strong=kind==='b'||kind==='g'||kind==='n',bg=kind==='n'?{background:'#f4f8f5'}:{};
        var lab=h('th',{scope:'row',style:Object.assign({textAlign:'left',fontWeight:strong?700:kind==='i'?400:500,paddingLeft:kind==='i'?18:undefined,color:kind==='i'?'#58796a':undefined},bg),children:l[1]},'l');
        var cells=data.map(function(x,j){
          var st=Object.assign({},cellStyle,bg,strong?{fontWeight:700}:{},kind==='i'?{color:'#58796a'}:{},l[5]?tone(l[5](x)):{});
          return h('td',{style:st,children:l[2](x)},'c'+j);
        });
        if(many)cells.push(h('td',{style:Object.assign({},cellStyle,bg,{fontWeight:700,borderLeft:'2px solid #cfdcd3'},l[6]?tone(l[6]()):{},kind==='i'?{color:'#58796a',fontWeight:400}:{}),children:l[3]()},'t'));
        return h('tr',{children:[lab].concat(cells)},'r'+i);
      });
      var period=data.map(function(x){return x.r.batch.name+': '+(x.range?day(x.range.start)+' a '+(x.r.batch.status==='encerrado'?day(x.range.end):'hoje'):x.r.batch.status==='facturado'?'por levantar':'sem data');}).join(' · ');
      var notes=['Gasto total = compra dos pintos + despesas registadas no lote. Lucro bruto = total vendido − gasto total.',
        'Lucro líquido = lucro bruto − salários. Os salários de cada mês são divididos pelos lotes que estavam na quinta nesse mês, conforme os dias de cada um (da entrada dos pintos à última venda; lotes em curso até hoje). Contam só os salários já registados na Folha Salarial.',
        'Período de cada lote: '+period+'. Os tempos contam a partir da chegada ao aviário (dia 1); um lote «Facturado» ainda não chegou e não entra nos salários.'];
      if(sal.loose&&!o.detail)notes.push('Salários de meses sem nenhum lote ('+monthsLabel(sal.looseMonths)+', '+money(sal.loose)+') não entram em nenhum lote.');
      if(data.some(function(x){return x.r.batch.status!=='encerrado';}))notes.push('Lotes ainda não encerrados: valores provisórios.');
      return h('div',{className:'fx-lot-summary',children:[
        h('h3',{children:o.detail?'Resumo do lote · '+o.detail.batch.name:'Resumo dos lotes'},'t'),
        h('div',{className:'table-scroll',children:h('table',{'aria-label':'Resumo dos lotes',children:[
          h('thead',{children:h('tr',{children:heads.map(function(x,i){return h('th',{scope:'col',style:i?{textAlign:'right',whiteSpace:'nowrap'}:{},children:x},'h'+i);})})},'h'),
          h('tbody',{children:body},'b')]})},'tbl'),
        h('div',{children:notes.map(function(n,i){return h('p',{className:'muted small',style:{margin:'4px 0'},children:n},'n'+i);})},'notes')
      ]},'fx-lot-summary');
    }catch(e){try{console.warn('Resumo dos lotes',e);}catch(_){}return null;}
  };

  /* ---------- Acessos: palavra-passe no «Preparar acesso de colaborador» e mudança de palavra-passe ---------- */
  var acc={members:null,loading:false,msg:null,pending:null,pw:'',pw2:''};
  function api(path,body){
    var t=token();if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    var o={headers:{Authorization:'Bearer '+t,apikey:KEY},credentials:'omit',cache:'no-store'};
    if(body){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
    return fetch(API+path,o).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Não foi possível concluir.');return j;});});
  }
  function usersApi(body){
    var t=token();if(!t)return Promise.reject(new Error('A sessão terminou. Volta a entrar.'));
    return fetch(API.replace(/aviario-web$/,'aviario-users'),{method:'POST',headers:{Authorization:'Bearer '+t,apikey:KEY,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Não foi possível concluir.');return j;});});
  }
  function accMembers(){
    if(acc.loading)return;acc.loading=true;
    api('/access').then(function(j){acc.members=j.members||[];acc.loading=false;accessUi(true);}).catch(function(e){acc.loading=false;acc.members=[];acc.msg={text:e.message,bad:true};accessUi(true);});
  }
  function pwOk(a,b){if(a.length<8)return 'A palavra-passe tem de ter pelo menos 8 caracteres.';if(a.length>72)return 'A palavra-passe tem no máximo 72 caracteres.';if(a!==b)return 'As duas palavras-passe não são iguais.';return '';}
  function accessCss(){if(document.getElementById('fx-login-css'))return;var st=document.createElement('style');st.id='fx-login-css';st.textContent=
    '.fx-login-panel{display:grid;gap:14px}.fx-login-panel .fxi-form{margin:0}.fx-login-panel .fxi-form>p.fxi-muted{margin:0 0 12px;line-height:1.45}'+
    '.fx-login-panel .fxi-primary{background:#075b43;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;opacity:1;cursor:pointer}.fx-login-panel .fxi-primary:disabled{opacity:.6;cursor:wait}'+
    '.fx-pw-block{border:1px dashed #b9cdbf;border-radius:12px;padding:12px 14px;margin:14px 18px;background:#f7faf8}.fx-pw-block h4{margin:0 0 4px;font-size:13px}.fx-pw-block p{margin:0 0 10px;font-size:12px;color:#58796a;line-height:1.4}'+
    '.fx-pw-block .fx-pw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));gap:10px 14px}.fx-pw-block label{display:flex;flex-direction:column;gap:6px;font-size:11.5px;font-weight:600;color:#4d6457}'+
    '.fx-pw-block .fx-pw-msg{margin-top:8px}.fx-pw-block .fx-pw-show{flex-direction:row;align-items:center;gap:8px;padding-top:22px}.fx-pw-block .fx-pw-show input{width:16px;height:16px;margin:0;flex:none}';
    document.head.appendChild(st);}
  // Depois de o «Guardar permissões» da app gravar o acesso, define a palavra-passe desse colaborador.
  (function(){
    if(window.__fxAccFetch)return;window.__fxAccFetch=true;
    var orig=window.fetch;
    window.fetch=function(input,init){
      var p=orig.apply(this,arguments);
      try{
        var url=typeof input==='string'?input:(input&&input.url)||'',method=(init&&init.method)||(input&&input.method)||'GET';
        if(acc.pending&&method==='POST'&&/\/aviario-web\/access$/.test(url.split('?')[0])){
          var pend=acc.pending;acc.pending=null;
          p.then(function(r){if(!r.ok)return;return r.clone().json().then(function(j){
            var m=(j.members||[]).find(function(x){return String(x.email).toLowerCase()===pend.email;});
            if(!m)throw new Error('Acesso guardado, mas não encontrei o colaborador para definir a palavra-passe.');
            if(!m.enabled)throw new Error('Acesso guardado, mas o colaborador está suspenso: a palavra-passe não foi definida.');
            return usersApi({id:m.id,password:pend.pw}).then(function(){acc.pw=acc.pw2='';pwMsg({text:'Palavra-passe definida: '+m.name+' já pode entrar com '+m.email+'.'});acc.members=null;accessUi(true);});
          });}).catch(function(e){pwMsg({text:e.message,bad:true});});
        }
      }catch(e){}
      return p;
    };
  })();
  var pwLast=null;
  function pwMsg(m){pwLast=m;var el=document.querySelector('.fx-pw-block .fx-pw-msg');if(el)el.innerHTML='<div class="fxi-flash'+(m.bad?' bad':'')+'">'+esc(m.text)+'</div>';var b=document.querySelector('.fx-pw-block');if(b){b.querySelectorAll('input[type=password],input[data-pw]').forEach(function(i){if(!m.bad)i.value='';});}}
  function accessFormPw(){
    var sec=document.getElementById('access-form');if(!sec)return;
    var emailIn=sec.querySelector('input[type=email]');if(!emailIn)return;
    var blk=sec.querySelector('.fx-pw-block');
    if(!blk){
      var anchor=emailIn.closest('label');var grid=anchor&&anchor.parentNode;if(!grid)return;
      blk=document.createElement('div');blk.className='fx-pw-block';
      blk.innerHTML='<h4>Palavra-passe de entrada (opcional)</h4><p>Se preencher, a pessoa entra logo com este email e esta palavra-passe, sem convite por email. A categoria e as páginas são as que escolher abaixo. Para um colaborador já existente, muda a palavra-passe.</p>'+
        '<div class="fx-pw-grid"><label>Palavra-passe<input type="password" data-fx="pw" maxlength="72" autocomplete="new-password"></label>'+
        '<label>Repetir palavra-passe<input type="password" data-fx="pw2" maxlength="72" autocomplete="new-password"></label>'+
        '<label class="fx-pw-show"><input type="checkbox" data-fx="show"> Mostrar</label></div><div class="fx-pw-msg"></div>';
      grid.parentNode.insertBefore(blk,grid.nextSibling);
      var a=blk.querySelector('[data-fx=pw]'),b=blk.querySelector('[data-fx=pw2]');
      a.value=acc.pw;b.value=acc.pw2;
      a.addEventListener('input',function(){acc.pw=a.value;});b.addEventListener('input',function(){acc.pw2=b.value;});
      blk.querySelector('[data-fx=show]').addEventListener('change',function(e){[a,b].forEach(function(i){i.type=e.target.checked?'text':'password';});});
      if(pwLast)pwMsg(pwLast);
    }
    var form=sec.tagName==='FORM'?sec:sec.querySelector('form')||sec;
    if(!form.__fxPw){form.__fxPw=true;
      var check=function(e){
        if(e.type==='click'){var t=e.target.closest('button');if(!t||t.type!=='submit')return;}
        var pw=acc.pw||'',pw2=acc.pw2||'';
        if(!pw&&!pw2){acc.pending=null;return;}
        var err=pwOk(pw,pw2);
        if(err){e.preventDefault();e.stopPropagation();pwMsg({text:err,bad:true});return;}
        acc.pending={email:String(emailIn.value||'').trim().toLowerCase(),pw:pw};pwLast=null;
        var el=sec.querySelector('.fx-pw-block .fx-pw-msg');if(el)el.innerHTML='';
      };
      form.addEventListener('submit',check,true);
      if(form===sec)sec.addEventListener('click',check,true);
    }
  }
  function accessUi(force){
    var lay=document.querySelector('main .access-layout');if(!lay)return;
    accessCss();
    try{accessFormPw();}catch(e){}
    var box=lay.querySelector('.fx-login-panel');
    if(box&&!force)return;
    if(!box){box=document.createElement('section');box.className='fx-login-panel';var intro=lay.querySelector('.access-intro');lay.insertBefore(box,intro?intro.nextSibling:lay.firstChild);}
    if(!acc.members){box.innerHTML='<p class="fxi-muted">A carregar os utilizadores…</p>';accMembers();return;}
    var list=acc.members.filter(function(m){return m.enabled;});
    var m=acc.msg;acc.msg=null;
    box.innerHTML=(m?'<div class="fxi-flash'+(m.bad?' bad':'')+'">'+esc(m.text)+(m.bad?'':' <button type="button" class="fxi-link" data-fx-reload>Actualizar a lista abaixo</button>')+'</div>':'')+
      (list.length?'<form class="fxi-form" id="fx-set-pw"><h3>Definir ou mudar a palavra-passe de um colaborador</h3>'+
      '<p class="fxi-muted">Para colaboradores já criados (por exemplo, convidados que nunca entraram). Para criar um novo, use «Preparar acesso de colaborador» abaixo: escolha a categoria e as páginas e preencha a palavra-passe.</p><div class="fxi-fields">'+
      '<label>Colaborador<select name="id" required><option value="">Escolha o colaborador</option>'+list.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.email)+(x.hasJoined?'':' (ainda não entrou)')+'</option>';}).join('')+'</select></label>'+
      '<label>Nova palavra-passe<input type="password" name="pw" required minlength="8" maxlength="72" autocomplete="new-password"></label>'+
      '<label>Repetir palavra-passe<input type="password" name="pw2" required minlength="8" maxlength="72" autocomplete="new-password"></label>'+
      '</div><div class="fxi-form-actions"><button type="submit" class="fxi-primary">Guardar palavra-passe</button></div></form>':'');
    var rl=box.querySelector('[data-fx-reload]');if(rl)rl.addEventListener('click',function(){location.reload();});
    var g=box.querySelector('#fx-set-pw');
    if(g)g.addEventListener('submit',function(e){e.preventDefault();
      var id=val(g,'id'),pw=fld(g,'pw').value,err=pwOk(pw,fld(g,'pw2').value);
      var mm=acc.members.find(function(x){return x.id===id;});
      if(!mm){acc.msg={text:'Escolha o colaborador.',bad:true};accessUi(true);return;}
      if(err){acc.msg={text:err,bad:true};accessUi(true);return;}
      var bt=g.querySelector('button[type=submit]');bt.disabled=true;bt.textContent='A guardar…';
      usersApi({id:mm.id,password:pw})
      .then(function(){acc.msg={text:'Palavra-passe de '+mm.name+' guardada. Já pode entrar com '+mm.email+'.'};acc.members=null;accessUi(true);})
      .catch(function(er){acc.msg={text:er.message,bad:true};acc.members=null;accessUi(true);});
    });
  }

  var q=false;
  function tick(){q=false;mount();try{if(!lotDates.loaded&&!lotDates.loading&&token())fetchLotDates(function(){});}catch(e){}try{cobranca();}catch(e){}try{closeUi();}catch(e){}try{printUi();}catch(e){}try{accessUi();}catch(e){}}
  function start(){
    new MutationObserver(function(){if(!q){q=true;requestAnimationFrame(tick);}}).observe(document.body,{childList:true,subtree:true});
    mount();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
