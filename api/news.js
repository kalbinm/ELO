function json(res, status, body) { res.status(status).json(body); }
function clean(value) { return String(value || '').replace(/\b(news|latest events|current events|headlines|what happened)\b/ig, '').trim().slice(0, 100); }
function decode(value) { return String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim(); }
module.exports = function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for news requests.' });
  var topic = clean(req.body && req.body.query), url = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'; if (topic) url += '&q=' + encodeURIComponent(topic);
  fetch(url, { headers: { 'User-Agent': 'ELO voice assistant' } }).then(function (r) { return r.text(); }).then(function (xml) {
    var items = [], pattern = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g, match;
    while ((match = pattern.exec(xml)) && items.length < 5) items.push(decode(match[1]) + ' (' + new Date(decode(match[2])).toLocaleDateString() + ')');
    if (!items.length) return json(res, 200, { reply: 'I could not retrieve the latest headlines right now.' });
    return json(res, 200, { reply: 'Here are the latest headlines. ' + items.join('. ') });
  }).catch(function () { return json(res, 502, { error: 'The news service is unavailable.' }); });
};
