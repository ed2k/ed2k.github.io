/**
 * BEN Browser Client Application Controller.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const elDealerVuln = document.getElementById('info-dealer-vuln');
    const elContract = document.getElementById('info-contract');
    const elTricks = document.getElementById('info-tricks');
    const elStatus = document.getElementById('info-status');

    const elBiddingModal = document.getElementById('bidding-modal');

    const seats = ['N', 'E', 'S', 'W'];
    let models = null;
    let ddsSolver = null;

    let state = {
        dealer: 'N',
        vuln: [false, false], // [NS, EW]
        hands52: { N: [], E: [], S: [], W: [] },
        auction: [],
        contract: null,
        tricksWon: { NS: 0, EW: 0 },
        currentTrick: [],
        currentLeader: 0, // 0=N, 1=E, 2=S, 3=W
        turnIndex: 0,
        stage: 'init',
        autoPlay: false
    };

    // Initialize TensorFlow.js and WASM DDS
    try {
        elStatus.textContent = "Loading BEN Neural Models...";
        models = await BENTFModels.loadModels();

        elStatus.textContent = "Initializing WebAssembly DDS...";
        if (typeof DDS !== 'undefined') {
            ddsSolver = await DDS.init();
        }

        elStatus.textContent = "Engine Ready!";
        elStatus.classList.remove('status-active');
        initGame();
    } catch (e) {
        console.error("Initialization error:", e);
        elStatus.textContent = "Loaded with fallback engines";
        initGame();
    }

    function initGame() {
        setupEventListeners();
        startNewDeal();
    }

    let selectedLevel = 1;

    function setupEventListeners() {
        document.getElementById('btn-new-deal').addEventListener('click', startNewDeal);
        document.getElementById('btn-restart').addEventListener('click', restartHand);
        document.getElementById('btn-auto-play').addEventListener('click', toggleAutoPlay);

        // Special bid buttons (PASS, X, XX)
        document.querySelectorAll('.bid-btn.special').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bid = e.currentTarget.dataset.bid;
                handleHumanBid(bid);
            });
        });

        // Level selector buttons (1 - 7)
        document.querySelectorAll('.level-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const level = parseInt(e.currentTarget.dataset.level, 10);
                selectedLevel = level;
                updateBiddingBoxUI();
            });
        });

        // Suit selector buttons (C, D, H, S, N)
        document.querySelectorAll('.suit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const strain = e.currentTarget.dataset.strain;
                const combinedBid = `${selectedLevel}${strain}`;
                handleHumanBid(combinedBid);
            });
        });

        setupDraggableBiddingBox();
    }

    function updateBiddingBoxUI() {
        const strains = ['C', 'D', 'H', 'S', 'N'];
        const levels = [1, 2, 3, 4, 5, 6, 7];

        let firstLegalLevel = null;
        levels.forEach(level => {
            const btn = document.querySelector(`.level-btn[data-level="${level}"]`);
            if (!btn) return;
            const hasLegalBid = strains.some(s => BENBidding.canBid(`${level}${s}`, state.auction));
            btn.disabled = !hasLegalBid;
            if (hasLegalBid && firstLegalLevel === null) {
                firstLegalLevel = level;
            }
        });

        const currentLevelBtn = document.querySelector(`.level-btn[data-level="${selectedLevel}"]`);
        if (!currentLevelBtn || currentLevelBtn.disabled) {
            selectedLevel = firstLegalLevel || 1;
        }

        levels.forEach(level => {
            const btn = document.querySelector(`.level-btn[data-level="${level}"]`);
            if (btn) {
                btn.classList.toggle('selected', level === selectedLevel);
            }
        });

        strains.forEach(strain => {
            const btn = document.querySelector(`.suit-btn[data-strain="${strain}"]`);
            if (!btn) return;
            const bid = `${selectedLevel}${strain}`;
            btn.disabled = !BENBidding.canBid(bid, state.auction);
        });

        const btnX = document.getElementById('btn-bid-x');
        if (btnX) btnX.disabled = !BENBidding.canDouble(state.auction);
        const btnXX = document.getElementById('btn-bid-xx');
        if (btnXX) btnXX.disabled = !BENBidding.canRedouble(state.auction);
    }

    function setupDraggableBiddingBox() {
        const box = document.getElementById('bidding-box');
        const header = document.getElementById('bidding-header');
        if (!box || !header) return;

        let activePointerId = null;
        let startX = 0;
        let startY = 0;

        const startDrag = (e) => {
            if (window.innerWidth <= 600) return;
            if (activePointerId !== null || !e.isPrimary) return;

            const rect = box.getBoundingClientRect();
            activePointerId = e.pointerId;
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.transform = 'none';
            header.setPointerCapture(e.pointerId);
        };

        const doDrag = (e) => {
            if (e.pointerId !== activePointerId) return;

            const maxLeft = Math.max(8, window.innerWidth - box.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - box.offsetHeight - 8);
            const left = Math.min(maxLeft, Math.max(8, e.clientX - startX));
            const top = Math.min(maxTop, Math.max(8, e.clientY - startY));

            box.style.left = `${left}px`;
            box.style.top = `${top}px`;
        };

        const stopDrag = (e) => {
            if (e.pointerId !== activePointerId) return;
            if (header.hasPointerCapture(e.pointerId)) {
                header.releasePointerCapture(e.pointerId);
            }
            activePointerId = null;
        };

        header.addEventListener('pointerdown', startDrag);
        header.addEventListener('pointermove', doDrag);
        header.addEventListener('pointerup', stopDrag);
        header.addEventListener('pointercancel', stopDrag);
    }

    function startNewDeal() {
        const dealStr = BENDeck52.randomDeal();
        const handsStr = dealStr.split(' ');

        state.hands52 = {
            N: parseHandStr(handsStr[0]),
            E: parseHandStr(handsStr[1]),
            S: parseHandStr(handsStr[2]),
            W: parseHandStr(handsStr[3])
        };

        state.initialHands52 = {
            N: new Int32Array(state.hands52.N),
            E: new Int32Array(state.hands52.E),
            S: new Int32Array(state.hands52.S),
            W: new Int32Array(state.hands52.W)
        };

        const dealers = ['N', 'E', 'S', 'W'];
        state.dealer = dealers[Math.floor(Math.random() * 4)];
        state.vuln = [Math.random() > 0.5, Math.random() > 0.5];
        state.auction = [];
        state.contract = null;
        state.tricksWon = { NS: 0, EW: 0 };
        state.currentTrick = [];
        state.turnIndex = seats.indexOf(state.dealer);
        state.currentLeader = state.turnIndex;
        state.stage = 'bidding';

        updateUI();
        processTurn();
    }

    function restartHand() {
        if (state.initialHands52) {
            seats.forEach(s => {
                state.hands52[s] = new Int32Array(state.initialHands52[s]);
            });
        }
        state.auction = [];
        state.contract = null;
        state.tricksWon = { NS: 0, EW: 0 };
        state.currentTrick = [];
        state.turnIndex = seats.indexOf(state.dealer);
        state.currentLeader = state.turnIndex;
        state.stage = 'bidding';
        updateUI();
        processTurn();
    }

    function toggleAutoPlay() {
        state.autoPlay = !state.autoPlay;
        const btn = document.getElementById('btn-auto-play');
        btn.textContent = state.autoPlay ? '⚡ Auto-Play ON' : '⚡ Bot Auto-Play';
        processTurn();
    }

    function parseHandStr(str) {
        const suits = str.split('.');
        const hand = new Int32Array(52);
        const ranks = BENDeck52.RANKS;
        for (let s = 0; s < 4; s++) {
            if (suits[s]) {
                for (let r = 0; r < suits[s].length; r++) {
                    const cardChar = suits[s][r];
                    const rankIdx = ranks.indexOf(cardChar);
                    if (rankIdx >= 0) {
                        hand[s * 13 + rankIdx] = 1;
                    }
                }
            }
        }
        return hand;
    }

    function updateUI() {
        const vulStr = state.vuln[0] && state.vuln[1] ? 'Both' : state.vuln[0] ? 'N-S' : state.vuln[1] ? 'E-W' : 'None';
        elDealerVuln.textContent = `${state.dealer} (${vulStr})`;
        elContract.textContent = state.contract || 'Bidding...';
        elTricks.textContent = `NS: ${state.tricksWon.NS} | EW: ${state.tricksWon.EW}`;

        // Render seats & hands (one suit per row, played cards greyed out)
        const suitSymbols = ['♠', '♥', '♦', '♣'];
        const suitNames = ['S', 'H', 'D', 'C'];

        seats.forEach((seat, idx) => {
            const seatEl = document.getElementById(`seat-${seat}`);
            seatEl.classList.toggle('active-turn', idx === state.turnIndex && state.stage !== 'ended');

            const handEl = document.getElementById(`hand-${seat}`);
            handEl.innerHTML = '';

            const currentHand = state.hands52[seat];
            const initialHand = state.initialHands52 ? state.initialHands52[seat] : currentHand;

            for (let suitI = 0; suitI < 4; suitI++) {
                const suitRow = document.createElement('div');
                suitRow.className = `suit-row suit-${suitNames[suitI]}`;

                const suitBadge = document.createElement('span');
                suitBadge.className = 'suit-row-badge';
                suitBadge.textContent = suitSymbols[suitI];
                suitRow.appendChild(suitBadge);

                const cardsContainer = document.createElement('div');
                cardsContainer.className = 'suit-row-cards';

                let cardCount = 0;
                for (let r = 0; r < 13; r++) {
                    const c = suitI * 13 + r;
                    if (initialHand[c] > 0) {
                        cardCount++;
                        const isPlayed = currentHand[c] === 0;
                        const cardUi = document.createElement('div');
                        const cardObj = BENObjects.Card.fromCode(c);

                        cardUi.className = `card-ui suit-${cardObj.SUITS[cardObj.suit]}${isPlayed ? ' played' : ''}`;
                        cardUi.textContent = cardObj.RANKS[cardObj.rank];

                        if (!isPlayed && seat === 'S' && state.stage === 'play' && state.turnIndex === 2) {
                            cardUi.addEventListener('click', () => handleHumanCardPlay(c));
                        }

                        cardsContainer.appendChild(cardUi);
                    }
                }

                if (cardCount === 0) {
                    const voidSpan = document.createElement('span');
                    voidSpan.className = 'suit-row-void';
                    voidSpan.textContent = '—';
                    cardsContainer.appendChild(voidSpan);
                }

                suitRow.appendChild(cardsContainer);
                handEl.appendChild(suitRow);
            }
        });

        // Render played trick slots
        ['N', 'E', 'S', 'W'].forEach(seat => {
            document.getElementById(`trick-${seat}`).innerHTML = '';
        });

        state.currentTrick.forEach(item => {
            const slotEl = document.getElementById(`trick-${item.seat}`);
            const cardObj = BENObjects.Card.fromCode(item.card);
            const cardUi = document.createElement('div');
            cardUi.className = `card-ui suit-${cardObj.SUITS[cardObj.suit]}`;
            cardUi.textContent = cardObj.symbol();
            slotEl.appendChild(cardUi);
        });

        // Render auction history table (4 columns: W, N, E, S)
        const tbody = document.getElementById('auction-bids-tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const columnSeats = ['W', 'N', 'E', 'S'];
            const dealerColIndex = columnSeats.indexOf(state.dealer);

            const cells = [];
            for (let i = 0; i < dealerColIndex; i++) {
                cells.push({ text: '-', type: 'empty' });
            }
            for (const bid of state.auction) {
                let type = 'contract';
                if (bid === 'PASS') type = 'pass';
                else if (bid === 'X') type = 'db';
                else if (bid === 'XX') type = 'rdb';
                cells.push({ text: bid, type });
            }

            let tr = null;
            cells.forEach((cell, idx) => {
                if (idx % 4 === 0) {
                    tr = document.createElement('tr');
                    tbody.appendChild(tr);
                }
                const td = document.createElement('td');
                td.textContent = cell.text;
                td.className = `${cell.type}-cell`;
                tr.appendChild(td);
            });

            if (tr && tr.children.length > 0 && tr.children.length < 4) {
                const needed = 4 - tr.children.length;
                for (let k = 0; k < needed; k++) {
                    const td = document.createElement('td');
                    td.textContent = '';
                    td.className = 'empty-cell';
                    tr.appendChild(td);
                }
            }
        }

        // Show/hide bidding modal for South
        if (state.stage === 'bidding' && state.turnIndex === 2 && !state.autoPlay) {
            updateBiddingBoxUI();
            elBiddingModal.classList.remove('hidden');
        } else {
            elBiddingModal.classList.add('hidden');
        }
    }

    async function processTurn() {
        if (state.stage === 'ended') return;

        const currentSeat = seats[state.turnIndex];
        const isHuman = currentSeat === 'S' && !state.autoPlay;

        if (state.stage === 'bidding') {
            if (BENBidding.auctionOver(state.auction)) {
                state.contract = BENBidding.getContract(state.auction, state.dealer);
                if (!state.contract) {
                    elStatus.textContent = "Passed out deal!";
                    state.stage = 'ended';
                    updateUI();
                    return;
                }
                const declI = BENBidding.getDeclI(state.contract);
                state.currentLeader = (declI + 1) % 4;
                state.turnIndex = state.currentLeader;
                state.stage = 'play';
                elStatus.textContent = `Contract: ${state.contract}. Opening lead by ${seats[state.currentLeader]}`;
                updateUI();
                setTimeout(processTurn, 800);
                return;
            }

            if (!isHuman) {
                elStatus.textContent = `${currentSeat} is thinking bid...`;
                setTimeout(async () => {
                    const handStr = BENDeck52.handToStr(state.hands52[currentSeat]);
                    console.log(`[App] Triggering BotBid for seat ${currentSeat} with hand: ${handStr}`);
                    const botBidEngine = new BENBots.BotBid(state.vuln, handStr, models);
                    const resp = await botBidEngine.bid(state.auction);
                    console.log(`[App] Seat ${currentSeat} bid result:`, resp);
                    state.auction.push(resp.bid);
                    state.turnIndex = (state.turnIndex + 1) % 4;
                    updateUI();
                    processTurn();
                }, 400);
            }
        } else if (state.stage === 'play') {
            if (!isHuman) {
                elStatus.textContent = `${currentSeat} is thinking card play...`;
                setTimeout(async () => {
                    const handStr = BENDeck52.handToStr(state.hands52[currentSeat]);
                    const dummySeat = seats[(BENBidding.getDeclI(state.contract) + 2) % 4];
                    const publicHandStr = BENDeck52.handToStr(state.hands52[dummySeat]);

                    // Reconstruct equal-card hands at start of current trick for DDS PBN
                    const trickStartHands = {};
                    for (const s of seats) {
                        trickStartHands[s] = new Int32Array(state.hands52[s]);
                    }
                    for (const item of state.currentTrick) {
                        trickStartHands[item.seat][item.card]++;
                    }

                    const dealPbnStr = `N:${BENDeck52.handToStr(trickStartHands['N'])} ${BENDeck52.handToStr(trickStartHands['E'])} ${BENDeck52.handToStr(trickStartHands['S'])} ${BENDeck52.handToStr(trickStartHands['W'])}`;
                    const currentTrick52 = state.currentTrick.map(t => t.card);
                    const totalRemainingCards = Object.values(state.hands52).reduce((sum, h) => sum + h.reduce((a, b) => a + b, 0), 0);
                    const trickI = Math.floor((52 - totalRemainingCards) / 4);
                    const leaderI = state.currentLeader;

                    console.log(`[App] Triggering CardPlayer for seat ${currentSeat} (trick #${trickI + 1})`);
                    const playerEngine = new BENBots.CardPlayer(
                        models ? models.player_models : [null, null, null, null],
                        state.turnIndex,
                        handStr,
                        publicHandStr,
                        state.contract,
                        false,
                        ddsSolver
                    );

                    const cardResp = await playerEngine.playCard(trickI, leaderI, currentTrick52, dealPbnStr);
                    const playedCard = cardResp.card.code();

                    state.hands52[currentSeat][playedCard]--;
                    state.currentTrick.push({ seat: currentSeat, card: playedCard });

                    if (state.currentTrick.length === 4) {
                        updateUI();
                        setTimeout(resolveTrick, 1000);
                    } else {
                        state.turnIndex = (state.turnIndex + 1) % 4;
                        updateUI();
                        processTurn();
                    }
                }, 400);
            }
        }
    }

    function handleHumanBid(bid) {
        if (!BENBidding.canBid(bid, state.auction)) {
            alert(`Illegal bid: ${bid}`);
            return;
        }
        state.auction.push(bid);
        state.turnIndex = (state.turnIndex + 1) % 4;
        updateUI();
        processTurn();
    }

    function handleHumanCardPlay(card52) {
        const currentSeat = 'S';
        state.hands52[currentSeat][card52]--;
        state.currentTrick.push({ seat: currentSeat, card: card52 });

        if (state.currentTrick.length === 4) {
            updateUI();
            setTimeout(resolveTrick, 1000);
        } else {
            state.turnIndex = (state.turnIndex + 1) % 4;
            updateUI();
            processTurn();
        }
    }

    function resolveTrick() {
        const trickCards52 = state.currentTrick.map(t => t.card);
        const strainI = BENBidding.getStrainI(state.contract);
        const winnerRelI = BENDeck52.getTrickWinnerI(trickCards52, strainI);
        const winnerSeat = state.currentTrick[winnerRelI].seat;
        const winnerCardObj = BENObjects.Card.fromCode(trickCards52[winnerRelI]);

        console.log(`[App] Resolving trick. Winner: Seat ${winnerSeat} with card ${winnerCardObj.symbol()} (strain index: ${strainI})`);

        if (winnerSeat === 'N' || winnerSeat === 'S') {
            state.tricksWon.NS++;
        } else {
            state.tricksWon.EW++;
        }

        state.currentTrick = [];
        state.turnIndex = seats.indexOf(winnerSeat);
        state.currentLeader = state.turnIndex;

        const totalTricks = state.tricksWon.NS + state.tricksWon.EW;
        if (totalTricks === 13) {
            state.stage = 'ended';
            const finalScore = BENScoring.score(state.contract, false, state.tricksWon.NS);
            elStatus.textContent = `Hand Complete! Final Score: ${finalScore}`;
        }

        updateUI();
        if (state.stage !== 'ended') {
            processTurn();
        }
    }
});
