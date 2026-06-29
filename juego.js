// ========== SDK DE PUBLICIDAD GPT ==========
window.googletag = window.googletag || { cmd: [] };
var ADMOB_CONFIG = { banner: '/6499/example/banner', rewarded: '/6499/example/rewarded', interstitial: '/6499/example/interstitial' };
var bannerSlot, rewardedSlot, interstitialSlot;
googletag.cmd.push(function() {
    googletag.pubads().enableSingleRequest();
    googletag.enableServices();
    bannerSlot = googletag.defineSlot(ADMOB_CONFIG.banner, [[320, 50], [300, 50]], 'ad-banner').addService(googletag.pubads());
    rewardedSlot = googletag.defineOutOfPageSlot(ADMOB_CONFIG.rewarded).addService(googletag.pubads());
    interstitialSlot = googletag.defineOutOfPageSlot(ADMOB_CONFIG.interstitial).addService(googletag.pubads());
});

// ========== NUCLEO PROTEGIDO (GameEngine) ==========
var GameEngine = (function() {
    var tiles = [], slots = [], score = 0, combo = 1, selectedTileIdx = null;
    var MAX_SLOTS = 4, currentLevelConfig = null, difficulty = 'normal';
    var timerInterval = null, timeLeft = -1;
    var hintUses = 3, shuffleUses = 3, undoUses = 3, onStateChange = null;
    var audioCtx;

    function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
    function playTone(freq, duration, type, vol) {
        if (!audioCtx) return;
        var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + duration);
    }
    var sound = {
        select: function() { playTone(600, 0.1); },
        match: function() { playTone(523, 0.15); setTimeout(function() { playTone(659, 0.15); }, 100); },
        error: function() { playTone(200, 0.2, 'square'); },
        victory: function() { [523,659,784,1047].forEach(function(f,i) { setTimeout(function() { playTone(f, 0.3); }, i*150); }); },
        shuffle: function() { playTone(440, 0.2, 'triangle'); },
        hint: function() { playTone(660, 0.15); }
    };

    function isTileFree(tile, activeTiles) {
        var above = activeTiles.find(function(t) { return t.layer === tile.layer + 1 && Math.abs(t.col - tile.col) <= 1 && Math.abs(t.row - tile.row) <= 1; });
        if (above) return false;
        var left = activeTiles.find(function(t) { return t.layer === tile.layer && t.row === tile.row && t.col === tile.col - 1; });
        var right = activeTiles.find(function(t) { return t.layer === tile.layer && t.row === tile.row && t.col === tile.col + 1; });
        return !(left && right);
    }
    function updateBlocked() {
        var active = tiles.filter(function(t) { return !t.matched && !t.inSlot; });
        tiles.forEach(function(t) { if (t.matched || t.inSlot) { t.blocked = false; return; } t.blocked = !isTileFree(t, active); });
    }
    function shouldBeFaceDown(levelNum) {
        if (difficulty === 'facil') return false;
        if (difficulty === 'dificil') return levelNum >= 4 ? Math.random() < 0.6 : false;
        return levelNum >= 6 ? Math.random() < 0.5 : false;
    }
    function createTiles(zonePhotos, traditionalTilesList) {
        var attempts = 0;
        while (attempts < 10) {
            tiles = [];
            var totalPairs = Math.max(1, Math.floor(currentLevelConfig.pairs));
            var pairItems = [];
            var maxPhotos = (currentLevelConfig.num <= 3) ? Math.min(4, zonePhotos.length) : zonePhotos.length;
            var usedPhotos = zonePhotos.slice().sort(function() { return Math.random() - 0.5; }).slice(0, maxPhotos);
            for (var i = 0; i < Math.min(totalPairs, usedPhotos.length); i++) {
                pairItems.push({ name: usedPhotos[i].name, url: usedPhotos[i].url, zone: usedPhotos[i].zone, nota: usedPhotos[i].nota, type: 'photo' });
            }
            var tradIdx = 0;
            while (pairItems.length < totalPairs) {
                var trad = traditionalTilesList[tradIdx % traditionalTilesList.length];
                pairItems.push({ name: trad.name, symbol: trad.symbol, type: 'ceramic' });
                tradIdx++;
            }
            pairItems.forEach(function(item, pid) {
                var fd = shouldBeFaceDown(currentLevelConfig.num), bonus = difficulty === 'dificil' && Math.random() < 0.2;
                tiles.push({ name: item.name, url: item.url, zone: item.zone, nota: item.nota, symbol: item.symbol, type: item.type, pid: pid, matched: false, blocked: false, inSlot: false, col: 0, row: 0, layer: 0, faceDown: fd, revealed: !fd, bonus: bonus });
                tiles.push({ name: item.name, url: item.url, zone: item.zone, nota: item.nota, symbol: item.symbol, type: item.type, pid: pid, matched: false, blocked: false, inSlot: false, col: 0, row: 0, layer: 0, faceDown: fd, revealed: !fd, bonus: bonus });
            });
            var count = {}; tiles.forEach(function(t) { count[t.pid] = (count[t.pid] || 0) + 1; });
            var allPairsOk = Object.values(count).every(function(c) { return c === 2; });
            if (allPairsOk && tiles.length % 2 === 0) break;
            attempts++;
        }
        for (var i = tiles.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var temp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = temp; }
        var totalTiles = tiles.length, colsBase = 6, rowsBase = Math.ceil(totalTiles * 0.7 / colsBase);
        var tilesLayer0 = Math.min(totalTiles, colsBase * rowsBase), tilesLayer1 = totalTiles - tilesLayer0, colsLayer1 = 4, offsetCol = Math.floor((colsBase - colsLayer1) / 2);
        var idx = 0;
        for (var k = 0; k < tilesLayer0; k++) { tiles[idx].col = k % colsBase; tiles[idx].row = Math.floor(k / colsBase); tiles[idx].layer = 0; idx++; }
        for (var m = 0; m < tilesLayer1; m++) { tiles[idx].col = offsetCol + (m % colsLayer1); tiles[idx].row = Math.floor(m / colsLayer1); tiles[idx].layer = 1; idx++; }
        updateBlocked();
    }
    function checkForMatchInSlots() {
        if (slots.length < 2) return;
        for (var i = 0; i < slots.length; i++) {
            for (var j = i + 1; j < slots.length; j++) {
                if (slots[i].pid === slots[j].pid && slots[i].idx !== slots[j].idx) {
                    var a = slots[i], b = slots[j]; sound.match();
                    var idxA = a.idx, idxB = b.idx;
                    if (idxA > idxB) { tiles.splice(idxA, 1); tiles.splice(idxB, 1); }
                    else { tiles.splice(idxB, 1); tiles.splice(idxA, 1); }
                    var removed = [idxA, idxB].sort(function(x, y) { return x - y; });
                    slots.forEach(function(slot) { if (slot.idx > removed[0]) slot.idx--; if (slot.idx > removed[1]) slot.idx--; });
                    if (i > j) { slots.splice(i, 1); slots.splice(j, 1); }
                    else { slots.splice(j, 1); slots.splice(i, 1); }
                    selectedTileIdx = slots.length > 0 ? slots[slots.length - 1].idx : null;
                    var multiplier = (a.bonus && b.bonus) ? 2 : 1; score += (100 + combo * 50) * multiplier; combo++;
                    if (timeLeft > 0) { timeLeft += 3; if (timeLeft > 99) timeLeft = 99; }
                    updateBlocked();
                    if (onStateChange) onStateChange('match', { a: a, b: b });
                    if (tiles.filter(function(t) { return !t.matched && !t.inSlot; }).length === 0) {
                        if (timerInterval) clearInterval(timerInterval);
                        if (onStateChange) onStateChange('victory', { score: score, combo: combo });
                    }
                    return;
                }
            }
        }
        if (slots.length >= MAX_SLOTS) { sound.error(); if (onStateChange) onStateChange('slotsfull'); }
    }
    function startTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = setInterval(function() { timeLeft--; if (onStateChange) onStateChange('timer', { timeLeft: timeLeft }); if (timeLeft <= 0) { clearInterval(timerInterval); if (onStateChange) onStateChange('timeout'); } }, 1000); }

    return Object.freeze({
        init: function(config, zonePhotos, traditionalTilesList) {
            initAudio(); currentLevelConfig = config; difficulty = config.difficulty || 'normal';
            slots = []; score = 0; combo = 1; selectedTileIdx = null;
            if (timerInterval) clearInterval(timerInterval);
            timeLeft = (difficulty === 'dificil') ? config.pairs * 6 : -1;
            hintUses = config.hintUses || 3; shuffleUses = config.shuffleUses || 3; undoUses = config.undoUses || 3;
            createTiles(zonePhotos, traditionalTilesList);
            if (timeLeft > 0) startTimer();
        },
        getTiles: function() { return tiles; },
        getSlots: function() { return slots; },
        getScore: function() { return score; },
        getSelectedTileIdx: function() { return selectedTileIdx; },
        getTimeLeft: function() { return timeLeft; },
        getPowerUps: function() { return { hintUses: hintUses, shuffleUses: shuffleUses, undoUses: undoUses }; },
        addPowerUp: function(type, amount) { amount = amount || 1; if (type === 'hint') hintUses += amount; else if (type === 'shuffle') shuffleUses += amount; else if (type === 'undo') undoUses += amount; },
        onTileClick: function(index) {
            var t = tiles[index]; if (!t || t.matched || t.blocked || t.inSlot) return false;
            if (slots.length >= MAX_SLOTS) return false;
            if (t.faceDown && !t.revealed) t.revealed = true;
            sound.select(); t.inSlot = true;
            slots.push({ name: t.name, url: t.url, zone: t.zone, symbol: t.symbol, type: t.type, pid: t.pid, idx: index, bonus: t.bonus });
            selectedTileIdx = index; updateBlocked(); checkForMatchInSlots();
            if (onStateChange) onStateChange('boardChanged'); return true;
        },
        useShuffle: function() { if (shuffleUses <= 0) return false; shuffleUses--; sound.shuffle(); tiles.forEach(function(t) { t.col = Math.floor(Math.random() * 6); t.row = Math.floor(Math.random() * Math.ceil(tiles.length / 6)); }); slots = []; selectedTileIdx = null; updateBlocked(); if (onStateChange) onStateChange('boardChanged'); return true; },
        useHint: function() { if (hintUses <= 0) return false; hintUses--; sound.hint(); var f = tiles.filter(function(t) { return !t.matched && !t.inSlot; }); for (var i = 0; i < f.length; i++) { for (var j = i + 1; j < f.length; j++) { if (f[i].pid === f[j].pid) { if (onStateChange) onStateChange('hint', { name: f[i].name }); return true; } } } if (onStateChange) onStateChange('hint', { name: 'Mezcla' }); return true; },
        undoLastSelection: function() { if (slots.length === 0) return false; sound.select(); var last = slots.pop(); tiles[last.idx].inSlot = false; selectedTileIdx = slots.length > 0 ? slots[slots.length - 1].idx : null; updateBlocked(); if (onStateChange) onStateChange('boardChanged'); return true; },
        setOnStateChange: function(callback) { onStateChange = callback; },
        isGameOver: function() { return tiles.filter(function(t) { return !t.matched && !t.inSlot; }).length === 0; },
        stopTimer: function() { if (timerInterval) clearInterval(timerInterval); }
    });
})();
