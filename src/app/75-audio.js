// ===== 75-audio: процедурный звук (WebAudio, без ассетов) и вибрация =====
// Контекст создаётся/резюмится только по жесту пользователя (требование iOS) —
// Sound.unlock() вешается на pointerdown в 90-input.

const Sound = (function(){
  let ctx = null, master = null;
  function ensure(){
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch(e){ ctx = null; }
  }
  // Сэмплы из 74-sfx-data: декод лениво после unlock. m4a/AAC декодится
  // везде (ogg Safari НЕ умеет — потому конверсия на этапе интеграции).
  // При недоступности сэмпла звук честно падает на процедурный вариант.
  const buffers = {};
  function b64buf(b64){
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function loadSamples(){
    if (!ctx || loadSamples.done) return;
    loadSamples.done = true;
    for (const k in SFX_B64){
      try { ctx.decodeAudioData(b64buf(SFX_B64[k]), buf => { buffers[k] = buf; }, ()=>{}); }
      catch(e){}
    }
  }
  function playBuf(name, peak){
    const buf = buffers[name];
    if (!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = peak || 0.7;
    src.connect(g); g.connect(master); src.start();
    return true;
  }
  function unlock(){
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    loadSamples();
  }
  function env(t0, a, d, peak){
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
    g.connect(master);
    return g;
  }
  function tone(freq, type, t0, a, d, peak){
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(env(t0, a, d, peak));
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  function noise(t0, d, peak, cutoff){
    const len = Math.max(1, Math.floor(ctx.sampleRate * d));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 800;
    src.connect(f); f.connect(env(t0, 0.005, d, peak));
    src.start(t0);
  }
  const fxMap = {
    match(n){ // «буль»-арпеджио, выше и длиннее при большой группе
      const t = ctx.currentTime, base = 380 + Math.min(4, n)*60;
      for (let i=0;i<Math.min(n,4);i++) tone(base*Math.pow(1.25, i), 'sine', t + i*0.055, 0.008, 0.16, 0.45);
    },
    miss(){ const t = ctx.currentTime; tone(150, 'square', t, 0.005, 0.12, 0.16); tone(110, 'square', t+0.07, 0.005, 0.12, 0.13); },
    shake(){ noise(ctx.currentTime, 0.35, 0.45, 500); },
    grind(){ // сэмпл дробления (3 варианта, спека владельца) с процедурным фолбэком
      if (playBuf('grind' + (1 + Math.floor(Math.random()*3)), 0.8)) return;
      const t = ctx.currentTime; noise(t, 0.45, 0.5, 300); tone(70, 'sawtooth', t, 0.01, 0.4, 0.22); },
    ui(){ if (!playBuf('ui', 0.5)){ const t = ctx.currentTime; tone(900, 'sine', t, 0.004, 0.05, 0.15); } },
    combo(){ // «пауэр-ап»: восходящее глиссандо + искорка; старт с задержкой,
             // чтобы не маскировать «буль» матча, звучащий в тот же тап
      const t = ctx.currentTime + 0.06;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(1260, t + 0.18);
      o.connect(env(t, 0.01, 0.22, 0.4));
      o.start(t); o.stop(t + 0.3);
      tone(1568, 'sine', t + 0.16, 0.005, 0.12, 0.3);  // искорка сверху
      tone(2093, 'sine', t + 0.22, 0.005, 0.14, 0.22);
    },
    chain(){ // «реактор пошёл»: низкое глиссандо + свуш + фанфарная искра
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.35);
      o.connect(env(t, 0.02, 0.4, 0.3));
      o.start(t); o.stop(t + 0.5);
      noise(t + 0.05, 0.35, 0.3, 1200);
      [784, 1047, 1568].forEach((f,i)=>tone(f, 'triangle', t + 0.3 + i*0.07, 0.008, 0.2, 0.32));
    },
    surprise(){ const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f,i)=>tone(f, 'triangle', t + i*0.09, 0.01, 0.25, 0.38)); },
    win(){ const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f,i)=>tone(f, 'triangle', t + i*0.12, 0.01, 0.3, 0.38)); },
    lose(){ const t = ctx.currentTime; [330, 262, 196].forEach((f,i)=>tone(f, 'sine', t + i*0.15, 0.01, 0.35, 0.32)); },
  };
  return {
    unlock,
    loaded(){ return Object.keys(buffers); }, // отладка: какие сэмплы декодированы
    play(name, arg){
      if (!CFG.sound) return;
      ensure();
      if (!ctx || ctx.state !== 'running') return;
      try { fxMap[name](arg); } catch(e){}
    },
  };
})();
function vibrate(ms){ if (CFG.sound && navigator.vibrate){ try { navigator.vibrate(ms); } catch(e){} } }
