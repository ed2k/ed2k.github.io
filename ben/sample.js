/**
 * BEN Hand Sampling Module in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([root.BENBinary, root.BENBidding], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./binary'), require('./bidding'));
    } else {
        root.BENSample = factory(root.BENBinary, root.BENBidding);
    }
}(typeof self !== 'undefined' ? self : this, function (BENBinary, BENBidding) {

    function sampleCardsAuction(nSamples, nSteps, auction, playerI, hand, vuln, bidderModel, binfoModel) {
        const result = new Int32Array(nSamples * 3 * 32);

        // Deck template: 32 cards (8 per suit, last card count = 6 pips)
        const deck = new Int32Array(32).fill(1);
        deck[7] = 6; deck[15] = 6; deck[23] = 6; deck[31] = 6;

        // Unseen hidden cards = total deck - player hand
        const unseen = new Int32Array(32);
        for (let i = 0; i < 32; i++) {
            unseen[i] = deck[i] - hand[i];
        }

        // Build list of all unseen card indices
        const unseenList = [];
        for (let c = 0; c < 32; c++) {
            for (let count = 0; count < unseen[c]; count++) {
                unseenList.push(c);
            }
        }

        // Random sampling of 39 hidden cards (13 cards for 3 players: LHO, Partner, RHO)
        for (let s = 0; s < nSamples; s++) {
            const cards = [...unseenList];
            for (let i = cards.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [cards[i], cards[j]] = [cards[j], cards[i]];
            }

            const lhoOffset = s * 3 * 32 + 0 * 32;
            const parOffset = s * 3 * 32 + 1 * 32;
            const rhoOffset = s * 3 * 32 + 2 * 32;

            for (let i = 0; i < 13; i++) result[lhoOffset + cards[i]] += 1;
            for (let i = 13; i < 26; i++) result[parOffset + cards[i]] += 1;
            for (let i = 26; i < 39; i++) result[rhoOffset + cards[i]] += 1;
        }

        return result;
    }

    return {
        sampleCardsAuction
    };
}));
