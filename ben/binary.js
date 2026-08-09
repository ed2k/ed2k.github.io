/**
 * BEN Binary Features and Tensor Builders in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([root.BENBidding], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./bidding'));
    } else {
        root.BENBinary = factory(root.BENBidding);
    }
}(typeof self !== 'undefined' ? self : this, function (BENBidding) {

    const CARD_INDEX_LOOKUP = {
        'A': 0, 'K': 1, 'Q': 2, 'J': 3, 'T': 4,
        '9': 5, '8': 6, '7': 7, '6': 8, '5': 9,
        '4': 10, '3': 11, '2': 12
    };

    function getCardIndex(card, nCards) {
        const xCardIndex = Math.floor(nCards / 4) - 1;
        if (!(card in CARD_INDEX_LOOKUP)) return xCardIndex;
        return Math.min(CARD_INDEX_LOOKUP[card], xCardIndex);
    }

    function parseHandF(nCards) {
        return function (handStr) {
            const x = new Float32Array(nCards);
            const suits = handStr.split('.');
            if (suits.length !== 4) throw new Error(`Invalid hand string: ${handStr}`);
            const nSuitRanks = Math.floor(nCards / 4);
            for (let suitIndex = 0; suitIndex < 4; suitIndex++) {
                for (let i = 0; i < suits[suitIndex].length; i++) {
                    const card = suits[suitIndex][i];
                    const cardIndex = getCardIndex(card, nCards);
                    x[suitIndex * nSuitRanks + cardIndex] += 1;
                }
            }
            return x;
        };
    }

    function getShape(hand, nSamples = 1) {
        const shape = new Float32Array(nSamples * 4);
        const nCards = hand.length / nSamples;
        const ranksPerSuit = nCards / 4;
        for (let s = 0; s < nSamples; s++) {
            for (let suit = 0; suit < 4; suit++) {
                let sum = 0;
                for (let r = 0; r < ranksPerSuit; r++) {
                    sum += hand[s * nCards + suit * ranksPerSuit + r];
                }
                shape[s * 4 + suit] = sum;
            }
        }
        return shape;
    }

    function getHcp(hand, nSamples = 1) {
        const hcp = new Float32Array(nSamples);
        const nCards = hand.length / nSamples;
        const ranksPerSuit = nCards / 4;
        for (let s = 0; s < nSamples; s++) {
            let points = 0;
            for (let suit = 0; suit < 4; suit++) {
                const offset = s * nCards + suit * ranksPerSuit;
                const a = hand[offset + 0] || 0;
                const k = hand[offset + 1] || 0;
                const q = hand[offset + 2] || 0;
                const j = hand[offset + 3] || 0;
                points += 4 * a + 3 * k + 2 * q + 1 * j;
            }
            hcp[s] = points;
        }
        return hcp;
    }

    class BinaryInput {
        constructor(x, nSamples = 1) {
            this.x = x;
            this.nSamples = nSamples;
            this.nFtrs = Math.floor(x.length / nSamples);
        }

        setPlayerHand(handBin) {
            for (let s = 0; s < this.nSamples; s++) {
                this.x.set(handBin.slice(s * 32, (s + 1) * 32), s * this.nFtrs);
            }
        }

        setPublicHand(handBin) {
            for (let s = 0; s < this.nSamples; s++) {
                this.x.set(handBin.slice(s * 32, (s + 1) * 32), s * this.nFtrs + 32);
            }
        }

        setLevel(level) {
            for (let s = 0; s < this.nSamples; s++) {
                this.x[s * this.nFtrs + 292] = level;
            }
        }

        setStrain(strainOneHot) {
            for (let s = 0; s < this.nSamples; s++) {
                this.x.set(strainOneHot, s * this.nFtrs + 293);
            }
        }

        getThisTrickLeadSuit() {
            const result = new Float32Array(this.nSamples * 4);
            for (let s = 0; s < this.nSamples; s++) {
                const offset = s * this.nFtrs + 192;
                let leadSuit = -1;
                for (let k = 0; k < 3; k++) {
                    const playerCardOffset = offset + k * 32;
                    let maxVal = -1;
                    let maxCard = -1;
                    for (let c = 0; c < 32; c++) {
                        if (this.x[playerCardOffset + c] > maxVal) {
                            maxVal = this.x[playerCardOffset + c];
                            maxCard = c;
                        }
                    }
                    if (maxVal > 0 && leadSuit === -1) {
                        leadSuit = Math.floor(maxCard / 8);
                        break;
                    }
                }
                if (leadSuit !== -1) {
                    result[s * 4 + leadSuit] = 1;
                }
            }
            return result;
        }
    }

    function getAuctionBinary(nSteps, auctionInput, handIx, hand, vuln, nSamples = 1) {
        const ftrsPerStep = 2 + 1 + 4 + 32 + 3 * 40; // 159
        const X = new Float32Array(nSamples * nSteps * ftrsPerStep);

        const vulnUsThem = [
            vuln[handIx % 2] ? 1 : 0,
            vuln[(handIx + 1) % 2] ? 1 : 0
        ];

        const shpVec = getShape(hand, nSamples);
        const hcpVec = getHcp(hand, nSamples);

        const BID2ID = BENBidding ? BENBidding.BID2ID : {};
        const padEndId = BID2ID['PAD_END'] || 1;
        const padStartId = BID2ID['PAD_START'] || 0;

        let auctionIds = [];
        if (Array.isArray(auctionInput)) {
            const paddedAuction = auctionInput.concat(new Array(4 * nSteps).fill('PAD_END'));
            auctionIds = paddedAuction.map(bid => BID2ID[bid] !== undefined ? BID2ID[bid] : padEndId);
        } else {
            auctionIds = Array.from(auctionInput);
        }

        let bidI = handIx;
        while (bidI < auctionIds.length && auctionIds[bidI] === padStartId) {
            bidI += 4;
        }

        for (let s = 0; s < nSamples; s++) {
            const hcpVal = (hcpVec[s] - 10) / 4;
            const shpVals = [
                (shpVec[s * 4 + 0] - 3.25) / 1.75,
                (shpVec[s * 4 + 1] - 3.25) / 1.75,
                (shpVec[s * 4 + 2] - 3.25) / 1.75,
                (shpVec[s * 4 + 3] - 3.25) / 1.75
            ];
            const handSlice = hand.subarray(s * 32, (s + 1) * 32);

            let currentBidI = bidI;
            for (let stepI = 0; stepI < nSteps; stepI++) {
                const stepOffset = (s * nSteps + stepI) * ftrsPerStep;

                X[stepOffset + 0] = vulnUsThem[0];
                X[stepOffset + 1] = vulnUsThem[1];
                X[stepOffset + 2] = hcpVal;

                X[stepOffset + 3] = shpVals[0];
                X[stepOffset + 4] = shpVals[1];
                X[stepOffset + 5] = shpVals[2];
                X[stepOffset + 6] = shpVals[3];

                X.set(handSlice, stepOffset + 7);

                const lhoBid = currentBidI - 3 >= 0 ? auctionIds[currentBidI - 3] : padStartId;
                const partnerBid = currentBidI - 2 >= 0 ? auctionIds[currentBidI - 2] : padStartId;
                const rhoBid = currentBidI - 1 >= 0 ? auctionIds[currentBidI - 1] : padStartId;

                X[stepOffset + 39 + lhoBid] = 1;
                X[stepOffset + 39 + 40 + partnerBid] = 1;
                X[stepOffset + 39 + 2 * 40 + rhoBid] = 1;

                currentBidI += 4;
            }
        }

        return X;
    }

    return {
        parseHandF,
        getShape,
        getHcp,
        BinaryInput,
        getAuctionBinary,
        getCardIndex
    };
}));
