(function (global) {
  'use strict';

  const text = v => v == null ? '' : String(v);
  const rows = name => tables()?.getTable(name) || [];

  const FIN = {
    2026: ['Budget_2026_Fonctionnement', 'Budget_2026_Investissement', 'Budget_2026_Personnel'],
    2027: ['Budget_2027_Fonctionnement', 'Budget_2027_Investissement', 'Budget_2027_Personnel'],
    2028: ['Budget_2028_Fonctionnement', 'Budget_2028_Investissement', 'Budget_2028_Personnel']
  };

  function ensureStyles() {
    if (document.getElementById('cp-modal-styles')) return;
    const s = document.createElement('style'); s.id = 'cp-modal-styles'; s.textContent = `
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

  function field(form, label, id, type, required) { const wrap = document.createElement('div'); wrap.className = 'cp-field'; const l = document.createElement('label'); l.htmlFor = id; l.textContent = label; const input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.id = id; input.type = type; input.required = required; wrap.append(l, input); form.appendChild(wrap); return { input, wrap }; }
  function createModal(){ ensureStyles(); const m=document.createElement('div'); m.id='cp-project-modal'; m.className='cp-modal cp-hidden'; m.innerHTML='<div class="cp-box"><h2>Créer un projet <button type="button" data-cp-close>×</button></h2><form id="cp-project-form"></form></div>'; document.body.appendChild(m); const f=m.querySelector('#cp-project-form'); const refs={}; refs.programme=field(f,'Programme','cp-programme','text',true); refs.type=field(f,'Type de projet','cp-type','text',false); refs.type.input.value='Projet'; field(f,'Projet','cp-Projet','text',true); field(f,'Acronyme','cp-Acronyme','text',true); const statusWrap=document.createElement('div'); statusWrap.className='cp-field'; statusWrap.innerHTML='<label for="cp-statut">Statut opérationnel</label><select id="cp-statut"><option>en cours</option><option>Brouillon</option><option>En retard</option><option>cloturé avec Reliquat à traiter</option><option>Cloturé et reliquat traités</option><option selected>En attente des dispo des fonds</option><option>Suposé cloturé sans information sur ...</option></select>'; f.appendChild(statusWrap); refs.Porteur_1=field(f,'Porteur 1','cp-Porteur_1','text',true); refs.Porteur_2=field(f,'Porteur 2','cp-Porteur_2','text',false); refs.Porteur_3=field(f,'Porteur 3','cp-Porteur_3','text',false); refs.VP_porteur_2=field(f,'VP porteur 2','cp-VP_porteur_2','text',false); refs.Accompagnateur=field(f,'Accompagnateur','cp-Accompagnateur','text',false); refs.tutelle=field(f,'Tutelle','cp-tutelle','text',false); const comment=document.createElement('div'); comment.className='cp-field cp-full'; comment.innerHTML='<label for="cp-comment">Commentaire</label><textarea id="cp-comment"></textarea>'; f.appendChild(comment); const h=document.createElement('div'); h.className='cp-section'; h.innerHTML='<h3>Prévisionnel financier · 2026–2028</h3>'; f.appendChild(h); const table=document.createElement('table'); table.className='cp-fin cp-full'; table.innerHTML='<thead><tr><th>Intitulé</th><th>2026</th><th>2027</th><th>2028</th><th>Total</th></tr></thead><tbody><tr data-detail="Details_depense_s_Fonctionnement"><th><input value="Depenses de fonctionnement"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Fonctionnement">0</td></tr><tr data-detail="Details_depense_s_Investissement"><th><input value="Dépenses d\'investissement"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Investissement">0</td></tr><tr data-detail="Details_depense_s_Personnel"><th><input value="Depenses de personnel"></th><td></td><td></td><td></td><td class="cp-row-total" data-row-total="Details_depense_s_Personnel">0</td></tr></tbody><tfoot><tr><th>TOTAL</th><td data-total="2026">0</td><td data-total="2027">0</td><td data-total="2028">0</td><td data-grand-total>0</td></tr></tfoot>'; Object.entries(FIN).forEach(([year,fs])=>table.querySelectorAll('tbody tr').forEach((tr,i)=>{const inp=document.createElement('input');inp.type='number';inp.min='0';inp.step='any';inp.dataset.fin=fs[i];tr.children[Number(year)-2025].appendChild(inp);inp.oninput=()=>updateFinancialTotals(table);})); f.appendChild(table); const actions=document.createElement('div'); actions.className='cp-actions'; actions.innerHTML='<span id="cp-project-error"></span><button type="button" data-cp-cancel>Annuler</button><button type="submit" data-cp-save>Créer le projet</button>'; f.appendChild(actions); m.querySelector('[data-cp-cancel]').onclick=()=>m.classList.add('cp-hidden'); m.querySelector('[data-cp-close]').onclick=()=>m.classList.add('cp-hidden'); m._refs=refs; return m; }
  function updateFinancialTotals(table){let grand=0;table.querySelectorAll('tbody tr').forEach(tr=>{let total=0;tr.querySelectorAll('input[type=number]').forEach(i=>total+=Number(i.value)||0);tr.querySelector('[data-row-total]').textContent=total;grand+=total;});table.querySelector('[data-grand-total]').textContent=grand;[2026,2027,2028].forEach(y=>{let n=0;table.querySelectorAll('tbody tr').forEach(tr=>n+=Number(tr.children[y-2025].querySelector('input')?.value)||0);table.querySelector(`[data-total="${y}"]`).textContent=n;});}
  async function addRecord(table,fields){ const api=global.CoreGrist?.gristInstance; if(!api) throw new Error('API Grist indisponible'); await api.docApi.applyUserActions([['AddRecord',table,null,fields]]); }
  async function updateRecord(table,id,fields){ const api=global.CoreGrist?.gristInstance; if(!api) throw new Error('API Grist indisponible'); await api.docApi.applyUserActions([['UpdateRecord',table,Number(id),fields]]); }
  function populateModal(m,refs,record){ if(!record) return; const set=(id,names)=>{const el=m.querySelector('#'+id); if(el) el.value=text(valueOf(record,names));}; set('cp-Projet',['Projet']); set('cp-Acronyme',['Acronyme']); set('cp-statut',['Statut_operationnel_projet','Statut opérationnel','Statut']); set('cp-comment',['comentaire_general_Suivi_projet','commentaire_general_Suivi_projet']); setRef(refs.programme,valueOf(record,['Programme']),'Programmes',['Programme']); setRef(refs.type,valueOf(record,['Type_projet']),'__choice__'); const refTables={Porteur_1:'Annuaire',Porteur_2:'Annuaire',Porteur_3:'Annuaire',VP_porteur_2:'Annuaire',Accompagnateur:'Annuaire',Instance_ratachee:'Suivi_Instance',Tutelle:'Etablissements'}; Object.keys(refTables).forEach(k=>setRef(refs[k],valueOf(record,[k]),refTables[k],['nom_et_Prenom','Prenom','NOM','Nom','name','Acronyme','Nom_complet'])); m.querySelectorAll('[data-fin]').forEach(input=>{input.value=record[input.dataset.fin]??'';}); updateFinancialTotals(m.querySelector('.cp-fin')); }
  function collectFields(m,refs){ const get=id=>m.querySelector('#'+id)?.value.trim()||''; const fields={Programme:Number(refs.programme.input.dataset.id),Projet:get('cp-Projet'),Acronyme:get('cp-Acronyme'),Type_projet:refs.type.input.value||'Projet',Statut_operationnel_projet:get('cp-statut'),comentaire_general_Suivi_projet:get('cp-comment'),Porteur_1:Number(refs.Porteur_1.input.dataset.id),Porteur_2:Number(refs.Porteur_2.input.dataset.id)||null,Porteur_3:Number(refs.Porteur_3.input.dataset.id)||null,VP_porteur_2:Number(refs.VP_porteur_2.input.dataset.id)||null,Accompagnateur:Number(refs.Accompagnateur.input.dataset.id)||null,Instance_ratachee:Number(refs.Instance_ratachee.input.dataset.id)||null,Tutelle:Number(refs.tutelle.input.dataset.id)||null}; m.querySelectorAll('[data-fin]').forEach(i=>fields[i.dataset.fin]=i.value===''?null:Number(i.value)); m.querySelectorAll('tbody tr[data-detail]').forEach(tr=>fields[tr.dataset.detail]=tr.querySelector('th input').value); return fields; }
  async function saveProject(m,refs){ const mode=m.dataset.mode||'create', record= m._projectRecord; const get=id=>m.querySelector('#'+id)?.value.trim()||''; if(!refs.programme.input.dataset.id||!refs.Porteur_1.input.dataset.id||!get('cp-Projet')||!get('cp-Acronyme')){m.querySelector('#cp-project-error').textContent='Programme, projet, acronyme et Porteur 1 sont obligatoires.';return;} try{const fields=collectFields(m,refs); if(mode==='edit') await updateRecord('Projets',record.id,fields); else await addRecord('Projets',fields); m.classList.add('cp-hidden'); global.dispatchEvent(new CustomEvent('project-created'));}catch(e){m.querySelector('#cp-project-error').textContent=(mode==='edit'?'Modification impossible : ':'Création impossible : ')+e.message;} }
  global.openProjectModal=(mode='create',record=null)=>{const m=createModal();m.dataset.mode=mode;m._projectRecord=record;m.querySelector('h2').childNodes[0].textContent=mode==='edit'?'Modifier le projet':'Créer un projet';m.querySelector('[data-cp-save]').textContent=mode==='edit'?'Enregistrer les modifications':'Créer le projet';m.querySelector('#cp-project-error').textContent='';if(mode==='create'){m.querySelector('#cp-statut').value='En attente des dispo des fonds';}else{populateModal(m,m._refs,record);}m.classList.remove('cp-hidden');return m;};
}(window));
