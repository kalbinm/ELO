(function () {
  'use strict';
  var FALLBACK_CITY = { name: 'Tirana', lat: 41.3275, lon: 19.8187 };
  var orb = document.getElementById('orb'), label = document.getElementById('stateLabel'), status = document.getElementById('status');
  var answer = document.getElementById('answer'), activity = document.getElementById('activity'), activityText = document.getElementById('activityText');
  var form = document.getElementById('fallbackForm'), input = document.getElementById('fallbackInput'), normalView = document.getElementById('normalView'), ambientView = document.getElementById('ambientView');
  var recognition = null, recognitionRunning = false, armed = false, commandMode = false, transcript = '', commandTimer = null;
  var messages = [], idleTimer = null, weatherTimer = null, clockTimer = null, wakeLock = null;
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  function setState(state, text) { orb.className = 'orb ' + state; label.textContent = text; }
  function setStatus(text) { status.textContent = text || ''; }
  function setActivity(text, active) { activityText.textContent = text; activity.className = active ? 'activity active' : 'activity'; }
  function showFallback(message) { form.hidden = false; if (message) setStatus(message); }
  function stopSpeech() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  function resetIdle() { if (idleTimer) clearTimeout(idleTimer); if (!ambientView.hidden) leaveAmbient(); idleTimer = setTimeout(enterAmbient, 60000); }
  function normalize(text) { return text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function setupRecognition() {
    if (!SpeechRecognition) { showFallback('Voice input is unavailable here. Type below instead.'); return; }
    recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognition.onstart = function () { recognitionRunning = true; setStatus(''); setState('listening', armed ? 'Say “Hey ELO”' : 'Listening...'); setActivity('Wake word standby', true); };
    recognition.onresult = function (event) {
      var text = '', i, result; for (i = event.resultIndex; i < event.results.length; i++) { result = event.results[i]; text += result[0].transcript; }
      var spoken = normalize(text), wakeIndex = spoken.indexOf('hey elo'); transcript = text;
      if (!commandMode && wakeIndex !== -1) { commandMode = true; transcript = spoken.slice(wakeIndex + 7).trim(); setState('listening', 'I’m listening...'); setActivity('Wake word heard', true); stopSpeech(); if (transcript) finishCommand(transcript); else { setStatus('Go ahead.'); commandTimer = setTimeout(function () { commandMode = false; setState('listening', 'Say “Hey ELO”'); setActivity('Wake word standby', true); }, 7000); } }
      else if (commandMode && spoken) { if (commandTimer) clearTimeout(commandTimer); finishCommand(spoken); }
    };
    recognition.onerror = function (event) { recognitionRunning = false; if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { armed = false; showFallback('Allow microphone access once, then ELO can listen hands-free.'); setActivity('Microphone permission needed', false); } else setStatus('I lost the signal. I’ll try again.'); };
    recognition.onend = function () { recognitionRunning = false; if (armed && !document.hidden && !(window.speechSynthesis && window.speechSynthesis.speaking)) setTimeout(startListening, 450); };
  }
  function startListening() { if (!recognition || recognitionRunning || document.hidden) return; try { recognition.start(); } catch (e) {} }
  function armListening() { armed = true; setActivity('Wake word standby', true); setState('listening', 'Say “Hey ELO”'); startListening(); }
  function finishCommand(text) { commandMode = false; if (commandTimer) clearTimeout(commandTimer); setState('thinking', 'Thinking...'); setActivity('Working on it', true); setStatus(''); routeCommand(text); }
  function isSearch(text) { return /\b(search|look up|find|google)\b/i.test(text); }
  function isNews(text) { return /\b(news|latest events|current events|headlines|what happened)\b/i.test(text); }
  function routeCommand(text) { if (isNews(text)) return fetchBrief('/api/news', text); if (isSearch(text)) return fetchBrief('/api/search', text); sendChat(text); }
  function fetchBrief(endpoint, text) { answer.textContent = 'Checking the latest information...'; fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); }).then(function (result) { if (!result.ok) throw new Error(result.data.error || 'Search is unavailable.'); var reply = String(result.data.reply || '').trim(); answer.textContent = reply || 'I could not find a useful result.'; speak(reply || 'I could not find a useful result.'); }).catch(function (error) { answer.textContent = 'I could not reach the web right now.'; setState('idle', 'Say “Hey ELO”'); setStatus(error.message); setActivity('Wake word standby', true); }); }
  function sendChat(text) {
    messages.push({ role: 'user', content: text }); if (messages.length > 6) messages.shift(); answer.textContent = '...';
    var headers = { 'Content-Type': 'application/json' }, savedCode = window.localStorage.getItem('elo_access_code'); if (savedCode) headers['X-Access-Code'] = savedCode;
    fetch('/api/chat', { method: 'POST', headers: headers, body: JSON.stringify({ messages: messages }) }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d, status: r.status }; }); }).then(function (result) { if (!result.ok && result.status === 401) { var code = window.prompt('Enter the ELO access code:'); if (code) { window.localStorage.setItem('elo_access_code', code); return sendChat(text); } throw new Error('Access code required.'); } if (!result.ok) throw new Error(result.data.error || 'ELO is unavailable.'); var reply = String(result.data.reply || '').trim(); messages.push({ role: 'assistant', content: reply }); if (messages.length > 6) messages.shift(); answer.textContent = reply; speak(reply); }).catch(function (error) { answer.textContent = 'I’m here, but my brain is having a tiny coffee break.'; setState('idle', 'Say “Hey ELO”'); setStatus(error.message); setActivity('Wake word standby', true); });
  }
  function speak(text) { if (!window.speechSynthesis) { setState('idle', 'Say “Hey ELO”'); return; } setState('speaking', 'Speaking...'); setActivity('ELO is speaking', true); var utterance = new SpeechSynthesisUtterance(text), voices = window.speechSynthesis.getVoices(); utterance.voice = voices.filter(function (voice) { return /^en(-|_)/i.test(voice.lang) && /Google|Samantha|Daniel|Microsoft/i.test(voice.name); })[0] || voices.filter(function (voice) { return /^en(-|_)/i.test(voice.lang); })[0] || null; utterance.volume = 1; utterance.rate = 0.93; utterance.pitch = 1.04; utterance.onend = function () { setState('listening', 'Say “Hey ELO”'); setActivity('Wake word standby', true); resetIdle(); if (armed) startListening(); }; utterance.onerror = utterance.onend; window.speechSynthesis.speak(utterance); }
  function submitFallback(event) { event.preventDefault(); var text = input.value.trim(); if (!text) return; input.value = ''; resetIdle(); finishCommand(text); }
  function enterAmbient() { if (document.hidden) return; ambientView.hidden = false; normalView.hidden = true; updateClock(); getWeather(); if (weatherTimer) clearInterval(weatherTimer); weatherTimer = setInterval(getWeather, 900000); if (clockTimer) clearInterval(clockTimer); clockTimer = setInterval(updateClock, 30000); requestWakeLock(); }
  function leaveAmbient() { ambientView.hidden = true; normalView.hidden = false; if (weatherTimer) clearInterval(weatherTimer); if (clockTimer) clearInterval(clockTimer); weatherTimer = clockTimer = null; if (wakeLock && wakeLock.release) { wakeLock.release(); wakeLock = null; } resetIdle(); }
  function updateClock() { var now = new Date(); document.getElementById('ambientTime').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2); document.getElementById('ambientDate').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function getWeather() { var use = function (location) { fetch('https://api.open-meteo.com/v1/forecast?latitude=' + location.lat + '&longitude=' + location.lon + '&current=temperature_2m,weather_code&timezone=auto').then(function (r) { return r.json(); }).then(function (d) { var c = d.current || {}; document.getElementById('weather').textContent = location.name + '  ' + Math.round(c.temperature_2m) + '°  ' + weatherLabel(c.weather_code); }).catch(function () { document.getElementById('weather').textContent = 'Weather unavailable'; }); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { use({ name: 'Nearby', lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { use(FALLBACK_CITY); }, { timeout: 5000, maximumAge: 900000 }); else use(FALLBACK_CITY); }
  function weatherLabel(code) { if (code === 0) return 'Clear'; if (code < 4) return 'Partly cloudy'; if (code < 70) return 'Cloudy'; if (code < 80) return 'Rain'; if (code < 90) return 'Showers'; return 'Storm'; }
  function requestWakeLock() { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () {}); }
  orb.addEventListener('click', function () { resetIdle(); if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeech(); setState('listening', 'Say “Hey ELO”'); return; } armListening(); });
  form.addEventListener('submit', submitFallback); document.addEventListener('touchstart', function () { if (!ambientView.hidden) leaveAmbient(); resetIdle(); }, { passive: true }); document.addEventListener('click', resetIdle); document.addEventListener('visibilitychange', function () { if (document.hidden) { if (idleTimer) clearTimeout(idleTimer); } else { resetIdle(); if (armed) startListening(); } });
  window.addEventListener('beforeunload', stopSpeech); setupRecognition(); resetIdle(); setTimeout(function () { if (recognition) armListening(); }, 300);
}());
