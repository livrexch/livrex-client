// Netlify Function — Détection de prix CHF
// Endpoint: /.netlify/functions/get-price?url=https://www.zara.com/...

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const url = event.queryStringParameters?.url;
  if (!url || !url.startsWith('http')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL manquante' }) };
  }

  try {
    // Headers qui imitent un vrai navigateur — contourne les blocages
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Referer': 'https://www.google.com/'
    };

    // ── ZARA : API JSON officielle ─────────────────
    if (url.includes('zara.com')) {
      const pidMatch = url.match(/[/-]p(\d{7,9})/i) || url.match(/(\d{8,9})\.html/);
      if (pidMatch) {
        const pid = pidMatch[1];
        const zaraApis = [
          `https://www.zara.com/ch/fr/product/${pid}-p0${pid}.json`,
          `https://www.zara.com/ch/fr/product/p0${pid}.json`,
        ];
        for (const api of zaraApis) {
          try {
            const resp = await fetch(api, { headers: browserHeaders });
            if (resp.ok) {
              const data = await resp.json();
              const price = data?.detail?.colors?.[0]?.prices?.[0]?.price
                         || data?.product?.detail?.colors?.[0]?.prices?.[0]?.price
                         || data?.colors?.[0]?.prices?.[0]?.price;
              const name = data?.detail?.name || data?.name;
              if (price && price > 0) {
                const chf = price > 1000 ? price / 100 : price;
                return {
                  statusCode: 200, headers,
                  body: JSON.stringify({ prix: 'CHF ' + chf.toFixed(2), nom: name || null })
                };
              }
            }
          } catch (e) {}
        }
      }
    }

    // ── H&M : JSON-LD + meta tags ──────────────────
    if (url.includes('hm.com')) {
      const resp = await fetch(url, { headers: browserHeaders });
      const html = await resp.text();
      
      // JSON-LD
      const jld = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (jld) {
        try {
          const obj = JSON.parse(jld[1]);
          const price = obj?.offers?.price || obj?.offers?.[0]?.price;
          const name = obj?.name;
          if (price && parseFloat(price) > 0) {
            return {
              statusCode: 200, headers,
              body: JSON.stringify({ prix: 'CHF ' + parseFloat(price).toFixed(2), nom: name || null })
            };
          }
        } catch (e) {}
      }

      // Meta Open Graph
      const og = html.match(/property="product:price:amount"[^>]+content="([0-9.,]+)"/i)
                || html.match(/content="([0-9.,]+)"[^>]+property="product:price:amount"/i);
      if (og) {
        const price = parseFloat(og[1].replace(',', '.'));
        if (price > 0) {
          const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
          return {
            statusCode: 200, headers,
            body: JSON.stringify({ prix: 'CHF ' + price.toFixed(2), nom: nameMatch?.[1]?.trim() || null })
          };
        }
      }
    }

    // ── TOUS LES AUTRES SITES (Globus, Manor, Bongénie...) ──
    const resp = await fetch(url, { headers: browserHeaders });
    const html = await resp.text();
    let nom = null;

    // JSON-LD universel
    const jldBlocks = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of jldBlocks) {
      try {
        const txt = block.replace(/<[^>]*>/g, '');
        const obj = JSON.parse(txt);
        const items = Array.isArray(obj) ? obj : [obj];
        for (const item of items) {
          const offers = item.offers;
          if (!offers) continue;
          const offer = Array.isArray(offers) ? offers[0] : offers;
          const price = parseFloat(offer.price || offer.lowPrice || 0);
          if (price > 0) {
            nom = item.name || null;
            return {
              statusCode: 200, headers,
              body: JSON.stringify({ prix: 'CHF ' + price.toFixed(2), nom })
            };
          }
        }
      } catch (e) {}
    }

    // Titre de la page
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    nom = titleMatch?.[1]?.split('|')[0]?.split('-')[0]?.trim() || null;

    // Scan CHF dans le texte (min 10 CHF)
    const chfMatches = [];
    const regex = /CHF\s*([0-9]+[.,][0-9]{2})/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 10 && v < 5000) chfMatches.push(v);
    }

    if (chfMatches.length > 0) {
      // Prix le plus fréquent = vrai prix de l'article
      const freq = {};
      chfMatches.forEach(v => freq[v] = (freq[v] || 0) + 1);
      const best = Object.entries(freq).sort((a, b) => b[1] - a[1] || parseFloat(b[0]) - parseFloat(a[0]))[0];
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ prix: 'CHF ' + parseFloat(best[0]).toFixed(2), nom })
      };
    }

    // Rien trouvé
    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom }) };

  } catch (error) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: error.message, prix: null })
    };
  }
};
