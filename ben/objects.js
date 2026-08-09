/**
 * BEN Data Objects in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BENObjects = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SUITS = 'SHDC';
    const RANKS = 'AKQJT98765432';
    const X_RANKS = 'AKQJT98x';

    class Card {
        constructor(suit, rank, xcards = false) {
            this.suit = suit;
            this.rank = rank;
            this.xcards = xcards;
            this.SUITS = SUITS;
            this.RANKS = xcards ? X_RANKS : RANKS;
        }

        symbol() {
            return `${SUITS[this.suit]}${this.RANKS[this.rank]}`;
        }

        code() {
            return (this.xcards ? 8 : 13) * this.suit + this.rank;
        }

        toString() {
            return this.symbol();
        }

        static fromSymbol(symbol, xcards = false) {
            if (symbol.length !== 2) throw new Error(`Invalid card symbol: ${symbol}`);
            const suitSymbol = symbol[0].toUpperCase();
            const rankSymbol = symbol[1].toUpperCase();
            const ranks = xcards ? X_RANKS : RANKS;
            return new Card(SUITS.indexOf(suitSymbol), ranks.indexOf(rankSymbol), xcards);
        }

        static fromCode(code, xcards = false) {
            const nRanks = xcards ? 8 : 13;
            return new Card(Math.floor(code / nRanks), code % nRanks, xcards);
        }
    }

    class CandidateCard {
        constructor(card, instaScore, expectedTricks, pMakeContract = null, expectedScore = null) {
            this.card = card;
            this.insta_score = instaScore !== null && instaScore !== undefined ? parseFloat(instaScore) : null;
            this.expected_tricks = expectedTricks !== null && expectedTricks !== undefined ? parseFloat(expectedTricks) : null;
            this.p_make_contract = pMakeContract !== null && pMakeContract !== undefined ? parseFloat(pMakeContract) : null;
            this.expected_score = expectedScore !== null && expectedScore !== undefined ? parseFloat(expectedScore) : null;
        }

        toDict() {
            const result = { card: this.card.symbol() };
            if (this.insta_score !== null) result.insta_score = this.insta_score;
            if (this.expected_tricks !== null) result.expected_tricks = this.expected_tricks;
            if (this.p_make_contract !== null) result.p_make_contract = this.p_make_contract;
            if (this.expected_score !== null) result.expected_score = this.expected_score;
            return result;
        }
    }

    class CardResp {
        constructor(card, candidates, samples = []) {
            this.card = card;
            this.candidates = candidates;
            this.samples = samples;
        }

        toDict() {
            return {
                card: this.card.symbol(),
                candidates: this.candidates.map(c => c.toDict()),
                samples: this.samples
            };
        }
    }

    class CandidateBid {
        constructor(bid, instaScore, expectedScore = null) {
            this.bid = bid;
            this.insta_score = instaScore !== null && instaScore !== undefined ? parseFloat(instaScore) : null;
            this.expected_score = expectedScore !== null && expectedScore !== undefined ? parseFloat(expectedScore) : null;
        }

        withExpectedScore(expectedScore) {
            return new CandidateBid(this.bid, this.insta_score, expectedScore);
        }

        toDict() {
            const result = { call: this.bid, insta_score: this.insta_score };
            if (this.expected_score !== null) result.expected_score = this.expected_score;
            return result;
        }
    }

    class BidResp {
        constructor(bid, candidates, samples = []) {
            this.bid = bid;
            this.candidates = candidates;
            this.samples = samples;
        }

        toDict() {
            return {
                bid: this.bid,
                candidates: this.candidates.map(c => c.toDict()),
                samples: this.samples
            };
        }
    }

    return {
        Card,
        CandidateCard,
        CardResp,
        CandidateBid,
        BidResp,
        SUITS,
        RANKS,
        X_RANKS
    };
}));
