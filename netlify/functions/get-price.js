// Netlify Function — Détection de prix via Claude + web search
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: 'Va sur cette page et dis-moi le prix exact en CHF suisse et le nom du produit: ' + url + '. Reponds uniquement en JSON: {"prix": "CHF XX.XX", "nom": "nom exact"}'
        }]
      })
    });

    const data = await response.json();

    // Log pour debug
    console.log('API response status:', response.status);
    console.log('Content blocks:', JSON.stringify(data.content?.map(b => b.type)));

    // Chercher le texte dans tous les blocs
    let text = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') text += block.text;
    }

    console.log('Text response:', text.substring(0, 200));

    // Parser le JSON
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

    // Chercher CHF directement dans le texte
    const chfMatch = text.match(/CHF\s*(\d+[.,]\d{2})/);
    if (chfMatch) {
      const p = parseFloat(chfMatch[1].replace(',', '.'));
      if (p > 10) {
        return { statusCode: 200, headers, body: JSON.stringify({ prix: 'CHF ' + p.toFixed(2), nom: null }) };
      }
    }

    // Retourner l'erreur API si elle existe
    if (data.error) {
      return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, debug: data.error.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, debug: text.substring(0, 100) }) };

  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null, error: error.message }) };
  }
};
