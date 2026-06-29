// ========== INTERFAZ DE USUARIO (UI) ==========
var UI = (function() {
    var currentZone = null, currentLevel = null, coins = parseInt(localStorage.getItem('coins') || '0');
    var tutorialActive = false, tutorialStep = 0, tutorialZoneId = null;
    var rewardCallback = null, adCount = 0;
    var AD_EVERY = 5;
    var memoricePhotos = [], memoriceCards = [], memoriceFlipped = [], memoriceMatched = 0, memoriceLocked = false;

    function getStars(z, n) { return parseInt(localStorage.getItem('zone_' + z + '_level_' + n) || '0'); }
    function setStars(z, n, s) { localStorage.setItem('zone_' + z + '_level_' + n, s); }
    function isUnlocked(z, n) { return n === 1 || getStars(z, n - 1) >= 1; }
    function addCoins(amount) { coins += amount; localStorage.setItem('coins', coins); }
    function getTotalStarsForCountry(country) {
        return ZONES.filter(function(z) { return z.country === country; }).reduce(function(s, z) {
            return s + z.levels.reduce(function(ss, l) { return ss + getStars(z.id, l.num); }, 0);
        }, 0);
    }

    GameEngine.setOnStateChange(function(event, data) {
        if (event === 'boardChanged') renderBoard();
        else if (event === 'match') {
            if (data.a.url && data.b.url && data.a.zone === currentZone.id) {
                var photo = currentZone.photos.find(function(p) { return p.url === data.a.url; }) || data.a;
                showZoomAndNote(photo);
            }
            updateSlotsUI();
        }
        else if (event === 'slotsfull') showMessage('Sin coincidencias');
        else if (event === 'timer') { var el = document.getElementById('timerDisplay'); if (el) el.textContent = data.timeLeft + 's'; }
        else if (event === 'timeout') { showMessage('Tiempo agotado'); setTimeout(function() { showZone(currentZone.id); }, 1500); }
        else if (event === 'victory') {
            var stars = data.score >= 2000 ? 3 : data.score >= 1000 ? 2 : 1;
            setStars(currentZone.id, currentLevel.num, stars);
            addCoins(stars);
            document.getElementById('victoryIcon').textContent = '🏆';
            document.getElementById('victoryName').textContent = currentZone.name + ' Nivel ' + currentLevel.num;
            document.getElementById('starsDisplay').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
            document.getElementById('victoryModal').style.display = 'flex';
            spawnVictoryParticles();
            adCount++;
            if (adCount >= AD_EVERY) { adCount = 0; showInterstitialAd(); }
        }
        else if (event === 'hint') showMessage('Busca: ' + data.name);
    });

    function renderBoard() {
        var c = document.getElementById('boardContainer');
        if (!c) return;
        var tiles = GameEngine.getTiles();
        var vt = tiles.filter(function(t) { return !t.matched && !t.inSlot; });
        if (vt.length === 0) { c.innerHTML = ''; return; }
        var w = c.clientWidth - 16, margin = 10, COLS = 6, cw = (w - margin * 2) / COLS, ch = cw * 1.45;
        var maxRow = vt.length > 0 ? Math.max.apply(null, vt.map(function(t) { return t.row; })) : 0;
        var maxLayer = vt.length > 0 ? Math.max.apply(null, vt.map(function(t) { return t.layer; })) : 0;
        var nh = Math.max((maxRow + 1) * ch + margin * 2 + (maxLayer * 15) + 20, 300);
        c.style.minHeight = nh + 'px'; c.innerHTML = '';
        var inner = document.createElement('div');
        inner.style.cssText = 'position:relative;width:100%;display:flex;align-items:center;justify-content:center;height:' + nh + 'px;';
        var grid = document.createElement('div');
        grid.style.cssText = 'position:relative;width:' + (COLS * cw) + 'px;height:' + ((maxRow + 1) * ch + maxLayer * 15) + 'px;';
        vt.forEach(function(t) {
            var el = document.createElement('div'); el.className = 'vita-tile';
            if (t.bonus) el.classList.add('bonus-tile');
            el.style.left = (t.col * cw + margin) + 'px';
            el.style.top = (t.row * ch + margin + t.layer * 12) + 'px';
            el.style.width = (cw - 4) + 'px'; el.style.height = (ch - 4) + 'px';
            el.style.zIndex = t.layer * 100 + Math.floor(t.row * 2);
            var td = tiles.indexOf(t), isSel = (GameEngine.getSelectedTileIdx() === td);
            if (t.faceDown && !t.revealed) {
                el.style.background = 'linear-gradient(145deg, #1a3a2a, #0d2518)';
                el.innerHTML = '<div style="font-size:2em;color:rgba(242,202,80,0.4);">🪭</div>';
            } else if (t.type === 'photo') {
                el.style.backgroundImage = 'url(' + t.url + ')';
                el.style.backgroundSize = 'cover';
            } else {
                el.style.background = 'linear-gradient(145deg, #faf5eb, #b8a880)';
                el.style.fontSize = '1.6em'; el.style.color = '#2a1a0a';
                el.textContent = t.symbol;
            }
            var nm = document.createElement('div'); nm.className = 'card-name';
            nm.textContent = t.name || t.symbol; el.appendChild(nm);
            if (t.blocked) el.classList.add('blocked'); else el.classList.add('free');
            if (isSel) el.classList.add('selected-card');
            el.onclick = function() { GameEngine.onTileClick(td); if (tutorialActive) advanceTutorial(); };
            grid.appendChild(el);
        });
        inner.appendChild(grid); c.appendChild(inner);
        updateSlotsUI();
        document.getElementById('pairsLeft').textContent = (vt.length / 2) + ' pares';
    }

    function updateSlotsUI() {
        var slots = GameEngine.getSlots();
        for (var i = 0; i < 4; i++) {
            var el = document.getElementById('slot-' + i); if (!el) continue;
            el.innerHTML = ''; el.style.backgroundImage = '';
            if (i < slots.length) {
                var t = slots[i];
                el.className = 'w-14 h-20 rounded-lg border-2 border-primary flex items-center justify-center text-xl font-bold slot-item overflow-hidden';
                if (t.url) { el.style.backgroundImage = 'url(' + t.url + ')'; el.style.backgroundSize = 'cover'; }
                else { el.style.background = 'linear-gradient(145deg, #f5f0e8, #d4c4a8)'; el.textContent = t.symbol; el.style.color = '#2a1a0a'; }
            } else { el.className = 'w-14 h-20 rounded-lg slot-empty'; el.textContent = '+'; }
        }
    }

    function showMessage(msg) { var el = document.getElementById('message'); if (el) { el.textContent = msg; el.style.opacity = '1'; setTimeout(function() { el.style.opacity = '0'; }, 1500); } }

    function showZoomAndNote(photo) {
        var overlay = document.createElement('div'); overlay.className = 'zoom-overlay';
        overlay.innerHTML = '<img src="' + photo.url + '" class="zoom-image" alt="' + photo.name + '" onerror="this.style.display=\'none\'"><div class="zoom-note"><h3 style="color:#f2ca50;font-size:1.2em;font-weight:bold;margin-bottom:8px;">' + photo.name + '</h3><p style="color:white;">' + (photo.nota || 'Un rincon magico.') + '</p></div><button onclick="this.parentElement.remove()" style="margin-top:16px;padding:8px 24px;border-radius:12px;background:rgba(255,255,255,0.1);color:white;">Cerrar</button>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    }

    function spawnVictoryParticles() {
        var colors = ['#f2ca50','#ffd700','#ff9f43','#4ade80','#c084fc'];
        for (var i = 0; i < 30; i++) {
            (function(idx) {
                setTimeout(function() {
                    var p = document.createElement('div'); p.className = 'particle';
                    p.textContent = ['🏆','⭐','✨','🎉'][Math.floor(Math.random()*4)];
                    p.style.left = (20 + Math.random()*60) + '%'; p.style.top = (30 + Math.random()*30) + '%';
                    p.style.setProperty('--tx', ((Math.random()-0.5)*200) + 'px');
                    p.style.setProperty('--ty', ((Math.random()-0.5)*200-50) + 'px');
                    p.style.color = colors[Math.floor(Math.random()*colors.length)];
                    p.style.position = 'fixed'; p.style.zIndex = '300';
                    document.body.appendChild(p);
                    setTimeout(function() { p.remove(); }, 1000);
                }, idx * 30);
            })(i);
        }
    }

    function showZone(zid) {
        currentZone = ZONES.find(function(z) { return z.id === zid; });
        var totalStars = currentZone.levels.reduce(function(s, l) { return s + getStars(zid, l.num); }, 0);
        var maxStars = currentZone.levels.length * 3;
        var backFn = currentZone.country === 'argentina' ? 'UI.showArgentineZones()' : currentZone.country === 'mexico' ? 'UI.showMexicanZones()' : 'UI.showChileZones()';
        var html = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;padding:16px;overflow-y:auto;padding-bottom:70px;">';
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">';
        html += '<button onclick="' + backFn + '" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">←</button>';
        html += '<span style="font-size:1.2em;font-weight:bold;color:#f2ca50;">' + currentZone.icon + ' ' + currentZone.name + '</span>';
        html += '<span style="margin-left:auto;font-size:0.9em;color:rgba(242,202,80,0.8);">⭐' + totalStars + '/' + maxStars + '</span></div><div>';
        currentZone.levels.forEach(function(l) {
            var u = isUnlocked(zid, l.num), s = getStars(zid, l.num);
            var miniKey = zid + '-' + l.num, mini = MINIGAMES[miniKey];
            html += '<div style="padding:16px;border-radius:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;';
            if (mini) {
                html += 'background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);">';
                html += '<div><span style="color:white;font-weight:bold;">' + mini.icon + ' ' + mini.name + '</span><p style="font-size:0.75em;color:rgba(168,85,247,0.8);">Minijuego especial</p></div>';
                html += '<button onclick="event.stopPropagation();UI.showRewardedVideo(function(){UI.startMemoriceMinigame(\'' + zid + '\',' + l.num + ');})" class="btn-video" style="padding:8px 16px;border-radius:12px;font-size:0.85em;">🎮 Jugar</button>';
            } else if (u) {
                html += 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);" onclick="UI.selectLevel(' + l.num + ')">';
                html += '<div><span style="color:white;font-weight:bold;">Nivel ' + l.num + '</span><p style="font-size:0.75em;color:rgba(255,255,255,0.5);">' + l.pairs + ' pares</p></div>';
                html += '<div style="color:#f2ca50;">' + (s > 0 ? '⭐'.repeat(s) + '☆'.repeat(3 - s) : '🔓') + '</div>';
            } else {
                html += 'opacity:0.4;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);">';
                html += '<div><span style="color:white;font-weight:bold;">Nivel ' + l.num + '</span><p style="font-size:0.75em;color:rgba(255,255,255,0.5);">' + l.pairs + ' pares</p></div>';
                html += '<div style="color:#f2ca50;">🔒</div>';
            }
            html += '</div>';
        });
        html += '</div></div>';
        document.getElementById('appRoot').innerHTML = html;
    }

    function selectLevel(n) {
        if (shouldStartTutorial() && n === 1 && currentZone.id === 'norte') { startTutorial(currentZone.id); return; }
        var originalLevel = currentZone.levels.find(function(l) { return l.num === n; });
        currentLevel = { num: originalLevel.num, pairs: originalLevel.pairs, zoneId: currentZone.id };
        document.getElementById('appRoot').innerHTML = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b1512;text-align:center;padding:32px;">' +
            '<div style="font-size:3em;margin-bottom:16px;">' + currentZone.icon + '</div>' +
            '<h2 style="color:#f2ca50;font-size:1.5em;font-weight:bold;margin-bottom:8px;">Nivel ' + currentLevel.num + '</h2>' +
            '<p style="color:rgba(255,255,255,0.5);margin-bottom:16px;">' + currentLevel.pairs + ' pares base</p>' +
            '<div style="display:flex;gap:12px;margin-bottom:16px;justify-content:center;">' +
            '<button onclick="UI.startGameWithDifficulty(\'facil\')" style="padding:8px 16px;border-radius:12px;background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.4);color:rgb(74,222,128);font-weight:bold;">🌱 Facil</button>' +
            '<button onclick="UI.startGameWithDifficulty(\'normal\')" style="padding:8px 16px;border-radius:12px;background:rgba(242,202,80,0.2);border:1px solid rgba(242,202,80,0.4);color:#f2ca50;font-weight:bold;">⚡ Normal</button>' +
            '<button onclick="UI.startGameWithDifficulty(\'dificil\')" style="padding:8px 16px;border-radius:12px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:rgb(239,68,68);font-weight:bold;">🔥 Dificil</button>' +
            '</div><button onclick="UI.showZone(\'' + currentZone.id + '\')" style="color:rgba(255,255,255,0.5);background:none;border:none;font-size:0.9em;cursor:pointer;">← Volver</button></div>';
    }

    function startGameWithDifficulty(difficulty) {
        var pairs = currentLevel.pairs, hintUses = 3, shuffleUses = 3, undoUses = 3;
        if (difficulty === 'facil') { pairs = Math.max(4, pairs - 2); hintUses = 5; shuffleUses = 5; undoUses = 5; }
        else if (difficulty === 'dificil') { pairs = pairs + 2; hintUses = 1; shuffleUses = 1; undoUses = 1; }
        tutorialActive = false;
        startGame({ num: currentLevel.num, pairs: pairs, zoneId: currentLevel.zoneId, difficulty: difficulty, hintUses: hintUses, shuffleUses: shuffleUses, undoUses: undoUses });
    }

    function startGame(config) {
        GameEngine.init(config, currentZone.photos, traditionalTiles);
        var timeLeft = GameEngine.getTimeLeft(), pu = GameEngine.getPowerUps();
        var html = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;padding:12px;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
        html += '<button onclick="UI.goBackFromGame()" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">←</button>';
        html += '<span style="color:#f2ca50;font-weight:bold;" id="pairsLeft">' + config.pairs + ' pares</span>';
        if (timeLeft > 0) html += '<span style="color:white;font-weight:bold;" id="timerDisplay">' + timeLeft + 's</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:4px;margin-bottom:8px;justify-content:center;" id="slotsContainer">';
        for (var i = 0; i < 4; i++) html += '<div class="slot-empty" id="slot-' + i + '" style="width:56px;height:80px;">+</div>';
        html += '</div>';
        html += '<div style="flex:1;background:rgba(0,0,0,0.2);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;min-height:300px;" id="boardContainer"></div>';
        if (!tutorialActive) {
            html += '<div style="display:flex;justify-content:center;gap:16px;margin-top:12px;">';
            html += '<button onclick="UI.useHint()" class="power-up-btn">💡<span class="power-up-badge" id="hintBadge">' + pu.hintUses + '</span></button>';
            html += '<button onclick="UI.useShuffle()" class="power-up-btn">🔀<span class="power-up-badge" id="shuffleBadge">' + pu.shuffleUses + '</span></button>';
            html += '<button onclick="UI.undoLastSelection()" class="power-up-btn">↩️<span class="power-up-badge" id="undoBadge">' + pu.undoUses + '</span></button>';
            html += '</div>';
        }
        html += '<div style="text-align:center;margin-top:8px;height:16px;"><span id="message" style="font-size:0.75em;color:rgba(242,202,80,0.8);"></span></div></div>';
        document.getElementById('appRoot').innerHTML = html;
        renderBoard();
        if (tutorialActive) showTutorialOverlay();
    }

    function goBackFromGame() { GameEngine.stopTimer(); showZone(currentZone.id); }
    function useShuffle() { GameEngine.useShuffle(); updatePowerBadges(); }
    function useHint() { GameEngine.useHint(); updatePowerBadges(); }
    function undoLastSelection() { GameEngine.undoLastSelection(); updatePowerBadges(); }
    function updatePowerBadges() { var pu = GameEngine.getPowerUps(); document.getElementById('hintBadge').textContent = pu.hintUses; document.getElementById('shuffleBadge').textContent = pu.shuffleUses; document.getElementById('undoBadge').textContent = pu.undoUses; }

    function shouldStartTutorial() { return localStorage.getItem('tutorialCompleted') !== '1'; }
    function startTutorial(zoneId) {
        tutorialActive = true; tutorialStep = 0; tutorialZoneId = zoneId;
        var zone = ZONES.find(function(z) { return z.id === zoneId; });
        currentZone = zone;
        currentLevel = { num: 1, pairs: 4, zoneId: zoneId };
        startGame({ num: 1, pairs: 4, zoneId: zoneId, difficulty: 'facil', hintUses: 99, shuffleUses: 99, undoUses: 99 });
    }
    function showTutorialOverlay() {
        var board = document.getElementById('boardContainer'); if (!board) return;
        var prev = document.querySelector('.tutorial-overlay'); if (prev) prev.remove();
        var overlay = document.createElement('div'); overlay.className = 'tutorial-overlay';
        var msg = document.createElement('div'); msg.className = 'tutorial-message';
        msg.innerHTML = '<p style="font-size:0.9em;">Bienvenido!<br><br>Toca una ficha y luego su pareja identica para eliminarlas.</p><button onclick="UI.skipTutorial()" style="margin-top:12px;padding:8px 16px;background:rgba(242,202,80,0.2);color:#f2ca50;border:none;border-radius:8px;font-weight:bold;">Entendido</button>';
        overlay.appendChild(msg); board.appendChild(overlay);
    }
    function advanceTutorial() { if (!tutorialActive) return; if (tutorialStep < 5) { tutorialStep++; } else { completeTutorial(); } }
    function skipTutorial() { completeTutorial(); }
    function completeTutorial() { tutorialActive = false; localStorage.setItem('tutorialCompleted', '1'); showZone(tutorialZoneId || 'norte'); showMessage('Tutorial completado!'); }

    function showRewardedVideo(cb, msg) { rewardCallback = cb; document.getElementById('rewardText').textContent = msg || 'Mira el video'; document.getElementById('rewardModal').style.display = 'flex'; }
    function closeRewardModal() { document.getElementById('rewardModal').style.display = 'none'; }
    function simulateRewardedVideo() { setTimeout(function() { document.getElementById('rewardModal').style.display = 'none'; if (rewardCallback) rewardCallback(); }, 2000); }
    function showInterstitialAd() { googletag.cmd.push(function() { googletag.display(interstitialSlot); }); }
    function closeVictory() { document.getElementById('victoryModal').style.display = 'none'; showZone(currentZone.id); }

    function startMemoriceMinigame(zoneId, levelNum) {
        var mini = MINIGAMES[zoneId + '-' + levelNum]; if (!mini || !mini.photos) return;
        var shuffled = mini.photos.slice().sort(function() { return Math.random() - 0.5; });
        memoricePhotos = shuffled.slice(0, 6);
        memoriceCards = [];
        memoricePhotos.forEach(function(photo, idx) {
            memoriceCards.push({ url: photo.url, name: photo.name, pairId: idx, matched: false });
            memoriceCards.push({ url: photo.url, name: photo.name, pairId: idx, matched: false });
        });
        for (var i = memoriceCards.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var temp = memoriceCards[i]; memoriceCards[i] = memoriceCards[j]; memoriceCards[j] = temp; }
        memoriceFlipped = []; memoriceMatched = 0; memoriceLocked = false;
        if (!document.getElementById('memoriceModal')) {
            var modal = document.createElement('div'); modal.id = 'memoriceModal'; modal.className = 'memorice-modal';
            modal.innerHTML = '<div style="max-width:340px;width:100%;background:linear-gradient(145deg,rgba(23,34,30,0.95),rgba(11,21,18,0.95));border-radius:16px;border:1px solid rgba(242,202,80,0.3);padding:16px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
                '<span style="color:#f2ca50;font-weight:bold;font-size:1.1em;" id="memoriceTitle">Memorice</span>' +
                '<button onclick="UI.closeMemorice()" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">✕</button></div>' +
                '<div class="memorice-board" id="memoriceBoard"></div></div>';
            document.body.appendChild(modal);
        }
        document.getElementById('memoriceModal').style.display = 'flex';
        document.getElementById('memoriceTitle').textContent = mini.icon + ' ' + mini.name;
        renderMemoriceBoard();
    }

    function renderMemoriceBoard() {
        var board = document.getElementById('memoriceBoard'); if (!board) return; board.innerHTML = '';
        memoriceCards.forEach(function(card, index) {
            var el = document.createElement('div'); el.className = 'memorice-card';
            if (memoriceFlipped.indexOf(index) !== -1 || card.matched) {
                el.classList.add('flipped');
                el.innerHTML = '<img src="' + card.url + '" alt="' + card.name + '" onerror="this.style.display=\'none\'">';
            } else { el.innerHTML = '<span class="card-back">🪭</span>'; }
            if (card.matched) el.classList.add('matched');
            el.onclick = function() { flipMemoriceCard(index); };
            board.appendChild(el);
        });
    }

    function flipMemoriceCard(index) {
        if (memoriceLocked || memoriceFlipped.indexOf(index) !== -1 || memoriceCards[index].matched) return;
        memoriceFlipped.push(index); renderMemoriceBoard();
        if (memoriceFlipped.length === 2) {
            memoriceLocked = true;
            var a = memoriceFlipped[0], b = memoriceFlipped[1];
            if (memoriceCards[a].pairId === memoriceCards[b].pairId) {
                memoriceCards[a].matched = true; memoriceCards[b].matched = true;
                memoriceMatched++; memoriceFlipped = []; memoriceLocked = false;
                renderMemoriceBoard();
                if (memoriceMatched === 6) {
                    setTimeout(function() { addCoins(10); document.getElementById('memoriceModal').style.display = 'none'; showMessage('Memorice completado! +10 monedas'); }, 500);
                }
            } else { setTimeout(function() { memoriceFlipped = []; memoriceLocked = false; renderMemoriceBoard(); }, 800); }
        }
    }

    function closeMemorice() { document.getElementById('memoriceModal').style.display = 'none'; }

    function showWorldMain() {
        var ts = ZONES.reduce(function(s, z) { return s + z.levels.reduce(function(ss, l) { return ss + getStars(z.id, l.num); }, 0); }, 0);
        var cpChile = Math.round((getTotalStarsForCountry('chile') / 120) * 100);
        var cpArgentina = Math.round((getTotalStarsForCountry('argentina') / 120) * 100);
        var cpMexico = Math.round((getTotalStarsForCountry('mexico') / 120) * 100);
        var html = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;overflow-y:auto;padding-bottom:70px;">';
        html += '<div style="height:192px;overflow:hidden;position:relative;background:linear-gradient(to bottom, transparent, #0b1512), url(https://drive.google.com/thumbnail?id=1hsx1UaDia9i7oOLdeslGtGLwl0tqUP71&sz=w800) center/cover;">';
        html += '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">';
        html += '<span style="font-size:3em;">🌎</span>';
        html += '<h1 class="text-glow" style="font-size:1.5em;font-weight:bold;color:#f2ca50;">WORLD TOUR</h1>';
        html += '<div style="background:rgba(242,202,80,0.1);padding:4px 12px;border-radius:16px;margin-top:8px;"><span style="color:#f2ca50;font-size:0.9em;font-weight:bold;">⭐ ' + ts + ' estrellas</span></div>';
        html += '</div></div><div style="padding:16px;">';
        html += countryCard('🇨🇱','Chile',cpChile,'UI.showChileZones()');
        html += countryCard('🇦🇷','Argentina',cpArgentina,'UI.showArgentineZones()');
        html += countryCard('🇲🇽','Mexico',cpMexico,'UI.showMexicanZones()');
        html += '<div style="border-radius:16px;overflow:hidden;border:1px dashed rgba(255,255,255,0.2);opacity:0.6;background:rgba(255,255,255,0.02);margin-bottom:12px;"><div style="padding:16px;display:flex;align-items:center;gap:16px;"><span style="font-size:2.5em;filter:grayscale(1);">🇧🇷</span><div style="flex:1;"><h3 style="color:rgba(255,255,255,0.7);font-weight:bold;font-size:1.1em;">Brasil</h3><p style="font-size:0.75em;color:rgba(242,202,80,0.5);">8 regiones - 80 niveles</p><p style="font-size:0.75em;color:rgba(255,255,255,0.4);">Proximamente</p></div><span style="color:rgba(255,255,255,0.2);font-size:1.5em;">🔜</span></div></div>';
        html += '<button onclick="UI.showAlbum()" style="width:100%;padding:12px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:white;font-weight:bold;margin-bottom:8px;">📸 ALBUM DE VIAJES</button>';
        html += '<button onclick="UI.showTienda()" style="width:100%;padding:12px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:white;font-weight:bold;">🛒 TIENDA</button>';
        html += '</div></div>';
        document.getElementById('appRoot').innerHTML = html;
    }

    function countryCard(flag, name, progress, onclick) {
        return '<div onclick="' + onclick + '" style="border-radius:16px;overflow:hidden;border:2px solid rgba(242,202,80,0.3);background:linear-gradient(135deg, rgba(242,202,80,0.1), rgba(11,21,18,0.9));margin-bottom:12px;cursor:pointer;">' +
            '<div style="padding:16px;display:flex;align-items:center;gap:16px;"><span style="font-size:2.5em;">' + flag + '</span><div style="flex:1;"><h3 style="color:white;font-weight:bold;font-size:1.1em;">' + name + '</h3><p style="font-size:0.75em;color:rgba(242,202,80,0.7);">4 regiones - 40 niveles</p><div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:8px;overflow:hidden;"><div style="height:100%;background:linear-gradient(to right, #f2ca50, #ff9f43);border-radius:2px;width:' + progress + '%;"></div></div><p style="font-size:0.75em;color:rgba(255,255,255,0.5);margin-top:4px;">' + progress + '% completado</p></div><span style="color:rgba(255,255,255,0.3);font-size:1.5em;">→</span></div></div>';
    }

    function showChileZones() { showCountryZones('chile','🇨🇱 CHILE'); }
    function showArgentineZones() { showCountryZones('argentina','🇦🇷 ARGENTINA'); }
    function showMexicanZones() { showCountryZones('mexico','🇲🇽 MEXICO'); }

    function showCountryZones(country, title) {
        var zones = ZONES.filter(function(z) { return z.country === country; });
        var html = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;padding:16px;overflow-y:auto;padding-bottom:70px;">';
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;"><button onclick="UI.showWorldMain()" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">←</button><span style="font-size:1.2em;font-weight:bold;color:#f2ca50;">' + title + '</span></div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
        zones.forEach(function(z) {
            html += '<div onclick="UI.showZone(\'' + z.id + '\')" style="height:128px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.05);background:linear-gradient(135deg, rgba(255,255,255,0.05), transparent);display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;">';
            html += '<span style="font-size:2em;">' + z.icon + '</span><span style="color:white;font-weight:bold;font-size:0.9em;">' + z.name + '</span></div>';
        });
        html += '</div></div>';
        document.getElementById('appRoot').innerHTML = html;
    }

    function showAlbum() {
        var html = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;padding:16px;overflow-y:auto;padding-bottom:70px;">';
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;"><button onclick="UI.showWorldMain()" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">←</button><span style="font-size:1.2em;font-weight:bold;color:#f2ca50;">🌎 Album de Viajes</span></div>';
        var countries = [
            { flag:'🇨🇱', name:'Chile', zones:['norte','centro','sur','austral'] },
            { flag:'🇦🇷', name:'Argentina', zones:['argentina-norte','argentina-centro','argentina-patagonia','argentina-litoral'] },
            { flag:'🇲🇽', name:'Mexico', zones:['mexico-norte','mexico-centro','mexico-sur','mexico-caribe'] }
        ];
        countries.forEach(function(country) {
            html += '<div style="margin-bottom:16px;"><h3 style="color:white;font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + country.flag + ' ' + country.name + '</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
            country.zones.forEach(function(zid) {
                var zone = ZONES.find(function(z) { return z.id === zid; });
                if (!zone) return;
                zone.photos.forEach(function(photo, idx) {
                    var stars = getStars(zid, idx + 1), unlocked = stars >= 1;
                    html += '<div style="aspect-ratio:1;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;">';
                    if (unlocked) html += '<img src="' + photo.url + '" style="width:100%;height:100%;object-fit:cover;" title="' + photo.name + '" onerror="this.style.display=\'none\'">';
                    else html += '<span style="color:rgba(255,255,255,0.3);font-size:1.5em;">?</span>';
                    html += '</div>';
                });
            });
            html += '</div></div>';
        });
        html += '</div>';
        document.getElementById('appRoot').innerHTML = html;
    }

    function showTienda() {
        document.getElementById('appRoot').innerHTML = '<div style="height:100%;display:flex;flex-direction:column;background:#0b1512;padding:16px;overflow-y:auto;padding-bottom:70px;">' +
            '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;"><button onclick="UI.showWorldMain()" style="color:white;background:none;border:none;font-size:1.5em;cursor:pointer;">←</button><span style="font-size:1.2em;font-weight:bold;color:#f2ca50;">🛒 Tienda</span><span style="margin-left:auto;font-size:0.9em;color:rgba(242,202,80,0.8);">💰 ' + coins + ' monedas</span></div>' +
            '<p style="font-size:0.75em;color:rgba(255,255,255,0.5);margin-bottom:16px;">Compra power-ups para ayudarte.</p>' +
            '<div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><span style="color:white;font-weight:bold;">💡 Pista extra</span></div><button onclick="UI.comprarPowerUp(\'hint\')" style="padding:8px 16px;border-radius:8px;background:rgba(242,202,80,0.2);color:#f2ca50;font-weight:bold;border:none;cursor:pointer;">10 🪙</button></div>' +
            '<div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><span style="color:white;font-weight:bold;">🔀 Mezclar extra</span></div><button onclick="UI.comprarPowerUp(\'shuffle\')" style="padding:8px 16px;border-radius:8px;background:rgba(242,202,80,0.2);color:#f2ca50;font-weight:bold;border:none;cursor:pointer;">10 🪙</button></div>' +
            '<div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;"><div><span style="color:white;font-weight:bold;">↩️ Deshacer extra</span></div><button onclick="UI.comprarPowerUp(\'undo\')" style="padding:8px 16px;border-radius:8px;background:rgba(242,202,80,0.2);color:#f2ca50;font-weight:bold;border:none;cursor:pointer;">10 🪙</button></div></div>';
    }

    function comprarPowerUp(tipo) { if (coins < 10) { showMessage('Monedas insuficientes'); return; } coins -= 10; localStorage.setItem('coins', coins); GameEngine.addPowerUp(tipo, 1); showTienda(); }

    function showSplash() {
        document.getElementById('appRoot').innerHTML = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:black;text-align:center;">' +
            '<span style="font-size:0.9em;color:rgba(242,202,80,0.8);letter-spacing:0.3em;margin-bottom:16px;">Outfit</span>' +
            '<h1 class="text-glow" style="font-size:2.5em;font-weight:bold;color:#f2ca50;line-height:1.2;">Descubre<br/>America</h1>' +
            '<div style="height:48px;width:1px;background:linear-gradient(to bottom, rgba(242,202,80,0.6), transparent);margin:16px auto;"></div>' +
            '<p style="font-size:0.9em;color:rgba(255,255,255,0.5);letter-spacing:0.3em;">World Tour</p>' +
            '<p style="font-size:0.75em;color:rgba(242,202,80,0.6);margin-top:32px;">Viaje Meditativo</p></div>';
        setTimeout(showWorldMain, 4000);
    }

    return Object.freeze({
        showSplash: showSplash, showWorldMain: showWorldMain, showChileZones: showChileZones,
        showArgentineZones: showArgentineZones, showMexicanZones: showMexicanZones,
        showZone: showZone, selectLevel: selectLevel, startGameWithDifficulty: startGameWithDifficulty,
        goBackFromGame: goBackFromGame, useShuffle: useShuffle, useHint: useHint, undoLastSelection: undoLastSelection,
        showTienda: showTienda, showAlbum: showAlbum,
        showRewardedVideo: showRewardedVideo, closeRewardModal: closeRewardModal,
        simulateRewardedVideo: simulateRewardedVideo, closeVictory: closeVictory,
        startMemoriceMinigame: startMemoriceMinigame, closeMemorice: closeMemorice,
        skipTutorial: skipTutorial
    });
})();

UI.showSplash();
