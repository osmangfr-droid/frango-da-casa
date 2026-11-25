/* Frango da Casa — camada visual 19/11/2026
   Acrescenta apenas o atributo data-fx às células das tabelas (alinhamento de números,
   valores negativos, estados). Não altera texto, dados nem eventos da aplicação. */
(function(){
  'use strict';
  var NUM=/^[−-]?\s?[\d   .]*\d(,\d+)?\s?(MT|%|kg)?$|^\d+\s?\/\s?\d+$|^—$/;
  var NEG=/^[−-]\s?[\d   .]*\d/;
  var ZERO=/^0(,0+)?\s?(MT)?$/;
  var STATUS={
    'Em vendas':'st-ok','Pagas no acto':'st-ok','Pago':'st-ok','Activo':'st-ok','Liquidada':'st-ok','Liquidado':'st-ok',
    'Em criação':'st-info','Facturado':'st-fact','Pagas parcialmente':'st-info','Vence hoje':'st-warn',
    'Crédito':'st-warn','A crédito':'st-warn','Por confirmar':'st-warn','Sem data prevista':'st-off',
    'Em atraso':'st-bad',
    'Encerrado':'st-off','Inactivo':'st-off'
  };
  function set(el,v){ if(v){ if(el.getAttribute('data-fx')!==v) el.setAttribute('data-fx',v); } else if(el.hasAttribute('data-fx')) el.removeAttribute('data-fx'); }
  function txt(el){ return (el.textContent||'').replace(/\s+/g,' ').trim(); }

  function scanTable(table){
    var body=table.tBodies[0]; if(!body) return;
    var rows=[].slice.call(body.rows), cols=[];
    rows.forEach(function(r){
      var cells=r.cells, plain=true;
      for(var i=0;i<cells.length;i++) if(cells[i].colSpan>1){ plain=false; break; }
      for(var j=0;j<cells.length;j++){
        var c=cells[j], t=txt(c), f=[];
        if(c.querySelector('button,input,select,a')){ set(c,''); continue; }
        if(STATUS[t]) f.push('st',STATUS[t]);
        else if(t && NUM.test(t)){
          if(NEG.test(t)) f.push('neg'); else if(ZERO.test(t)) f.push('zero');
          if(plain){ cols[j]=cols[j]||{n:0,t:0}; cols[j].n++; }
        }
        if(plain && t && t!=='—'){ cols[j]=cols[j]||{n:0,t:0}; cols[j].t++; }
        c.__fx=f;
      }
    });
    var numCol=cols.map(function(c){ return c && c.t>0 && c.n/c.t>=.75; });
    rows.forEach(function(r){
      var plain=true; for(var i=0;i<r.cells.length;i++) if(r.cells[i].colSpan>1){ plain=false; break; }
      for(var j=0;j<r.cells.length;j++){
        var c=r.cells[j]; if(!c.__fx) continue;
        var f=c.__fx.slice(); if(plain && numCol[j]) f.unshift('num');
        set(c,f.join(' ')); c.__fx=null;
      }
    });
    var head=table.tHead && table.tHead.rows[0];
    if(head) for(var k=0;k<head.cells.length;k++) set(head.cells[k], numCol[k] && head.cells[k].colSpan===1 ? 'num' : '');
  }

  /* Relatórios: índice de secções da "Análise do aviário" */
  function enhanceReport(){
    var h2s=document.querySelectorAll('#root section.panel > h2');
    for(var i=0;i<h2s.length;i++){
      if(txt(h2s[i])!=='Análise do aviário') continue;
      var panel=h2s[i].parentNode; panel.classList.add('fx-report');
      var heads=[].slice.call(panel.querySelectorAll('h3'));
      var names=heads.map(function(x){ return txt(x); });
      var nav=panel.querySelector(':scope > .fx-report-index');
      if(nav && nav.getAttribute('data-k')===names.join('|')) return;
      if(nav) nav.remove();
      if(!heads.length) return;
      nav=document.createElement('nav'); nav.className='fx-report-index'; nav.setAttribute('aria-label','Secções da análise'); nav.setAttribute('data-k',names.join('|'));
      var lab=document.createElement('span'); lab.textContent='Ir para:'; nav.appendChild(lab);
      names.forEach(function(n){
        var b=document.createElement('button'); b.type='button'; b.textContent=n;
        b.addEventListener('click',function(){ var all=panel.querySelectorAll('h3'); for(var k=0;k<all.length;k++){ if(txt(all[k])===n){ all[k].scrollIntoView({behavior:'smooth',block:'start'}); break; } } });
        nav.appendChild(b);
      });
      var anchor=panel.querySelector(':scope > .fx-kpis')||panel.querySelector(':scope > p');
      panel.insertBefore(nav, anchor?anchor.nextSibling:h2s[i].nextSibling);
    }
  }

  var queued=false;
  function run(){ queued=false; var ts=document.querySelectorAll('#root table'); for(var i=0;i<ts.length;i++){ try{ scanTable(ts[i]); }catch(e){} } try{ enhanceReport(); }catch(e){} }
  function queue(){ if(!queued){ queued=true; requestAnimationFrame(run); } }
  function start(){
    var root=document.getElementById('root'); if(!root) return;
    new MutationObserver(queue).observe(root,{childList:true,subtree:true,characterData:true});
    queue();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
