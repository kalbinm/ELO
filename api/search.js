function json(res, status, body) { res.status(status).json(body); }
function clean(value) { return String(value || '').replace(/\b(search|look up|find|google)\b/ig, '').trim().slice(0, 180); }
function strip(value) { return String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").trim(); }
module.exports = function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for web searches.' });
  var query = clean(req.body && req.body.query); if (!query) return json(res, 400, { error: 'Tell me what you want me to search for.' });
  fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { headers: { 'User-Agent': 'JARVIS voice assistant' } }).then(function (r) { return r.text(); }).then(function (html) {
    var matches = [], pattern = /result__a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?result__snippet[^>]*>([\s\S]*?)<\/a>/g, match;
    while ((match = pattern.exec(html)) && matches.length < 3) matches.push(strip(match[2]) + ': ' + strip(match[3]));
    if (!matches.length) return json(res, 200, { reply: 'I could not find a clear result for ' + query + '.' });
    return json(res, 200, { reply: 'Here is what I found for ' + query + '. ' + matches.join(' ') });
  }).catch(function () { return json(res, 502, { error: 'The web search service is unavailable.' }); });
};
