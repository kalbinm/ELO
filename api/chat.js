var SYSTEM_PROMPT = 'You are ELO, a calm, witty voice assistant. Keep answers short (1 to 3 sentences) because they are spoken aloud through a tiny speaker. No markdown, no lists, no emojis. If asked for something long, give a brief summary and offer to continue.';
var DEFAULT_MODEL = 'openai/gpt-oss-20b';

function json(res, status, body) { res.status(status).json(body); }
function cleanMessages(value) {
  if (!Array.isArray(value) || !value.length) return null;
  var result = [], start = Math.max(0, value.length - 6), i, item, content;
  for (i = start; i < value.length; i++) { item = value[i]; if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') return null; content = item.content.trim(); if (!content || content.length > 1000) return null; result.push({ role: item.role, content: content }); }
  return result;
}
module.exports = function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for chat requests.' });
  if (!process.env.GROQ_API_KEY) return json(res, 500, { error: 'GROQ_API_KEY is not configured.' });
  if (process.env.ACCESS_CODE && req.headers['x-access-code'] !== process.env.ACCESS_CODE) return json(res, 401, { error: 'Access code required.' });
  var body = req.body, messages = cleanMessages(body && body.messages);
  if (!messages) return json(res, 400, { error: 'Send a non-empty messages array with short text messages.' });
  fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.GROQ_MODEL || DEFAULT_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }].concat(messages), max_tokens: 200, temperature: 0.6 }) }).then(function (response) { return response.json().then(function (data) { return { response: response, data: data }; }); }).then(function (result) { if (!result.response.ok) { if (result.response.status === 429) return json(res, 429, { error: 'I’m a bit overloaded, try again in a moment.' }); return json(res, 502, { error: 'The language service is unavailable right now.' }); } var reply = result.data && result.data.choices && result.data.choices[0] && result.data.choices[0].message && result.data.choices[0].message.content; if (typeof reply !== 'string' || !reply.trim()) return json(res, 502, { error: 'The language service returned no reply.' }); return json(res, 200, { reply: reply.trim().slice(0, 2000) }); }).catch(function () { return json(res, 502, { error: 'Could not reach the language service.' }); });
};
