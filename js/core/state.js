/* =========================================================
   CORE — ÉTAT GLOBAL
   ========================================================= */
(function (global) {
  const tables = {
    Projets: [], Annuaire: [], Postes2: [], Structures: [],
    Programmes: [], Etablissements: [], Suivi_Instance: [],
    EcritureComptables: []
  };
  let currentProjectId = null;
  let formValues = {};
  let personTargetField = null;
  let editingPersonId = null;

  global.CoreState = {
    tables,
    get currentProjectId() { return currentProjectId; },
    set currentProjectId(value) { currentProjectId = value; },
    get formValues() { return formValues; },
    set formValues(value) { formValues = value; },
    get personTargetField() { return personTargetField; },
    set personTargetField(value) { personTargetField = value; },
    get editingPersonId() { return editingPersonId; },
    set editingPersonId(value) { editingPersonId = value; },
    getTable(name) { return tables[name]; },
    setTable(name, value) { tables[name] = value; }
  };
})(window);
