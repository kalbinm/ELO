(function () {
  'use strict';
  var APP_NAME = 'ELO';
  var FALLBACK_CITY = { name: 'Tirana', lat: 41.3275, lon: 19.8187 };
  var orb = document.getElementById('orb');
  var label = document.getElementById('stateLabel');
  var status = document.getElementById('status');
  var answer = document.getElementById('answer');
  var form = document.getElementById('fallbackForm');
  var input = document.getElementById('fallbackInput');
  var normalView = document.getElementById('normalView');
  var ambientView = document.getElementById('ambientView');
  var recognition = null, isHolding = false, sentForHold = false, transcript = '', pendingRelease = false;
  var messages = [], idleTimer = null, weatherTimer = null, clockTimer = null, wakeLock = null;
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function setState(state, text) { orb.className = 'orb ' + state; label.textContent = text; }
  function setStatus(text) { status.textContent = text || ''; }
  function showFallback(message) { form.hidden = false; if (message) setStatus(message); }
  function stopSpeech() { if (window.speechSynthesis) { window.speechSynthesis.cancel(); } }
  function resetIdle() { if (idleTimer) window.clearTimeout(idleTimer); if (!ambientView.hidden) leaveAmbient(); idleTimer = window.setTimeout(enterAmbient, 60000); }
  function setupRecognition() {
    if (!SpeechRecognition) { showFallback('Voice input is unavailable here. Type below instead.'); return; }
    recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognition.onstart = function () { setStatus(''); setState('listening', 'Listening...'); };
    recognition.onresult = function (event) { var i, result; transcript = ''; for (i = event.resultIndex; i < event.results.length; i++) { result = event.results[i]; transcript += result[0].transcript; } };
    recognition.onerror = function (event) { pendingRelease = false; isHolding = false; setState('idle', 'Press and hold'); if (event.error === 'not-allowed' || event.error === 'service-not-allowed') showFallback('Microphone blocked. Allow it in browser settings, or type below.'); else showFallback('Voice input failed. Type below instead.'); };
    recognition.onend = function () { if (pendingRelease) { pendingRelease = false; if (transcript.trim()) sendMessage(transcript.trim()); else { setState('idle', 'Press and hold'); setStatus('I did not hear anything.'); } } };
  }
  function pressStart(event) { if (event) { event.preventDefault(); } resetIdle(); if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeech(); setState('idle', 'Press and hold'); return; } if (!recognition) { showFallback('Voice input is unavailable here. Type below instead.'); input.focus(); return; } if (isHolding) return; isHolding = true; sentForHold = false; transcript = ''; pendingRelease = false; try { recognition.start(); } catch (e) { isHolding = false; showFallback('Voice input could not start. Type below instead.'); } }
  function pressEnd(event) { if (event) event.preventDefault(); if (!isHolding || !recognition) return; isHolding = false; pendingRelease = true; try { recognition.stop(); } catch (e) { pendingRelease = false; } }
  function sendMessage(text) {
    if (sentForHold) return; sentForHold = true; setState('thinking', 'Thinking...'); setStatus(''); answer.textContent = '...';
    messages.push({ role: 'user', content: text }); if (messages.length > 6) messages.shift();
    var headers = { 'Content-Type': 'application/json' }, savedCode = window.localStorage.getItem('elo_access_code');
    if (savedCode) headers['X-Access-Code'] = savedCode;
    fetch('/api/chat', { method: 'POST', headers: headers, body: JSON.stringify({ messages: messages }) }).then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data, status: response.status }; }); }).then(function (result) {
      if (!result.ok && (result.status === 401)) { var code = window.prompt('Enter the ELO access code:'); if (code) { window.localStorage.setItem('elo_access_code', code); sentForHold = false; sendMessage(text); } else { throw new Error('Access code required.'); } return; }
      if (!result.ok) throw new Error(result.data.error || 'ELO is unavailable.');
      var reply = String(result.data.reply || '').trim(); if (!reply) throw new Error('ELO returned an empty reply.'); messages.push({ role: 'assistant', content: reply }); if (messages.length > 6) messages.shift(); answer.textContent = reply; speak(reply);
    }).catch(function (error) { answer.textContent = 'Ready when you are.'; setState('idle', 'Press and hold'); setStatus(error.message === 'Access code required.' ? error.message : 'I’m a bit overloaded. Try again in a moment.'); });
  }
  function speak(text) { if (!window.speechSynthesis) { setState('idle', 'Press and hold'); return; } setState('speaking', 'Speaking...'); var utterance = new SpeechSynthesisUtterance(text); utterance.volume = 1; utterance.rate = 0.88; utterance.pitch = 1; utterance.onend = function () { setState('idle', 'Press and hold'); resetIdle(); }; utterance.onerror = utterance.onend; window.speechSynthesis.speak(utterance); }
  function submitFallback(event) { event.preventDefault(); var text = input.value.trim(); if (!text) return; input.value = ''; sentForHold = false; resetIdle(); sendMessage(text); }
  function enterAmbient() { if (document.hidden || isHolding) return; ambientView.hidden = false; normalView.hidden = true; updateClock(); getWeather(); if (weatherTimer) window.clearInterval(weatherTimer); weatherTimer = window.setInterval(getWeather, 900000); if (clockTimer) window.clearInterval(clockTimer); clockTimer = window.setInterval(updateClock, 30000); requestWakeLock(); }
  function leaveAmbient() { ambientView.hidden = true; normalView.hidden = false; if (weatherTimer) { window.clearInterval(weatherTimer); weatherTimer = null; } if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null; } if (wakeLock && wakeLock.release) { wakeLock.release(); wakeLock = null; } resetIdle(); }
  function updateClock() { var now = new Date(), time = document.getElementById('ambientTime'), date = document.getElementById('ambientDate'); time.textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2); date.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function getWeather() { var use = function (location) { fetch('https://api.open-meteo.com/v1/forecast?latitude=' + location.lat + '&longitude=' + location.lon + '&current=temperature_2m,weather_code&timezone=auto').then(function (r) { return r.json(); }).then(function (d) { var current = d.current || {}, labelText = weatherLabel(current.weather_code); document.getElementById('weather').textContent = location.name + '  ' + Math.round(current.temperature_2m) + '°  ' + labelText; }).catch(function () { document.getElementById('weather').textContent = 'Weather unavailable'; }); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { use({ name: 'Nearby', lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { use(FALLBACK_CITY); }, { timeout: 5000, maximumAge: 900000 }); else use(FALLBACK_CITY); }
  function weatherLabel(code) { if (code === 0) return 'Clear'; if (code < 4) return 'Partly cloudy'; if (code < 70) return 'Cloudy'; if (code < 80) return 'Rain'; if (code < 90) return 'Showers'; return 'Storm'; }
  function requestWakeLock() { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () {}); }
  orb.addEventListener('pointerdown', pressStart); orb.addEventListener('pointerup', pressEnd); orb.addEventListener('pointercancel', pressEnd); orb.addEventListener('pointerleave', pressEnd); orb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  if (!window.PointerEvent) { orb.addEventListener('touchstart', pressStart, { passive: false }); orb.addEventListener('touchend', pressEnd, { passive: false }); orb.addEventListener('touchcancel', pressEnd, { passive: false }); }
  form.addEventListener('submit', submitFallback); document.addEventListener('touchstart', function () { if (!ambientView.hidden) leaveAmbient(); resetIdle(); }, { passive: true }); document.addEventListener('click', resetIdle); document.addEventListener('visibilitychange', function () { if (document.hidden) { if (idleTimer) window.clearTimeout(idleTimer); if (weatherTimer) window.clearInterval(weatherTimer); if (clockTimer) window.clearInterval(clockTimer); } else { if (!ambientView.hidden) { getWeather(); clockTimer = window.setInterval(updateClock, 30000); } resetIdle(); } });
  window.addEventListener('beforeunload', stopSpeech); setupRecognition(); resetIdle();
}());
