// Netlify Function — Détection de prix CHF
// Endpoint: /.netlify/functions/get-price?url=https://www.zara.com/...

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

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'DNT': '1',
    'Referer': 'https://www.google.ch/',
    'Upgrade-Insecure-Requests': '1'
  };

  try {
    // ── ZARA ──────────────────────────────────────
    if (url.includes('zara.com')) {
      const pidMatch = url.match(/[/-]p0?(\d{7,9})/i) || url.match(/(\d{8,9})(?:\?|\.html)/);
      if (pidMatch) {
        const pid = pidMatch[1].replace(/^0+/, '');
        const endpoints = [
          `https://www.zara.com/ch/fr/product/${pid}-p0${pid}.json`,
          `https://www.zara.com/ch/fr/product/p0${pid}.json`,
        ];
        for (const ep of endpoints) {
          try {
            const r = await fetch(ep, { headers: { ...browserHeaders, 'Accept': 'application/json', 'Referer': 'https://www.zara.com/ch/fr/' } });
            if (r.ok) {
              const data = await r.json();
              const price = data?.detail?.colors?.[0]?.prices?.[0]?.price || data?.colors?.[0]?.prices?.[0]?.price;
              const name = data?.detail?.name || data?.name;
              if (price > 0) {
                const chf = price > 1000 ? price / 100 : price;
                return { statusCode: 200, headers, body: JSON.stringify({ prix: 'CHF ' + chf.toFixed(2), nom: name || null }) };
              }
            }
          } catch(e) {}
        }
      }
    }

    // ── Tous les sites ─────────────────────────────
    const r = await fetch(url, { headers: browserHeaders });
    const html = await r.text();
    const result = extractFromHtml(html);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ prix: null, nom: null }) };
  }
};

function extractFromHtml(html) {
  // JSON-LD
  const jldBlocks = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jldBlocks) {
    try {
      const obj = JSON.parse(block.replace(/<[^>]*>/g, ''));
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        const offers = item.offers;
        if (!offers) continue;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const price = parseFloat(offer.price || offer.lowPrice || 0);
        if (price > 0) return { prix: 'CHF ' + price.toFixed(2), nom: item.name || null };
      }
    } catch(e) {}
  }

  // Meta Open Graph
  const og = html.match(/property="product:price:amount"[^>]+content="([0-9.,]+)"/i) ||
             html.match(/content="([0-9.,]+)"[^>]+property="product:price:amount"/i);
  if (og && parseFloat(og[1]) > 0) {
    const nameM = html.match(/property="og:title"[^>]+content="([^"]+)"/i);
    return { prix: 'CHF ' + parseFloat(og[1].replace(',','.')).toFixed(2), nom: nameM?.[1] || null };
  }

  // Scan CHF (min 15 CHF)
  const titleM = html.match(/<title[^>]*>([^<|]+)/i);
  const nom = titleM?.[1]?.trim() || null;
  const chfList = [];
  const rgx = /CHF\s*([0-9]+[.,][0-9]{2})/g;
  let m;
  while ((m = rgx.exec(html)) !== null) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v >= 15 && v < 5000) chfList.push(v);
  }
  if (chfList.length > 0) {
    const freq = {};
    chfList.forEach(v => freq[v] = (freq[v]||0)+1);
    const best = Object.entries(freq).sort((a,b) => b[1]-a[1] || parseFloat(b[0])-parseFloat(a[0]))[0];
    return { prix: 'CHF ' + parseFloat(best[0]).toFixed(2), nom };
  }
  return { prix: null, nom };
}
