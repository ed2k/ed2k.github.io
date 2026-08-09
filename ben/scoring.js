/**
 * BEN Scoring Module in JavaScript for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BENScoring = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const TRICK_VAL = { 'C': 20, 'D': 20, 'H': 30, 'S': 30, 'N': 30 };

    function score(contract, isVulnerable, nTricks) {
        const level = parseInt(contract[0], 10);
        const strain = contract[1];
        const doubled = contract.includes('X') && !contract.includes('XX');
        const redoubled = contract.includes('XX');

        const target = 6 + level;
        let finalScore = 0;

        if (nTricks >= target) {
            let baseScore = level * TRICK_VAL[strain];
            if (strain === 'N') {
                baseScore += 10;
            }
            let bonus = 0;

            if (redoubled) {
                baseScore *= 4;
                bonus += 100;
            } else if (doubled) {
                baseScore *= 2;
                bonus += 50;
            }

            if (baseScore < 100) {
                bonus += 50;
            } else {
                bonus += isVulnerable ? 500 : 300;
            }

            if (level === 6) {
                bonus += isVulnerable ? 750 : 500;
            } else if (level === 7) {
                bonus += isVulnerable ? 1500 : 1000;
            }

            const nOvertricks = nTricks - target;
            let overtrickScore = 0;
            if (redoubled) {
                overtrickScore = nOvertricks * (isVulnerable ? 400 : 200);
            } else if (doubled) {
                overtrickScore = nOvertricks * (isVulnerable ? 200 : 100);
            } else {
                overtrickScore = nOvertricks * TRICK_VAL[strain];
            }

            finalScore = baseScore + overtrickScore + bonus;
        } else {
            const nUndertricks = target - nTricks;
            let undertrickValues = [];
            if (isVulnerable) {
                undertrickValues = new Array(13).fill(100);
                if (redoubled) {
                    undertrickValues = [400].concat(new Array(12).fill(600));
                } else if (doubled) {
                    undertrickValues = [200].concat(new Array(12).fill(300));
                }
            } else {
                undertrickValues = new Array(13).fill(50);
                if (redoubled) {
                    undertrickValues = [200, 400, 400].concat(new Array(10).fill(600));
                } else if (doubled) {
                    undertrickValues = [100, 200, 200].concat(new Array(10).fill(300));
                }
            }

            let sum = 0;
            for (let i = 0; i < nUndertricks; i++) {
                sum += undertrickValues[i];
            }
            finalScore = -sum;
        }

        return finalScore;
    }

    const _cache = new Map();

    function contractScoresByTrick(contract, vuln) {
        const key = `${contract}_${vuln[0]}_${vuln[1]}`;
        if (_cache.has(key)) {
            return _cache.get(key);
        }

        const scores = new Float64Array(14);
        const declarerSeat = contract[contract.length - 1];
        const seatIndex = 'NESW'.indexOf(declarerSeat);
        const isVulnMap = [vuln[0], vuln[1], vuln[0], vuln[1]];
        const isVuln = isVulnMap[seatIndex];

        for (let i = 0; i < 14; i++) {
            scores[i] = score(contract, isVuln, i);
        }

        _cache.set(key, scores);
        return scores;
    }

    return {
        score,
        contractScoresByTrick,
        TRICK_VAL
    };
}));
