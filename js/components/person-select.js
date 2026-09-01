// person-select.js - Enrichissement des champs Annuaire avec option "Créer une personne"
// Ce fichier s'exécute APRÈS project-modal.js et enrichit les champs de référence Annuaire

(function() {
  'use strict';

  /**
   * Observer qui intercepte l'ajout de champs autocomplete Annuaire
   * et ajoute l'option "Créer [texte]" quand aucun résultat ne correspond
   */
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      // Chercher les champs input qui appartiennent à des champs Annuaire
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const inputs = node.querySelectorAll ? node.querySelectorAll('input[data-grist-field="Annuaire"]') : [];
          inputs.forEach(enrichField);
          
          // Si le nœud lui-même est un input Annuaire
          if (node.nodeType === Node.ELEMENT_NODE && 
              node.tagName === 'INPUT' && 
              node.getAttribute('data-grist-field') === 'Annuaire') {
            enrichField(node);
          }
        }
      });
    });
  });

  /**
   * Enrichit un champ input Annuaire pour ajouter le bouton "Créer [texte]"
   */
  function enrichField(input) {
    // Vérifier que c'est bien un champ Annuaire
    if (input.getAttribute('data-grist-field') !== 'Annuaire') return;
    if (input.dataset.enriched === 'true') return; // Déjà enrichi
    
    input.dataset.enriched = 'true';
    
    // Créer un wrapper pour le champ et son dropdown personnalisé
    const wrapper = input.parentElement;
    if (!wrapper) return;

    let dropdown = wrapper.querySelector('[data-person-dropdown]');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.setAttribute('data-person-dropdown', 'true');
      dropdown.className = 'person-select-dropdown';
      wrapper.appendChild(dropdown);
    }

    /**
     * Gère l'entrée utilisateur et affiche les options (résultats ou "Créer")
     */
    async function handleInput() {
      const query = input.value.trim();
      
      if (!query) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.innerHTML = ''; // Vider le dropdown
      dropdown.style.display = 'block';

      // Chercher les personnes correspondantes dans Grist
      try {
        const people = await searchPeople(query);

        if (people.length > 0) {
          // Afficher les résultats de recherche
          people.forEach(person => {
            const option = document.createElement('div');
            option.className = 'person-select-option';
            option.textContent = `${person.Prenom} ${person.Nom}`;
            option.dataset.personId = person.id;
            option.onclick = () => selectPerson(input, person);
            dropdown.appendChild(option);
          });
        } else {
          // Afficher le bouton "Créer [texte]"
          const createBtn = document.createElement('div');
          createBtn.className = 'person-select-create';
          createBtn.textContent = `+ Créer "${query}"`;
          createBtn.onclick = () => {
            window.openCreatePersonModal(input.id || input.name);
          };
          dropdown.appendChild(createBtn);
        }
      } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'person-select-error';
        errorDiv.textContent = 'Erreur de recherche';
        dropdown.appendChild(errorDiv);
      }
    }

    /**
     * Sélectionne une personne et remplit le champ
     */
    function selectPerson(inputField, person) {
      inputField.value = `${person.Prenom} ${person.Nom}`;
      inputField.dataset.selectedId = person.id;
      dropdown.style.display = 'none';
    }

    // Événements de l'input
    input.addEventListener('input', handleInput);
    input.addEventListener('focus', handleInput);

    // Fermer le dropdown au blur
    input.addEventListener('blur', function() {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 200); // Délai pour permettre le clic sur une option
    });
  }

  /**
   * Recherche des personnes dans Grist
   */
  async function searchPeople(query) {
    if (!CoreGrist || !CoreGrist.gristUrl || !CoreGrist.docId || !CoreGrist.apiKey) {
      console.error('CoreGrist non initialisé');
      return [];
    }

    try {
      const response = await fetch(
        `${CoreGrist.gristUrl}/api/docs/${CoreGrist.docId}/tables/Annuaire/records?filter={"Nom": {"$contains": "${query}"}}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CoreGrist.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.error('Erreur API Grist:', response.status);
        return [];
      }

      const data = await response.json();
      return data.records || [];
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      return [];
    }
  }

  /**
   * Démarre l'observation du DOM pour les nouveaux champs Annuaire
   */
  function init() {
    // Observer les mutations du DOM
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-grist-field']
    });

    // Enrichir les champs existants au chargement
    document.querySelectorAll('input[data-grist-field="Annuaire"]').forEach(enrichField);
  }

  // Initialiser quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
