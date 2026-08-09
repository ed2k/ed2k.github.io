/**
 * BEN Bot Logic (BotBid, BotLead, CardPlayer) in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            root.BENObjects,
            root.BENDeck52,
            root.BENBidding,
            root.BENBinary,
            root.BENScoring,
            root.BENTFModels,
            root.BENSample,
            root.DDS
        ], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(
            require('./objects'),
            require('./deck52'),
            require('./bidding'),
            require('./binary'),
            require('./scoring'),
            require('./tf_models'),
            require('./sample'),
            require('./dds3_api')
        );
    } else {
        root.BENBots = factory(
            root.BENObjects,
            root.BENDeck52,
            root.BENBidding,
            root.BENBinary,
            root.BENScoring,
            root.BENTFModels,
            root.BENSample,
            root.DDS
        );
    }
}(typeof self !== 'undefined' ? self : this, function (BENObjects, BENDeck52, BENBidding, BENBinary, BENScoring, BENTFModels, BENSample, DDS) {

    const { Card, CandidateBid, BidResp, CandidateCard, CardResp } = BENObjects;
    const { card32to52, card52to32, handToStr } = BENDeck52;
    const { canBid, getContract, getStrainI, getDeclI, BID2ID, ID2BID } = BENBidding;
    const { parseHandF, getAuctionBinary, BinaryInput } = BENBinary;
    const { contractScoresByTrick, score } = BENScoring;
    const { followSuit } = BENTFModels;
    const { sampleCardsAuction } = BENSample;

    class BotBid {
        constructor(vuln, handStr, models) {
            this.vuln = vuln; // [vuln_we, vuln_them]
            this.handStr = handStr;
            this.hand = parseHandF(32)(handStr);
            this.minCandidateScore = 0.15;
            this.model = models.bidder_model;
            this.leadModel = models.lead;
            this.sdModel = models.sd_model;
            this.binfoModel = models.binfo;
        }

        static getNStepsAuction(auction) {
            const handI = auction.length % 4;
            let i = handI;
            while (i < auction.length && auction[i] === 'PAD_START') {
                i += 4;
            }
            return 1 + Math.floor((auction.length - i) / 4);
        }

        getBidCandidates(auction) {
            console.log(`[BotBid] Evaluating candidates for hand: "${this.handStr}", auction: [${auction.join(', ')}]`);
            const nSteps = BotBid.getNStepsAuction(auction);
            const handIx = auction.length % 4;
            const X = getAuctionBinary(nSteps, auction, handIx, this.hand, this.vuln);

            const bidSoftmaxArr = this.model.predictSeq(X);
            const bidSoftmax = Array.from(bidSoftmaxArr[bidSoftmaxArr.length - 1] || new Array(40).fill(1 / 40));

            // Log top 5 highest probability bids
            const indexedProbs = bidSoftmax.map((prob, idx) => ({ bid: ID2BID[idx] || `ID_${idx}`, prob, idx }))
                .sort((a, b) => b.prob - a.prob);
            console.log("[BotBid] Top 5 predicted bids from neural model:", indexedProbs.slice(0, 5));

            const candidates = [];
            const tempScores = [...bidSoftmax];

            while (true) {
                let maxI = 0;
                let maxVal = -1;
                for (let i = 0; i < tempScores.length; i++) {
                    if (tempScores[i] > maxVal) {
                        maxVal = tempScores[i];
                        maxI = i;
                    }
                }
                if (maxVal < this.minCandidateScore && candidates.length > 0) {
                    console.log(`[BotBid] Score ${maxVal.toFixed(4)} is below threshold ${this.minCandidateScore}, stopping candidate search.`);
                    break;
                }
                const bidName = ID2BID[maxI] || 'PASS';
                if (canBid(bidName, auction)) {
                    candidates.push(new CandidateBid(bidName, maxVal));
                } else {
                    console.log(`[BotBid] Bid '${bidName}' is illegal in current auction context, skipping.`);
                }
                tempScores[maxI] = -1;
                if (candidates.length >= 5) break;
            }

            console.log("[BotBid] Selected candidate bids:", candidates);
            return candidates;
        }

        async bid(auction) {
            const candidates = this.getBidCandidates(auction);
            const chosen = candidates[0] ? candidates[0].bid : 'PASS';
            console.log(`[BotBid] Final chosen bid decision: ${chosen}`);
            return new BidResp(chosen, candidates, []);
        }
    }

    class BotLead {
        constructor(vuln, handStr, models) {
            this.vuln = vuln;
            this.handStr = handStr;
            this.hand = parseHandF(32)(handStr);
            this.hand52 = parseHandF(52)(handStr);
            this.leadModel = models.lead;
            this.bidderModel = models.bidder_model;
            this.binfoModel = models.binfo;
            this.sdModel = models.sd_model;
        }

        getLeadCandidates(auction) {
            const candidateCards = [];
            for (let c = 0; c < 32; c++) {
                if (this.hand[c] > 0) {
                    candidateCards.push(c);
                }
            }
            return candidateCards;
        }

        async lead(auction) {
            const candidates32 = this.getLeadCandidates(auction);
            const candidateCards = candidates32.map(c32 => {
                const c52 = card32to52(c32);
                return new CandidateCard(
                    Card.fromCode(c52),
                    0.5,
                    6.5,
                    0.5
                );
            });

            return new CardResp(candidateCards[0].card, candidateCards, []);
        }
    }

    class CardPlayer {
        constructor(playerModels, playerI, handStr, publicHandStr, contract, isDeclVuln, ddsApi = null) {
            this.playerModels = playerModels;
            this.model = playerModels[playerI];
            this.playerI = playerI;
            this.hand = parseHandF(32)(handStr);
            this.hand52 = parseHandF(52)(handStr);
            this.public52 = parseHandF(52)(publicHandStr);
            this.contract = contract;
            this.isDeclVuln = isDeclVuln;
            this.nTricksTaken = 0;
            this.strainI = getStrainI(contract);
            this.ddsApi = ddsApi || (typeof DDS !== 'undefined' ? DDS : null);
        }

        getLegalCards52(currentTrick52 = []) {
            const legal = [];
            const suitMask = [0, 0, 0, 0];
            const leadSuit = currentTrick52.length > 0 ? Math.floor(currentTrick52[0] / 13) : -1;

            for (let c = 0; c < 52; c++) {
                if (this.hand52[c] > 0) {
                    const suit = Math.floor(c / 13);
                    suitMask[suit]++;
                }
            }

            const hasLeadSuit = leadSuit !== -1 && suitMask[leadSuit] > 0;

            for (let c = 0; c < 52; c++) {
                if (this.hand52[c] > 0) {
                    const suit = Math.floor(c / 13);
                    if (!hasLeadSuit || suit === leadSuit) {
                        legal.push(c);
                    }
                }
            }

            return legal;
        }

        async playCard(trickI, leaderI, currentTrick52, dealPbnStr = null) {
            const legal52 = this.getLegalCards52(currentTrick52);
            let chosen52 = legal52[0];

            console.log(`[CardPlayer] Player ${this.playerI} evaluating trick ${trickI + 1}, leader index ${leaderI}, current trick:`, currentTrick52.map(c => Card.fromCode(c).symbol()));
            console.log(`[CardPlayer] Legal card options:`, legal52.map(c => Card.fromCode(c).symbol()));

            let solver = null;
            if (this.ddsApi) {
                if (typeof this.ddsApi.solveBoardPBN === 'function') {
                    solver = this.ddsApi;
                } else if (typeof this.ddsApi.init === 'function') {
                    try {
                        solver = await this.ddsApi.init();
                    } catch (e) {
                        console.warn("[CardPlayer] Error initializing DDS API:", e);
                    }
                }
            }

            if (solver && typeof solver.solveBoardPBN === 'function' && dealPbnStr) {
                try {
                    const benStrain = this.strainI; // 0=N, 1=S, 2=H, 3=D, 4=C
                    const ddsTrump = benStrain === 0 ? 4 : benStrain - 1; // 0=S, 1=H, 2=D, 3=C, 4=N
                    const first = leaderI;

                    const trickSuit = [];
                    const trickRank = [];
                    for (const c52 of currentTrick52) {
                        const s = Math.floor(c52 / 13);
                        const r = 14 - (c52 % 13);
                        trickSuit.push(s);
                        trickRank.push(r);
                    }

                    console.log(`[CardPlayer -> DDS WASM] Invoking Double Dummy Solver:`);
                    console.log(`  - PBN Deal String: "${dealPbnStr}"`);
                    console.log(`  - Trump Strain: BEN=${benStrain} (${this.contract}) => DDS=${ddsTrump}`);
                    console.log(`  - Leader Seat Index: ${first}`);
                    console.log(`  - Trick Cards Played So Far:`, currentTrick52.map(c => Card.fromCode(c).symbol()));

                    const res = solver.solveBoardPBN(dealPbnStr, ddsTrump, first, trickSuit, trickRank);

                    if (res && res.cards > 0 && res.suit && res.suit.length > 0) {
                        console.log(`[CardPlayer -> DDS WASM] Solver returned ${res.cards} evaluated card moves:`);
                        const evaluatedOptions = [];
                        for (let k = 0; k < res.cards; k++) {
                            const suitI = res.suit[k];
                            const rankI = 14 - res.rank[k];
                            const c52 = suitI * 13 + rankI;
                            const cardSymbol = Card.fromCode(c52).symbol();
                            const tricksScore = res.score[k];
                            evaluatedOptions.push({ cardSymbol, c52, tricksScore });
                            console.log(`  -> Option #${k + 1}: ${cardSymbol} => max tricks remaining: ${tricksScore}`);
                        }

                        // Pick highest score card that is legal
                        evaluatedOptions.sort((a, b) => b.tricksScore - a.tricksScore);
                        for (const opt of evaluatedOptions) {
                            if (legal52.includes(opt.c52)) {
                                chosen52 = opt.c52;
                                console.log(`[CardPlayer -> DDS WASM] Selected optimal DDS card move: ${opt.cardSymbol} (tricks = ${opt.tricksScore})`);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[CardPlayer -> DDS WASM] Solver error, using fallback:", e);
                }
            } else {
                console.log(`[CardPlayer] WASM DDS solver not provided or PBN deal missing, using default rule move: ${Card.fromCode(chosen52).symbol()}`);
            }

            const candidates = legal52.map(c52 => new CandidateCard(
                Card.fromCode(c52),
                c52 === chosen52 ? 0.9 : 0.1,
                6.5,
                0.5,
                100
            ));

            return new CardResp(Card.fromCode(chosen52), candidates, []);
        }
    }

    return {
        BotBid,
        BotLead,
        CardPlayer
    };
}));
