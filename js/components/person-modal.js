// person-modal.js - Formulaire de création/édition de personne (Annuaire)

let currentPersonFieldName = null; // Stocke le champ d'origine pour auto-remplissage après création

/**
 * Ouvre la modal de création de personne
 * @param {string} fieldName - Nom du champ d'origine (ex: "porteur_1") pour auto-remplissage après création
 */
window.openCreatePersonModal = function(fieldName = null) {
  currentPersonFieldName = fieldName;
  const modal = document.getElementById('personModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('personForm').reset();
    document.getElementById('personForm').dataset.mode = 'create';
  }
};

/**
 * Ferme la modal de création de personne
 */
function closePersonModal() {
  const modal = document.getElementById('personModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentPersonFieldName = null;
}

/**
 * Sauvegarde une personne dans Grist et referme la modal
 */
async function savePersonToGrist(formData) {
  try {
    const personData = {
      Nom: formData.get('nom'),
      Prenom: formData.get('prenom'),
      Structure: formData.get('structure'),
      Email: formData.get('email'),
      Tel: formData.get('tel'),
      Poste: formData.get('poste')
    };

    // Appel Grist pour créer la personne
    const response = await fetch(`${CoreGrist.gristUrl}/api/docs/${CoreGrist.docId}/tables/Annuaire/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CoreGrist.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [{ fields: personData }] })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erreur Grist:', errorData);
      alert('Erreur lors de la création de la personne : ' + (errorData.error?.message || 'Erreur inconnue'));
      return;
    }

    const result = await response.json();
    const newPersonId = result.records[0].id;

    alert('Personne créée avec succès !');
    
    // Si un champ d'origine est défini, le remplir automatiquement
    if (currentPersonFieldName) {
      const field = document.querySelector(`[data-field-name="${currentPersonFieldName}"]`);
      if (field) {
        field.value = `${personData.Prenom} ${personData.Nom}`;
        field.dataset.selectedId = newPersonId;
      }
    }

    closePersonModal();
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    alert('Erreur lors de la sauvegarde : ' + error.message);
  }
}

/**
 * Initialise les événements de la modal personne
 */
function initPersonModal() {
  const modal = document.getElementById('personModal');
  if (!modal) {
    console.warn('personModal non trouvée dans le DOM');
    return;
  }

  // Fermer au clic sur X
  const closeBtn = modal.querySelector('.close-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePersonModal);
  }

  // Fermer au clic en dehors de la modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePersonModal();
  });

  // Soumettre le formulaire
  const form = document.getElementById('personForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      savePersonToGrist(formData);
    });
  }
}

// Initialiser au chargement du DOM
document.addEventListener('DOMContentLoaded', initPersonModal);
