/* Création de projet — composant modal fonctionnel. */
(function (global) {
  'use strict';

  const FIN = { 2026: ['c2026_M10_Fonctionnement','c2026_M20_Investissement','c2026_M30_Personnel'], 2027: ['c2027_M10_Fonctionnement','c2027_M20_Investissement','c2027_M30_Personnel'], 2028: ['c2028_M10_Fonctionnement','c2028_M20_Investissement','c2028_M30_Personnel'] };
  const text = v => v == null ? '' : String(v);
  const tables = () => (global.CoreState && CoreState.getTable) ? CoreState : null;
  const rows = name => tables()?.getTable(name) || [];
  const label = (r, fields) => { if (r == null) return ''; if (typeof r !== 'object') return text(r); for (const f of fields) if (r[f]) return text(r[f]); return text(r.id); };
  const personLabel = r => text(r?.nom_et_Prenom || [r?.Prenom, r?.NOM].filter(Boolean).join(' ') || r?.Nom || r?.name || r?.id);
  const esc = s => text(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureStyles() { if (document.getElementById('creation-project-style')) return; const s=document.createElement('style'); s.id='creation-project-style'; s.textContent=`
:root {
  --cp-accent: #2563eb;
  --cp-accent-dark: #1d4ed8;
  --cp-accent-soft: #eff6ff;
  --cp-ink: #172033;
  --cp-heading: #0f172a;
  --cp-muted: #64748b;
  --cp-label: #334155;
  --cp-line: #dbe3ef;
  --cp-line-strong: #cbd5e1;
  --cp-panel: #f8fafc;
  --cp-panel-blue: #eef5ff;
  --cp-focus: rgba(37, 99, 235, .22);
}

.cp-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: clamp(14px, 3vw, 32px);
  background: rgba(15, 23, 42, .62);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--cp-ink);
  animation: cp-fade-in .18s ease-out;
}

.cp-box {
  box-sizing: border-box;
  width: min(100%, 780px);
  max-height: min(92vh, 900px);
  overflow: auto;
  background: #fff;
  color: var(--cp-ink);
  border: 1px solid rgba(226, 232, 240, .95);
  border-radius: 16px;
  box-shadow: 0 30px 90px rgba(15, 23, 42, .34), 0 10px 28px rgba(15, 23, 42, .15);
}

.cp-box h2 {
  position: relative;
  margin: 0;
  padding: 25px 68px 21px 30px;
  border-bottom: 1px solid var(--cp-line);
  color: var(--cp-heading);
  font-size: 1.4rem;
  line-height: 1.25;
  font-weight: 750;
  letter-spacing: -.025em;
}

.cp-box h2 [data-cp-close] {
  position: absolute;
  top: 15px;
  right: 20px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--cp-muted);
  font-size: 1.85rem;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  transition: color .18s ease, background .18s ease, transform .18s ease;
}

.cp-box h2 [data-cp-close]:hover,
.cp-box h2 [data-cp-close]:focus-visible {
  background: var(--cp-accent-soft);
  color: var(--cp-accent-dark);
  transform: rotate(4deg);
  outline: none;
}

#cp-project-form {
  padding: 26px 30px 6px;
}

.cp-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 24px;
}

.cp-full {
  grid-column: 1 / -1;
}

.cp-field {
  min-width: 0;
}

.cp-field label {
  display: block;
  margin: 0 0 8px;
  color: var(--cp-label);
  font-size: .88rem;
  line-height: 1.3;
  font-weight: 750;
  letter-spacing: .01em;
}

.cp-field input,
.cp-field textarea,
.cp-field select {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 13px;
  border: 1px solid var(--cp-line-strong);
  border-radius: 10px;
  background: #fff;
  color: var(--cp-ink);
  font: inherit;
  font-size: .95rem;
  transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
}

.cp-field input:hover,
.cp-field textarea:hover,
.cp-field select:hover {
  border-color: #94a3b8;
}

.cp-field input:focus,
.cp-field textarea:focus,
.cp-field select:focus {
  outline: none;
  border-color: var(--cp-accent);
  box-shadow: 0 0 0 4px var(--cp-focus);
  background: #fff;
}

.cp-field input::placeholder,
.cp-field textarea::placeholder {
  color: #94a3b8;
}

.cp-field textarea {
  min-height: 104px;
  resize: vertical;
  line-height: 1.55;
}

.cp-section {
  grid-column: 1 / -1;
  margin: 5px 0 -3px;
  padding: 14px 17px;
  border: 1px solid #d6e5ff;
  border-left: 4px solid var(--cp-accent);
  border-radius: 11px;
  background: linear-gradient(100deg, var(--cp-panel-blue), #f8fbff);
  color: #1e3a8a;
}

.cp-section h3 {
  margin: 0;
  color: #1e40af;
  font-size: .95rem;
  line-height: 1.35;
  font-weight: 800;
  letter-spacing: .01em;
}

.cp-ref {
  position: relative;
}

.cp-ref-list {
  position: absolute;
  z-index: 3;
  top: 100%;
  right: 0;
  left: 0;
  max-height: 220px;
  margin-top: 6px;
  overflow: auto;
  border: 1px solid var(--cp-line);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 16px 34px rgba(15, 23, 42, .18);
}

.cp-ref-list button {
  display: block;
  width: 100%;
  padding: 11px 13px;
  border: 0;
  background: #fff;
  color: var(--cp-label);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.cp-ref-list button:hover,
.cp-ref-list button:focus-visible {
  outline: none;
  background: var(--cp-accent-soft);
  color: var(--cp-accent-dark);
}

.cp-fin {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--cp-line);
  border-radius: 12px;
  border-spacing: 0;
  background: #fff;
  font-size: .9rem;
}

.cp-fin th,
.cp-fin td {
  padding: 11px 10px;
  border-right: 1px solid var(--cp-line);
  border-bottom: 1px solid var(--cp-line);
  text-align: left;
}

.cp-fin th:last-child,
.cp-fin td:last-child {
  border-right: 0;
}

.cp-fin tbody tr:last-child th,
.cp-fin tbody tr:last-child td {
  border-bottom: 1px solid var(--cp-line);
}

.cp-fin tbody tr:nth-child(even) {
  background: #f8fafc;
}

.cp-fin tbody tr:hover {
  background: #f1f5f9;
}

.cp-fin thead th {
  background: #eaf2ff;
  color: #1e3a8a;
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.cp-fin tbody th {
  min-width: 180px;
  font-weight: 700;
}

.cp-fin tfoot {
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 850;
}

.cp-fin tfoot th,
.cp-fin tfoot td {
  border-bottom: 0;
}

.cp-fin input {
  width: 100%;
  box-sizing: border-box;
  min-width: 64px;
  padding: 8px 9px;
  border: 1px solid var(--cp-line-strong);
  border-radius: 8px;
  background: #fff;
  font: inherit;
}

.cp-fin input:focus {
  outline: none;
  border-color: var(--cp-accent);
  box-shadow: 0 0 0 3px var(--cp-focus);
}

.cp-row-total {
  background: #eff6ff;
  color: #1e3a8a;
  font-weight: 800;
  white-space: nowrap;
}

.cp-muted {
  color: var(--cp-muted);
  font-size: .9em;
}

.cp-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
  padding: 19px 30px 26px;
  border-top: 1px solid var(--cp-line);
  background: #fbfdff;
}

.cp-actions button {
  padding: 11px 17px;
  border: 1px solid var(--cp-line-strong);
  border-radius: 9px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: .9rem;
  font-weight: 750;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.cp-actions button:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
  transform: translateY(-1px);
}

.cp-actions button:focus-visible {
  outline: 3px solid var(--cp-focus);
  outline-offset: 2px;
}

.cp-actions [data-cp-person] {
  border-color: #bfdbfe;
  background: var(--cp-accent-soft);
  color: var(--cp-accent);
}

.cp-actions [data-cp-save] {
  border-color: var(--cp-accent);
  background: var(--cp-accent);
  color: #fff;
  box-shadow: 0 6px 14px rgba(37, 99, 235, .24);
}

.cp-actions [data-cp-save]:hover {
  border-color: var(--cp-accent-dark);
  background: var(--cp-accent-dark);
  box-shadow: 0 8px 18px rgba(37, 99, 235, .3);
}

.cp-error {
  margin: 0 30px;
  color: #b42318;
  font-size: .9rem;
}

.cp-person-modal {
  z-index: 1010;
}

.cp-hidden {
  display: none !important;
}

@keyframes cp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 700px) {
  .cp-modal {
    padding: 12px;
  }
  .cp-box {
    width: 100%;
    max-height: 95vh;
    border-radius: 14px;
  }
  .cp-box h2 {
    padding: 20px 58px 17px 22px;
    font-size: 1.2rem;
  }
  #cp-project-form {
    padding: 20px 22px 3px;
  }
  .cp-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .cp-full,
  .cp-section {
    grid-column: auto;
  }
  .cp-fin {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
    font-size: .78rem;
  }
  .cp-fin th,
  .cp-fin td {
    padding: 8px 6px;
  }
  .cp-actions {
    flex-wrap: wrap;
    padding: 16px 22px 21px;
  }
  .cp-actions button {
    flex: 1 1 auto;
  }
  .cp-error {
    margin: 0 22px;
  }
}
`; document.head.appendChild(s); }
  function refField(parent, key, table, display, required=false, onChange) { const wrap=document.createElement('div'); wrap.className='cp-field cp-ref'; wrap.innerHTML=`<label>${esc(display.label)}${required?' *':''}</label><input autocomplete="off" data-ref="${key}" placeholder="Rechercher…"><div class="cp-ref-list cp-hidden"></div>`; const input=wrap.querySelector('input'), list=wrap.querySelector('.cp-ref-list'); const all=()=>table==='__choice__'?[]:rows(table); const render=()=>{ const q=input.value.toLowerCase(); list.innerHTML=all().filter(r=>(display.format ? display.format(r) : label(r,display.fields)).toLowerCase().includes(q)).slice(0,30).map(r=>`<button type="button" data-id="${esc(r.id)}">${esc(display.format ? display.format(r) : label(r,display.fields))}</button>`).join(''); list.classList.toggle('cp-hidden',!list.innerHTML); list.querySelectorAll('button').forEach(b=>b.onclick=()=>{ input.value=b.textContent; input.dataset.id=b.dataset.id; list.classList.add('cp-hidden'); onChange?.(b.dataset.id); }); }; input.oninput=render; input.onfocus=render; input.onblur=()=>setTimeout(()=>list.classList.add('cp-hidden'),150); parent.appendChild(wrap); return {wrap,input}; }
  function field(parent,labelText,id,type='text',required=false){ const w=document.createElement('div'); w.className='cp-field'; w.innerHTML=`<label for="${id}">${esc(labelText)}${required?' *':''}</label><input id="${id}" type="${type}">`; parent.appendChild(w); return w.querySelector('input'); }
  function createModal(){ ensureStyles();
    if(document.getElementById('cp-project-modal')) return document.getElementById('cp-project-modal');
    const m=document.createElement('div');
    m.id='cp-project-modal';
    m.className='cp-modal cp-hidden';
    m.innerHTML=`<div class="cp-box" role="dialog" aria-modal="true"><h2>Créer un projet <button type="button" data-cp-close aria-label="Fermer">×</button></h2><div id="cp-project-form" class="cp-grid"></div><p id="cp-project-error" class="cp-error"></p><div class="cp-actions"><button type="button" data-cp-cancel>Annuler</button><button type="button" data-cp-person>+ Ajouter une personne</button><button type="button" data-cp-save>Créer le projet</button></div></div>`;
    document.body.appendChild(m);
    const f=m.querySelector('#cp-project-form');
    const refs={};
    const generalSection=document.createElement('div'); generalSection.className='cp-section cp-full'; generalSection.innerHTML='<h3>Informations générales</h3>'; f.appendChild(generalSection);
    refs.programme=refField(f,'Programme','Programmes',{label:'Programme',fields:['Programme']},true);
    field(f,'Projet','cp-Projet','text',true);
    field(f,'Acronyme','cp-Acronyme','text',true);
    refs.type=refField(f,'Type_projet','__choice__',{label:'Type de projet',fields:['value','label']});
    refs.type.input.value='Projet';
    refs.type.wrap.querySelector('input').setAttribute('list','cp-types');
    refs.type.wrap.insertAdjacentHTML('beforeend','<datalist id="cp-types"><option value="Projet"><option value="Ingenierie_creation"><option value="Ingenierie_renouvellement"><option value="reattribution"><option value="prolongation"><option value="myphd+"></datalist>');
    const statusWrap=document.createElement('div'); statusWrap.className='cp-field';
    statusWrap.innerHTML='<label for="cp-statut">Statut opérationnel</label><select id="cp-statut"><option>en cours</option><option>Brouillon</option><option>En retard</option><option>cloturé avec Reliquat à traiter</option><option>Cloturé et reliquat traités</option><option selected>En attente des dispo des fonds</option><option>Suposé cloturé sans information sur ...</option></select>';
    f.appendChild(statusWrap);
    const peopleSection=document.createElement('div'); peopleSection.className='cp-section cp-full'; peopleSection.innerHTML='<h3>Porteurs et accompagnement</h3>'; f.appendChild(peopleSection);
    refs.Instance_ratachee=refField(f,'Instance_ratachee','Suivi_Instance',{label:'Instance rattachée',fields:['Nom','name']});
    ['Porteur_1','Porteur_2','Porteur_3','VP_porteur_2','Accompagnateur'].forEach(k=>{ refs[k]=refField(f,k,'Annuaire',{label:k==='VP_porteur_2'?'VP porteur':k.replace('_',' '),fields:['nom_et_Prenom','Prenom','NOM'],format:personLabel},k==='Porteur_1',()=>updateTutelles(f,refs.Porteur_1?.input?.dataset.id)); });
    refs.tutelle=refField(f,'Tutelle','Etablissements',{label:'Tutelle du porteur',fields:['Acronyme','Nom_complet']});
    refs.tutelle.wrap.dataset.tutelle='true';
    const comment=document.createElement('div');
    comment.className='cp-field cp-full';
    comment.innerHTML='<label>Commentaire général de suivi</label><textarea id="cp-comment" rows="3"></textarea>';
    f.appendChild(comment);
    const h=document.createElement('div'); h.className='cp-section'; h.innerHTML='<h3>Prévisionnel financier · 2026–2028</h3>'; f.appendChild(h);
    const table=document.createElement('table'); table.className='cp-fin cp-full';
    table.innerHTML='<thead><tr><th>Intitulé</th><th>2026</th><th>2027</th><th>2028</th><th>Total</th></tr></thead><tbody><tr data-detail="Details_depense_s_Fonctionnement"><th><input value="Depenses de fonctionnement"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Fonctionnement">0</td></tr><tr data-detail="Details_depense_s_Investissement"><th><input value="Dépenses d\'investissement"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Investissement">0</td></tr><tr data-detail="Details_depense_s_Personnel"><th><input value="Depenses de personnel"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Personnel">0</td></tr></tbody><tfoot><tr><th>TOTAL</th><td data-total="2026">0</td><td data-total="2027">0</td><td data-total="2028">0</td><td data-grand-total>0</td></tr></tfoot>';
    Object.entries(FIN).forEach(([year,fs])=>table.querySelectorAll('tbody tr').forEach((tr,i)=>{ const inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.step='any'; inp.dataset.fin=fs[i]; tr.children[Number(year)-2025].appendChild(inp); inp.oninput=()=>{updateFinancialTotals(table);}; }));
    f.appendChild(table);
    m.querySelector('[data-cp-cancel]').onclick=()=>m.classList.add('cp-hidden'); m.querySelector('[data-cp-close]').onclick=()=>m.classList.add('cp-hidden');
    m.querySelector('[data-cp-person]').onclick=()=>openPerson(m);
    m.querySelector('[data-cp-save]').onclick=()=>saveProject(m,refs);
    m._refs=refs;
    return m;
  }
  function updateFinancialTotals(table){
    Object.keys(FIN).forEach(year=>{ const total=FIN[year].reduce((n,key)=>n+Number(table.querySelector(`[data-fin="${key}"]`)?.value||0),0); table.querySelector(`[data-total="${year}"]`).textContent=total.toLocaleString('fr-FR'); });
    table.querySelectorAll('tbody tr[data-detail]').forEach(row=>{ const total=[...row.querySelectorAll('[data-fin]')].reduce((n,input)=>n+Number(input.value||0),0); table.querySelector(`[data-row-total="${row.dataset.detail}"]`).textContent=total.toLocaleString('fr-FR'); });
    const grand=[...table.querySelectorAll('tbody [data-fin]')].reduce((n,input)=>n+Number(input.value||0),0); table.querySelector('[data-grand-total]').textContent=grand.toLocaleString('fr-FR');
  }
  function updateTutelles(form,id){ const p=rows('Annuaire').find(x=>String(x.id)===String(id)), structure=rows('Structures').find(x=>String(x.id)===String(p?.Service||p?.Poste2?.Structure2)); const ids=['Etablissement_Tutelle_gestionaire','Co_tutelle_1_Principale','Co_tutuelle_2_principales','Tutuelle_Secondaire_1','Tutuelle_Secondaire_2'].map(k=>structure?.[k]).filter(v=>v!=null&&v!==''); const w=form.querySelector('[data-tutelle]'),input=w?.querySelector('input'); if(!w||!input)return; input.value=ids.length===1?label(rows('Etablissements').find(e=>String(e.id)===String(ids[0])),['Acronyme','Nom_complet']):''; input.dataset.id=ids.length===1?ids[0]:''; w.dataset.allowed=ids.join(','); }
  async function addRecord(table,fields){ const api=global.CoreGrist?.gristInstance; if(!api) throw new Error('API Grist indisponible'); await api.docApi.applyUserActions([['AddRecord',table,null,fields]]); }
  async function updateRecord(table,id,fields){ const api=global.CoreGrist?.gristInstance; if(!api) throw new Error('API Grist indisponible'); await api.docApi.applyUserActions([['UpdateRecord',table,Number(id),fields]]); }
  function valueOf(record,names){ for(const name of names){ if(record?.[name]!==undefined && record[name]!==null) return record[name]; } return ''; }
  function setRef(ref,value,tableName,displayFields){ if(!ref) return; const id=value && typeof value==='object' ? value.id : value; const found=id!=null ? rows(tableName).find(r=>String(r.id)===String(id)) : null; ref.input.dataset.id=id==null?'':String(id); ref.input.value=value && typeof value==='object' ? personLabel(value) : (found ? (tableName==='Annuaire' ? personLabel(found) : label(found,displayFields||['Nom','name','Acronyme','Nom_complet','Programme'])) : text(value)); }
  function populateModal(m,refs,record){ if(!record) return; const set=(id,names)=>{const el=m.querySelector('#'+id); if(el) el.value=text(valueOf(record,names));}; set('cp-Projet',['Projet']); set('cp-Acronyme',['Acronyme']); set('cp-statut',['Statut_operationnel_projet','Statut opérationnel','Statut']); set('cp-comment',['comentaire_general_Suivi_projet','commentaire_general_Suivi_projet']); setRef(refs.programme,valueOf(record,['Programme']),'Programmes',['Programme']); setRef(refs.type,valueOf(record,['Type_projet']),'__choice__'); const refTables={Porteur_1:'Annuaire',Porteur_2:'Annuaire',Porteur_3:'Annuaire',VP_porteur_2:'Annuaire',Accompagnateur:'Annuaire',Instance_ratachee:'Suivi_Instance',Tutelle:'Etablissements'}; Object.keys(refTables).forEach(k=>setRef(refs[k],valueOf(record,[k]),refTables[k],['nom_et_Prenom','Prenom','NOM','Nom','name','Acronyme','Nom_complet'])); m.querySelectorAll('[data-fin]').forEach(input=>{input.value=record[input.dataset.fin]??'';}); updateFinancialTotals(m.querySelector('.cp-fin')); }
  function collectFields(m,refs){ const get=id=>m.querySelector('#'+id)?.value.trim()||''; const fields={Programme:Number(refs.programme.input.dataset.id),Projet:get('cp-Projet'),Acronyme:get('cp-Acronyme'),Type_projet:refs.type.input.value||'Projet',Statut_operationnel_projet:get('cp-statut'),comentaire_general_Suivi_projet:get('cp-comment'),Porteur_1:Number(refs.Porteur_1.input.dataset.id),Porteur_2:Number(refs.Porteur_2.input.dataset.id)||null,Porteur_3:Number(refs.Porteur_3.input.dataset.id)||null,VP_porteur_2:Number(refs.VP_porteur_2.input.dataset.id)||null,Accompagnateur:Number(refs.Accompagnateur.input.dataset.id)||null,Instance_ratachee:Number(refs.Instance_ratachee.input.dataset.id)||null,Tutelle:Number(refs.tutelle.input.dataset.id)||null}; m.querySelectorAll('[data-fin]').forEach(i=>fields[i.dataset.fin]=i.value===''?null:Number(i.value)); m.querySelectorAll('tbody tr[data-detail]').forEach(tr=>fields[tr.dataset.detail]=tr.querySelector('th input').value); return fields; }
  async function saveProject(m,refs){ const mode=m.dataset.mode||'create', record= m._projectRecord; const get=id=>m.querySelector('#'+id)?.value.trim()||''; if(!refs.programme.input.dataset.id||!refs.Porteur_1.input.dataset.id||!get('cp-Projet')||!get('cp-Acronyme')){m.querySelector('#cp-project-error').textContent='Programme, projet, acronyme et Porteur 1 sont obligatoires.';return;} try{const fields=collectFields(m,refs); if(mode==='edit') await updateRecord('Projets',record.id,fields); else await addRecord('Projets',fields); m.classList.add('cp-hidden'); global.dispatchEvent(new CustomEvent('project-created'));}catch(e){m.querySelector('#cp-project-error').textContent=(mode==='edit'?'Modification impossible : ':'Création impossible : ')+e.message;} }
  function openPerson(projectModal){ const m=document.createElement('div');m.className='cp-modal cp-person-modal';m.innerHTML='<div class="cp-box"><h2>Ajouter une personne</h2><div class="cp-grid"><div class="cp-field"><label>Prénom *</label><input id="cpp-prenom"></div><div class="cp-field"><label>Nom *</label><input id="cpp-nom"></div><div class="cp-field"><label>Poste existant (optionnel)</label><input id="cpp-poste"></div></div><p class="cp-error"></p><div class="cp-actions"><button type="button">Annuler</button><button type="button">Créer la personne</button></div></div>';document.body.appendChild(m);const b=m.querySelectorAll('button');b[0].onclick=()=>m.remove();b[1].onclick=async()=>{const p=m.querySelector('#cpp-prenom').value.trim(),n=m.querySelector('#cpp-nom').value.trim();if(!p||!n){m.querySelector('.cp-error').textContent='Prénom et nom sont obligatoires.';return}try{await addRecord('Annuaire',{Prenom:p,NOM:n,Poste2:Number(m.querySelector('#cpp-poste').dataset?.id)||null});m.remove();}catch(e){m.querySelector('.cp-error').textContent=e.message;}}; }
  global.openProjectModal=(mode='create',record=null)=>{const m=createModal();m.dataset.mode=mode;m._projectRecord=record;m.querySelector('h2').childNodes[0].textContent=mode==='edit'?'Modifier le projet':'Créer un projet';m.querySelector('[data-cp-save]').textContent=mode==='edit'?'Enregistrer les modifications':'Créer le projet';m.querySelector('#cp-project-error').textContent='';if(mode==='create'){m.querySelector('#cp-statut').value='En attente des dispo des fonds';}else{populateModal(m,m._refs,record);}m.classList.remove('cp-hidden');return m;};
  global.openProjectCreation=()=>global.openProjectModal('create',null);
  document.addEventListener('DOMContentLoaded',()=>{ensureStyles();document.getElementById('btn-new-project')?.addEventListener('click',()=>global.openProjectModal('create',null));document.getElementById('btn-create-project')?.addEventListener('click',()=>global.openProjectModal('create',null));});
}(window));
