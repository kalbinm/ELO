(function () {
  'use strict';
  var FALLBACK_CITY = { name: 'Tirana', lat: 41.3275, lon: 19.8187 };
  var orb = document.getElementById('orb'), label = document.getElementById('stateLabel'), status = document.getElementById('status');
  var answer = document.getElementById('answer'), activity = document.getElementById('activity'), activityText = document.getElementById('activityText');
  var app = document.getElementById('app'), systemState = document.getElementById('systemState'), topClock = document.getElementById('topClock');
  var form = document.getElementById('fallbackForm'), input = document.getElementById('fallbackInput'), normalView = document.getElementById('normalView'), ambientView = document.getElementById('ambientView');
  var recognition = null, recognitionRunning = false, armed = false, manualListening = false, commandMode = false, transcript = '', commandTimer = null;
  var quietStream = null, quietRecorder = null, quietAnalyser = null, quietAudioContext = null, quietTimer = null, quietParts = [], quietLastVoice = 0, quietStarted = 0, quietBusy = false, quietSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var quietMime = '';
  var messages = [], idleTimer = null, weatherTimer = null, clockTimer = null, wakeLock = null;
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  function setState(state, text) { orb.className = 'orb ' + state; label.textContent = text; }
  function setStatus(text) { status.textContent = text || ''; }
  function setActivity(text, active) { activityText.textContent = text; activity.className = active ? 'activity active' : 'activity'; }
  function updateTopClock() { var now = new Date(); topClock.textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2); }
  function showFallback(message) { form.hidden = false; if (message) setStatus(message); }
  function stopSpeech() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  function resetIdle() { if (idleTimer) clearTimeout(idleTimer); if (!ambientView.hidden) leaveAmbient(); idleTimer = setTimeout(enterAmbient, 60000); }
  function normalize(text) { return text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function wakeCommand(spoken) { var match = spoken.match(/\b(hey|okay|ok)\s+jarvis\b/); if (match) return { index: match.index, length: match[0].length }; return null; }
  function handleTranscript(text) {
    var spoken = normalize(text), wake = wakeCommand(spoken); transcript = text;
    if (!spoken) return;
    if (manualListening) { manualListening = false; finishCommand(spoken); }
    else if (!commandMode && wake) { commandMode = true; transcript = spoken.slice(wake.index + wake.length).trim(); setState('listening', 'I’m listening...'); setActivity('Wake word heard', true); stopSpeech(); if (transcript) finishCommand(transcript); else { setStatus('Go ahead.'); commandTimer = setTimeout(function () { commandMode = false; setState('idle', 'Press to speak'); setActivity('Press reactor to talk', false); }, 7000); } }
    else if (commandMode) { if (commandTimer) clearTimeout(commandTimer); finishCommand(spoken); }
  }
  function chooseQuietMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
    return '';
  }
  function startQuietListening() {
    if (!quietSupported) { startListening(); return; }
    if (quietStream) { startQuietVad(); return; }
    var constraints = { audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: false } };
    navigator.mediaDevices.getUserMedia(constraints).catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); }).then(function (stream) {
      quietStream = stream; quietMime = chooseQuietMime();
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio analysis is unavailable.');
      quietAudioContext = new AudioContext(); quietAnalyser = quietAudioContext.createAnalyser(); quietAnalyser.fftSize = 1024; quietAnalyser.smoothingTimeConstant = 0.35;
      quietAudioContext.createMediaStreamSource(stream).connect(quietAnalyser); systemState.textContent = 'VOICE LINK ACTIVE'; setState('listening', 'Speak now...'); setStatus('Microphone on — speak now'); setActivity('Quiet speech monitor', true); startQuietVad();
    }).catch(function () { stopQuietListening(); quietSupported = false; armed = false; setStatus('Quiet-mic mode unavailable; switching to browser voice recognition.'); startListening(); });
  }
  function startQuietVad() { if (quietTimer) clearTimeout(quietTimer); quietTimer = setTimeout(checkQuietVoice, 80); }
  function checkQuietVoice() {
    if (!armed || !quietAnalyser || document.hidden) return;
    var data = new Uint8Array(quietAnalyser.fftSize), i, sum = 0, value, rms, now = Date.now(); quietAnalyser.getByteTimeDomainData(data);
    for (i = 0; i < data.length; i++) { value = (data[i] - 128) / 128; sum += value * value; }
    rms = Math.sqrt(sum / data.length);
    if (!quietBusy && rms > 0.018 && !(window.speechSynthesis && window.speechSynthesis.speaking)) startQuietChunk();
    if (quietBusy && quietRecorder && quietRecorder.state === 'recording') { if (rms > 0.014) quietLastVoice = now; if (now - quietLastVoice > 900 || now - quietStarted > 5000) stopQuietChunk(); }
    quietTimer = setTimeout(checkQuietVoice, 100);
  }
  function startQuietChunk() {
    try { quietParts = []; quietStarted = Date.now(); quietLastVoice = quietStarted; quietBusy = true; quietRecorder = quietMime ? new MediaRecorder(quietStream, { mimeType: quietMime }) : new MediaRecorder(quietStream); quietRecorder.ondataavailable = function (event) { if (event.data && event.data.size) quietParts.push(event.data); }; quietRecorder.onstop = function () { var blob = new Blob(quietParts, { type: quietMime || 'audio/webm' }); if (blob.size) transcribeQuietChunk(blob); else quietBusy = false; }; quietRecorder.start(); setActivity('Listening for speech', true); } catch (e) { stopQuietListening(); quietSupported = false; startListening(); }
  }
  function stopQuietChunk() { if (quietRecorder && quietRecorder.state === 'recording') { try { quietRecorder.stop(); } catch (e) {} } }
  function transcribeQuietChunk(blob) {
    var reader = new FileReader(); reader.onloadend = function () { var dataUrl = String(reader.result || ''), comma = dataUrl.indexOf(','), base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl; fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64, mimeType: blob.type || 'audio/webm', filename: 'jarvis.' + (/ogg/i.test(blob.type) ? 'ogg' : 'webm') }) }).then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); }).then(function (result) { if (!result.ok) throw new Error(result.data.error || 'Transcription failed.'); if (result.data.text) handleTranscript(result.data.text); }).catch(function (error) { setStatus(error.message || 'Transcription failed.'); }).then(function () { quietBusy = false; }); }; reader.readAsDataURL(blob);
  }
  function stopQuietListening() { if (quietTimer) clearTimeout(quietTimer); quietTimer = null; if (quietRecorder && quietRecorder.state === 'recording') { try { quietRecorder.stop(); } catch (e) {} } if (quietStream) { quietStream.getTracks().forEach(function (track) { track.stop(); }); quietStream = null; } if (quietAudioContext && quietAudioContext.close) { quietAudioContext.close(); quietAudioContext = null; } quietAnalyser = null; quietRecorder = null; quietBusy = false; }
  function setupRecognition() {
    if (!SpeechRecognition) { showFallback('Voice input is unavailable here. Type below instead.'); return; }
    recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = function () { recognitionRunning = true; systemState.textContent = 'VOICE LINK ACTIVE'; setStatus('Microphone on — speak now'); setState('listening', 'Speak now...'); setActivity('Listening for one command', true); };
    recognition.onresult = function (event) {
      var text = '', i, result; for (i = event.resultIndex; i < event.results.length; i++) { result = event.results[i]; text += result[0].transcript; }
      handleTranscript(text);
    };
    recognition.onnomatch = function () { setStatus('I heard something, but not the wake word. Try “Hey JARVIS” again.'); };
    recognition.onerror = function (event) { recognitionRunning = false; systemState.textContent = 'VOICE LINK CHECK'; if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { armed = false; showFallback('Allow microphone access once, then JARVIS can listen hands-free.'); setActivity('Microphone permission needed', false); } else setStatus('I lost the signal. I’ll try again.'); };
    recognition.onend = function () { recognitionRunning = false; if (manualListening) { manualListening = false; armed = false; setState('idle', 'Press to speak'); setActivity('Press reactor to talk', false); } };
  }
  function startListening() { if (!recognition || recognitionRunning || document.hidden) return; try { recognition.start(); } catch (e) {} }
  function startManualListening() { if (manualListening || (window.speechSynthesis && window.speechSynthesis.speaking)) return; armed = true; manualListening = true; commandMode = false; setActivity('Listening for one command', true); setState('listening', 'Speak now...'); if (quietSupported) startQuietListening(); else startListening(); }
  function finishCommand(text) { commandMode = false; manualListening = false; armed = false; if (commandTimer) clearTimeout(commandTimer); stopQuietListening(); setState('thinking', 'Thinking...'); setActivity('Working on it', true); setStatus(''); routeCommand(text); }
  function isSearch(text) { return /\b(search|look up|find|google)\b/i.test(text); }
  function isNews(text) { return /\b(news|latest events|current events|headlines|what happened)\b/i.test(text); }
  function routeCommand(text) { if (/\b(what(?:'s| is)? the )?time\b/i.test(text)) return tellTime(); if (isNews(text)) return fetchBrief('/api/news', text); if (isSearch(text)) return fetchBrief('/api/search', text); sendChat(text); }
  function tellTime() { var now = new Date(), reply = 'It’s ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' in your local time.'; answer.textContent = reply; speak(reply); }
  function fetchBrief(endpoint, text) { answer.textContent = 'Checking the latest information...'; fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); }).then(function (result) { if (!result.ok) throw new Error(result.data.error || 'Search is unavailable.'); var reply = String(result.data.reply || '').trim(); answer.textContent = reply || 'I could not find a useful result.'; speak(reply || 'I could not find a useful result.'); }).catch(function (error) { answer.textContent = 'I could not reach the web right now.'; setState('idle', 'Press to speak'); setStatus(error.message); setActivity('Press reactor to talk', false); }); }
  function sendChat(text) {
    messages.push({ role: 'user', content: text }); if (messages.length > 6) messages.shift(); answer.textContent = '...';
    var headers = { 'Content-Type': 'application/json' }, savedCode = window.localStorage.getItem('elo_access_code'); if (savedCode) headers['X-Access-Code'] = savedCode;
    fetch('/api/chat', { method: 'POST', headers: headers, body: JSON.stringify({ messages: messages }) }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d, status: r.status }; }); }).then(function (result) { if (!result.ok && result.status === 401) { var code = window.prompt('Enter the JARVIS access code:'); if (code) { window.localStorage.setItem('elo_access_code', code); return sendChat(text); } throw new Error('Access code required.'); } if (!result.ok) throw new Error(result.data.error || 'JARVIS is unavailable.'); var reply = String(result.data.reply || '').trim(); messages.push({ role: 'assistant', content: reply }); if (messages.length > 6) messages.shift(); answer.textContent = reply; speak(reply); }).catch(function (error) { answer.textContent = 'I’m here, but my brain is having a tiny coffee break.'; setState('idle', 'Say “Hey JARVIS”'); setStatus(error.message); setActivity('Wake word standby', true); });
  }
  function speak(text) { if (!window.speechSynthesis) { setState('idle', 'Press to speak'); return; } setState('speaking', 'Speaking...'); setActivity('JARVIS is speaking', true); var utterance = new SpeechSynthesisUtterance(text), voices = window.speechSynthesis.getVoices(); utterance.voice = voices.filter(function (voice) { return /^en(-|_)/i.test(voice.lang) && /Google|Samantha|Daniel|Microsoft/i.test(voice.name); })[0] || voices.filter(function (voice) { return /^en(-|_)/i.test(voice.lang); })[0] || null; utterance.volume = 1; utterance.rate = 0.93; utterance.pitch = 1.04; utterance.onend = function () { setState('idle', 'Press to speak'); setActivity('Press reactor to talk', false); resetIdle(); }; utterance.onerror = utterance.onend; window.speechSynthesis.speak(utterance); }
  function submitFallback(event) { event.preventDefault(); var text = input.value.trim(); if (!text) return; input.value = ''; resetIdle(); finishCommand(text); }
  function enterAmbient() { if (document.hidden) return; ambientView.hidden = false; normalView.hidden = true; updateClock(); getWeather(); if (weatherTimer) clearInterval(weatherTimer); weatherTimer = setInterval(getWeather, 900000); if (clockTimer) clearInterval(clockTimer); clockTimer = setInterval(updateClock, 30000); requestWakeLock(); }
  function leaveAmbient() { ambientView.hidden = true; normalView.hidden = false; if (weatherTimer) clearInterval(weatherTimer); if (clockTimer) clearInterval(clockTimer); weatherTimer = clockTimer = null; if (wakeLock && wakeLock.release) { wakeLock.release(); wakeLock = null; } resetIdle(); }
  function updateClock() { var now = new Date(); document.getElementById('ambientTime').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2); document.getElementById('ambientDate').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function getWeather() { var use = function (location) { fetch('https://api.open-meteo.com/v1/forecast?latitude=' + location.lat + '&longitude=' + location.lon + '&current=temperature_2m,weather_code&timezone=auto').then(function (r) { return r.json(); }).then(function (d) { var c = d.current || {}; document.getElementById('weather').textContent = location.name + '  ' + Math.round(c.temperature_2m) + '°  ' + weatherLabel(c.weather_code); }).catch(function () { document.getElementById('weather').textContent = 'Weather unavailable'; }); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { use({ name: 'Nearby', lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { use(FALLBACK_CITY); }, { timeout: 5000, maximumAge: 900000 }); else use(FALLBACK_CITY); }
  function weatherLabel(code) { if (code === 0) return 'Clear'; if (code < 4) return 'Partly cloudy'; if (code < 70) return 'Cloudy'; if (code < 80) return 'Rain'; if (code < 90) return 'Showers'; return 'Storm'; }
  function requestWakeLock() { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () {}); }
  orb.addEventListener('click', function () { resetIdle(); if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeech(); setState('idle', 'Press to speak'); return; } startManualListening(); });
  document.getElementById('listenButton').addEventListener('click', function () { resetIdle(); startManualListening(); });
  document.getElementById('newsButton').addEventListener('click', function () { resetIdle(); finishCommand('what is the latest news'); });
  document.getElementById('searchButton').addEventListener('click', function () { resetIdle(); showFallback('Type a search below, then press SEND.'); input.focus(); });
  document.getElementById('ambientButton').addEventListener('click', function () { enterAmbient(); });
  Array.prototype.forEach.call(document.querySelectorAll('.theme-swatch'), function (button) { button.addEventListener('click', function () { app.className = 'app ' + button.getAttribute('data-theme'); Array.prototype.forEach.call(document.querySelectorAll('.theme-swatch'), function (item) { item.classList.remove('active'); }); button.classList.add('active'); window.localStorage.setItem('elo_theme', button.getAttribute('data-theme')); }); });
  form.addEventListener('submit', submitFallback); document.addEventListener('touchstart', function () { if (!ambientView.hidden) leaveAmbient(); resetIdle(); }, { passive: true }); document.addEventListener('click', resetIdle); document.addEventListener('visibilitychange', function () { if (document.hidden) { if (idleTimer) clearTimeout(idleTimer); stopQuietListening(); } else { resetIdle(); } });
  var savedTheme = window.localStorage.getItem('elo_theme'); if (savedTheme) { app.className = 'app ' + savedTheme; Array.prototype.forEach.call(document.querySelectorAll('.theme-swatch'), function (item) { item.classList.toggle('active', item.getAttribute('data-theme') === savedTheme); }); }
  window.addEventListener('beforeunload', function () { stopSpeech(); stopQuietListening(); }); setupRecognition(); resetIdle(); updateTopClock(); setInterval(updateTopClock, 30000); setStatus('Press the reactor to speak'); setState('idle', 'Press to speak'); setActivity('Press reactor to talk', false);
}());
