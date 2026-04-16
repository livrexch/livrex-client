// Netlify Function — Détection de prix via Claude AI web search
// Variables d'environnement requises: ANTHROPIC_API_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const url = event.queryStringParameters?.url;
  if (!url || !url.startsWith('http')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL manquante' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Clé API manquante' }) };
  }

  try {
    // Claude avec web search — peut accéder à n'importe quel site
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: 'Quel est le prix exact en CHF et le nom complet de ce produit sur le site suisse: ' + url + ' ? Reponds UNIQUEMENT en JSON: {"prix": "CHF XX.XX", "nom": "nom exact du produit"}'
        }]
      })
    });

    const data = await response.json();
    
    // Extraire le texte de la réponse
    let text = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') text += block.text;
    }

    // Parser le JSON dans la réponse
    const match = text.match(/\{[^}]*"prix"[^}]*\}/);
    if (match) {
      try {
        const result = JSON.parse(match[0]);
        if (result.prix && result.prix.includes('CHF')) {
          const price = parseFloat(result.prix.replace('CHF', '').replace(',', '.').trim());
          if (price > 0) {
            return {
              statusCode: 200, headers,
              body: JSON.stringify({ prix: 'CHF ' + price.toFixed(2), nom: result.nom || null })
            };
          }
        }
      } catch(e) {}
    }

    // Chercher CHF XX.XX dans la réponse si pas de JSON propre
    const chfMatch = text.match(/CHF\s*(\d+[.,]\d{2})/);
    if (chfMatch) {
      const price = parseFloat(chfMatch[1].replace(',', '.'));
      if (price > 10) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ prix: 'CHF ' + price.toFixed(2), nom: null })
        };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null }) };

  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, error: error.message }) };
  }
};
