// Netlify Function — Détection de prix via Claude
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Cle API manquante' }) };
  }

  try {
    // Appel Claude avec web search — sans beta headers
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: 'Quel est le prix en CHF suisse de ce produit: ' + url + ' ? Reponds uniquement en JSON: {"prix": "CHF XX.XX", "nom": "nom du produit"}'
        }]
      })
    });

    const data = await response.json();

    // Debug complet pour voir ce qui se passe
    if (data.error) {
      return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, debug: 'API error: ' + JSON.stringify(data.error) }) };
    }

    // Extraire le texte
    let text = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') text += block.text;
    }

    // Parser JSON dans la réponse
    const jsonMatch = text.match(/\{[^{}]*"prix"[^{}]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        if (result.prix && result.prix.includes('CHF')) {
          const p = parseFloat(result.prix.replace('CHF', '').replace(',', '.').trim());
          if (p > 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ prix: 'CHF ' + p.toFixed(2), nom: result.nom || null }) };
          }
        }
      } catch(e) {}
    }

    // Chercher CHF directement
    const chfMatch = text.match(/CHF\s*(\d+[.,]\d{2})/);
    if (chfMatch) {
      const p = parseFloat(chfMatch[1].replace(',', '.'));
      if (p > 10) {
        return { statusCode: 200, headers, body: JSON.stringify({ prix: 'CHF ' + p.toFixed(2), nom: null }) };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, debug: text.substring(0, 150) }) };

  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, error: error.message }) };
  }
};
