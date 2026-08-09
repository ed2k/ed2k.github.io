/**
 * BEN Bidding Rules and Helpers in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BENBidding = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const LEVELS = [1, 2, 3, 4, 5, 6, 7];
    const SUITS = ['C', 'D', 'H', 'S', 'N'];
    const SUIT_RANK = { 'C': 0, 'D': 1, 'H': 2, 'S': 3, 'N': 4 };

    const BID2ID = {
        'PAD_START': 0,
        'PAD_END': 1,
        'PASS': 2,
        'X': 3,
        'XX': 4,
    };

    let suitBidId = 5;
    for (const level of LEVELS) {
        for (const suit of SUITS) {
            BID2ID[`${level}${suit}`] = suitBidId++;
        }
    }

    const ID2BID = {};
    for (const [bid, id] of Object.entries(BID2ID)) {
        ID2BID[id] = bid;
    }

    function isContract(bid) {
        return Boolean(bid && bid.length >= 2 && bid[0] >= '1' && bid[0] <= '7');
    }

    function canDouble(auction) {
        if (!auction || auction.length === 0) return false;
        if (isContract(auction[auction.length - 1])) return true;
        if (auction.length >= 3 && isContract(auction[auction.length - 3]) && auction[auction.length - 2] === 'PASS' && auction[auction.length - 1] === 'PASS') {
            return true;
        }
        return false;
    }

    function canRedouble(auction) {
        if (!auction || auction.length === 0) return false;
        if (auction[auction.length - 1] === 'X') return true;
        if (auction.length >= 3 && auction[auction.length - 3] === 'X' && auction[auction.length - 2] === 'PASS' && auction[auction.length - 1] === 'PASS') {
            return true;
        }
        return false;
    }

    function lastContract(auction) {
        if (!auction) return null;
        for (let i = auction.length - 1; i >= 0; i--) {
            if (isContract(auction[i])) return auction[i];
        }
        return null;
    }

    function contractLevelStep(contract) {
        const level = parseInt(contract[0], 10);
        return level * 5 + SUIT_RANK[contract[1]];
    }

    function isHigherContract(thisContract, otherContract) {
        return contractLevelStep(thisContract) > contractLevelStep(otherContract);
    }

    function canBidContract(bid, auction) {
        const contract = lastContract(auction);
        if (contract === null) return true;
        return isHigherContract(bid, contract);
    }

    function auctionOver(auction) {
        if (!auction || auction.length < 4) return false;
        if (auction[auction.length - 1] === 'PAD_END') return true;
        const contract = lastContract(auction);
        if (contract === null) {
            return auction.slice(-4).every(b => b === 'PASS') && auction.slice(0, -4).every(b => b === 'PAD_START');
        } else {
            return auction.slice(-3).every(b => b === 'PASS');
        }
    }

    function canBid(bid, auction) {
        if (bid === 'PASS') return true;
        if (bid === 'X') return canDouble(auction);
        if (bid === 'XX') return canRedouble(auction);
        if (isContract(bid)) return canBidContract(bid, auction);
        return false;
    }

    function getContract(auction, dealer = 'N') {
        let contract = null;
        let doubled = false;
        let redoubled = false;
        let lastBidI = null;

        for (let i = auction.length - 1; i >= 0; i--) {
            const bid = auction[i];
            if (isContract(bid)) {
                contract = bid;
                lastBidI = i;
                break;
            }
            if (bid === 'X') doubled = true;
            if (bid === 'XX') redoubled = true;
        }

        if (contract === null) return null;

        let declarerI = null;
        for (let i = 0; i <= lastBidI; i++) {
            const bid = auction[i];
            if (!isContract(bid)) continue;
            if ((i + lastBidI) % 2 !== 0) continue;
            if (bid[1] !== contract[1]) continue;
            declarerI = i;
            break;
        }

        const dealerIdx = typeof dealer === 'number' ? dealer : 'NESW'.indexOf(dealer);
        const actualSeatIdx = (dealerIdx >= 0 ? dealerIdx + declarerI : declarerI) % 4;
        const declarer = ['N', 'E', 'S', 'W'][actualSeatIdx];
        const xx = !doubled ? '' : !redoubled ? 'X' : 'XX';

        return `${contract}${xx}${declarer}`;
    }

    function getStrainI(contract) {
        return 'NSHDC'.indexOf(contract[1]);
    }

    function getDeclI(contract) {
        return 'NESW'.indexOf(contract[contract.length - 1]);
    }

    return {
        BID2ID,
        ID2BID,
        LEVELS,
        SUITS,
        SUIT_RANK,
        isContract,
        canDouble,
        canRedouble,
        lastContract,
        canBid,
        auctionOver,
        getContract,
        getStrainI,
        getDeclI
    };
}));
