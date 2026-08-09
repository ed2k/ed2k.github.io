/**
 * BEN Deck52 utilities in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BENDeck52 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SUITS = 'SHDC';
    const RANKS = 'AKQJT98765432';
    const X_RANKS = 'AKQJT98x';

    function handToStr(hand) {
        const suits = [];
        for (let i = 0; i < 4; i++) {
            let s = '';
            for (let j = 0; j < 13; j++) {
                if (hand[i * 13 + j] > 0) {
                    s += RANKS[j];
                }
            }
            suits.push(s);
        }
        return suits.join('.');
    }

    function encodeCard(cardStr) {
        const suitI = SUITS.indexOf(cardStr[0]);
        const cardI = RANKS.indexOf(cardStr[1]);
        return suitI * 13 + cardI;
    }

    function decodeCard(card52) {
        const suitI = Math.floor(card52 / 13);
        const cardI = card52 % 13;
        return `${SUITS[suitI]}${RANKS[cardI]}`;
    }

    function randomDeal() {
        const allCards = Array.from({ length: 52 }, (_, i) => i);
        for (let i = allCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
        }

        const handsCards = [
            allCards.slice(0, 13),
            allCards.slice(13, 26),
            allCards.slice(26, 39),
            allCards.slice(39, 52)
        ];

        const hands = handsCards.map(cards => {
            const hand = new Int32Array(52);
            for (const c of cards) {
                hand[c] += 1;
            }
            return handToStr(hand);
        });

        return hands.join(' ');
    }

    function randomDealerVuln() {
        const dealers = ['N', 'E', 'S', 'W'];
        const vulns = ['None', 'N-S', 'E-W', 'Both'];
        const dealer = dealers[Math.floor(Math.random() * dealers.length)];
        const vuln = vulns[Math.floor(Math.random() * vulns.length)];
        return `${dealer} ${vuln}`;
    }

    function card32to52(c32) {
        const suit = Math.floor(c32 / 8);
        const rank = c32 % 8;
        return suit * 13 + rank;
    }

    function card52to32(c52) {
        const suit = Math.floor(c52 / 13);
        const rank = c52 % 13;
        return suit * 8 + Math.min(7, rank);
    }

    function getTrickWinnerI(trick, strainI) {
        const trumpSuit = strainI === 0 ? -1 : strainI - 1;
        const leadSuit = Math.floor(trick[0] / 13);

        const suits = trick.map(c => Math.floor(c / 13));
        const ranks = trick.map(c => c % 13);

        const isTrumped = trumpSuit !== -1 && suits.some(s => s === trumpSuit);

        let bestIndex = 0;
        let bestRank = 99;

        if (isTrumped) {
            for (let i = 0; i < 4; i++) {
                if (suits[i] === trumpSuit && ranks[i] < bestRank) {
                    bestRank = ranks[i];
                    bestIndex = i;
                }
            }
        } else {
            for (let i = 0; i < 4; i++) {
                if (suits[i] === leadSuit && ranks[i] < bestRank) {
                    bestRank = ranks[i];
                    bestIndex = i;
                }
            }
        }

        return bestIndex;
    }

    return {
        handToStr,
        encodeCard,
        decodeCard,
        randomDeal,
        randomDealerVuln,
        card32to52,
        card52to32,
        getTrickWinnerI,
        SUITS,
        RANKS,
        X_RANKS
    };
}));
