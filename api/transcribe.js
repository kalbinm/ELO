var MAX_AUDIO_BYTES = 4 * 1024 * 1024;
var DEFAULT_MODEL = 'whisper-large-v3-turbo';

function json(res, status, body) { res.status(status).json(body); }
function extensionFor(type) {
  if (/ogg/i.test(type)) return 'ogg';
  if (/mp4|m4a|mp4a/i.test(type)) return 'm4a';
  if (/wav/i.test(type)) return 'wav';
  return 'webm';
}
function cleanText(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

module.exports = function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for audio transcription.' });
  if (!process.env.GROQ_API_KEY) return json(res, 500, { error: 'GROQ_API_KEY is not configured.' });
  var body = req.body, encoded, mimeType = 'audio/webm', filename;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (body && typeof body === 'object') { encoded = body.audio || body.audioBase64 || body.data; mimeType = body.mimeType || body.type || mimeType; filename = body.filename; }
  if (typeof encoded !== 'string' || !encoded) return json(res, 400, { error: 'Send audio as a base64 JSON field named audio.' });
  encoded = encoded.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  var audio;
  try { audio = Buffer.from(encoded, 'base64'); } catch (e) { return json(res, 400, { error: 'The audio data is invalid.' }); }
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) return json(res, 413, { error: 'Audio must be between 1 byte and 4 MB.' });
  filename = filename || 'elo.' + extensionFor(mimeType);
  var form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), filename);
  form.append('model', process.env.GROQ_TRANSCRIBE_MODEL || DEFAULT_MODEL);
  form.append('response_format', 'json');
  fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY }, body: form }).then(function (response) { return response.json().then(function (data) { return { response: response, data: data }; }); }).then(function (result) {
    if (!result.response.ok) return json(res, result.response.status === 429 ? 429 : 502, { error: result.response.status === 429 ? 'Transcription is busy. Try again shortly.' : 'The transcription service is unavailable.' });
    var text = cleanText(result.data && result.data.text); if (!text) return json(res, 200, { text: '' });
    return json(res, 200, { text: text });
  }).catch(function () { return json(res, 502, { error: 'Could not reach the transcription service.' }); });
};
