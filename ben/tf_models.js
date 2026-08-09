/**
 * BEN TensorFlow.js Model Engine for Web Browser.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['@tensorflow/tfjs'], factory);
    } else if (typeof module === 'object' && module.exports) {
        try {
            module.exports = factory(require('@tensorflow/tfjs'));
        } catch (e) {
            module.exports = factory(root.tf || (typeof global !== 'undefined' ? global.tf : null));
        }
    } else {
        root.BENTFModels = factory(root.tf);
    }
}(typeof self !== 'undefined' ? self : this, function (tf) {

    const SUIT_MASK = new Float32Array([
        ...new Array(8).fill(1), ...new Array(24).fill(0),
        ...new Array(8).fill(0), ...new Array(8).fill(1), ...new Array(16).fill(0),
        ...new Array(16).fill(0), ...new Array(8).fill(1), ...new Array(8).fill(0),
        ...new Array(24).fill(0), ...new Array(8).fill(1)
    ]);

    function followSuit(cardsSoftmax, ownCards, trickSuit) {
        const nSamples = ownCards.length / 32;
        const result = new Float32Array(nSamples * 32);

        for (let s = 0; s < nSamples; s++) {
            const cardOffset = s * 32;
            const suitOffset = s * 4;

            let trickSuitI = -1;
            let maxSuitVal = 0;
            for (let i = 0; i < 4; i++) {
                if (trickSuit[suitOffset + i] > maxSuitVal) {
                    maxSuitVal = trickSuit[suitOffset + i];
                    trickSuitI = i;
                }
            }

            const mask = new Float32Array(32);
            let hasCardsOfSuit = false;

            if (trickSuitI >= 0 && maxSuitVal > 0) {
                const suitMaskStart = trickSuitI * 32;
                for (let c = 0; c < 32; c++) {
                    if (ownCards[cardOffset + c] > 0 && SUIT_MASK[suitMaskStart + c] > 0) {
                        hasCardsOfSuit = true;
                        break;
                    }
                }
            }

            for (let c = 0; c < 32; c++) {
                const ownHas = ownCards[cardOffset + c] > 0 ? 1 : 0;
                if (trickSuitI >= 0 && maxSuitVal > 0 && hasCardsOfSuit) {
                    const suitMaskStart = trickSuitI * 32;
                    mask[c] = ownHas * SUIT_MASK[suitMaskStart + c];
                } else {
                    mask[c] = ownHas;
                }
            }

            let sum = 0;
            for (let c = 0; c < 32; c++) {
                const val = cardsSoftmax[cardOffset + c] * mask[c];
                result[cardOffset + c] = val;
                sum += val;
            }

            if (sum < 1e-9) sum = 1;
            for (let c = 0; c < 32; c++) {
                result[cardOffset + c] /= sum;
            }
        }

        return result;
    }

    class SimpleTFModel {
        constructor(weightsDict, name = "Model") {
            this.name = name;
            this.weights = {};
            this.hasWeights = false;
            if (weightsDict && Object.keys(weightsDict).length > 0) {
                for (const [key, val] of Object.entries(weightsDict)) {
                    this.weights[key] = tf.tensor(val);
                }
                this.hasWeights = true;
                console.log(`[SimpleTFModel] ${this.name} initialized with ${Object.keys(this.weights).length} tensors.`);
            } else {
                console.warn(`[SimpleTFModel] ${this.name} initialized WITHOUT weights dictionary! Falling back to rule-based logic.`);
            }
        }

        dispose() {
            for (const t of Object.values(this.weights)) {
                if (t && typeof t.dispose === 'function') t.dispose();
            }
            this.weights = {};
        }
    }

    class BidderJS extends SimpleTFModel {
        constructor(weightsDict) {
            super(weightsDict, "BidderJS");
        }

        predictSeq(seqIn) {
            console.log(`[BidderJS.predictSeq] Input seq shape: [${seqIn.length}, ${seqIn[0] ? seqIn[0].length : 0}, ${seqIn[0] && seqIn[0][0] ? seqIn[0][0].length : 0}]`);

            if (!this.hasWeights) {
                console.warn("[BidderJS.predictSeq] Weights missing, returning fallback uniform probs.");
                return new Array(seqIn.length).fill(new Array(40).fill(1 / 40));
            }

            return tf.tidy(() => {
                const k0 = this.weights['rnn/multi_rnn_cell/cell_0/basic_lstm_cell/kernel'];
                const b0 = this.weights['rnn/multi_rnn_cell/cell_0/basic_lstm_cell/bias'];
                const k1 = this.weights['rnn/multi_rnn_cell/cell_1/basic_lstm_cell/kernel'];
                const b1 = this.weights['rnn/multi_rnn_cell/cell_1/basic_lstm_cell/bias'];
                const k2 = this.weights['rnn/multi_rnn_cell/cell_2/basic_lstm_cell/kernel'];
                const b2 = this.weights['rnn/multi_rnn_cell/cell_2/basic_lstm_cell/bias'];
                const w_out = this.weights['softmax_w'];

                const rawX = tf.tensor(seqIn);
                let x;
                const ftrsPerStep = 159;
                if (rawX.rank === 1) {
                    const steps = Math.floor(rawX.shape[0] / ftrsPerStep);
                    x = rawX.reshape([1, steps, ftrsPerStep]);
                } else if (rawX.rank === 2) {
                    x = rawX.reshape([1, rawX.shape[0], rawX.shape[1]]);
                } else {
                    x = rawX;
                }
                const nSamples = x.shape[0];
                const nSteps = x.shape[1];
                const ftrs = x.shape[2];
                console.log(`[BidderJS.predictSeq] Reshaped input tensor to shape: [${nSamples}, ${nSteps}, ${ftrs}]`);

                let c0 = tf.zeros([nSamples, 128]);
                let h0 = tf.zeros([nSamples, 128]);
                let c1 = tf.zeros([nSamples, 128]);
                let h1 = tf.zeros([nSamples, 128]);
                let c2 = tf.zeros([nSamples, 128]);
                let h2 = tf.zeros([nSamples, 128]);

                const lstmStep = (xInput, c, h, kernel, bias) => {
                    const concatInput = tf.concat([xInput, h], 1);
                    const gates = tf.matMul(concatInput, kernel).add(bias);
                    const [i, j, f, o] = tf.split(gates, 4, 1);
                    const cNext = tf.sigmoid(f).mul(c).add(tf.sigmoid(i).mul(tf.tanh(j)));
                    const hNext = tf.sigmoid(o).mul(tf.tanh(cNext));
                    return { c: cNext, h: hNext };
                };

                const seqOutputs = [];
                for (let t = 0; t < nSteps; t++) {
                    const xt = x.slice([0, t, 0], [nSamples, 1, ftrs]).reshape([nSamples, ftrs]);
                    
                    const step0 = lstmStep(xt, c0, h0, k0, b0);
                    c0 = step0.c; h0 = step0.h;

                    const step1 = lstmStep(h0, c1, h1, k1, b1);
                    c1 = step1.c; h1 = step1.h;

                    const step2 = lstmStep(h1, c2, h2, k2, b2);
                    c2 = step2.c; h2 = step2.h;

                    const logits = tf.matMul(h2, w_out); // [nSamples, 40]
                    const softmax = tf.softmax(logits);
                    seqOutputs.push(softmax.arraySync()[0]);
                }

                console.log("[BidderJS.predictSeq] Final step raw bid probabilities computed successfully.");
                return seqOutputs;
            });
        }
    }

    class BidInfoJS extends SimpleTFModel {
        constructor(weightsDict) {
            super(weightsDict, "BidInfoJS");
        }

        predict(seqIn) {
            return tf.tidy(() => {
                const x = tf.tensor(seqIn);
                const nSamples = x.shape[0];
                const nSteps = x.shape[1];
                const hcp = new Float32Array(nSamples * nSteps * 3);
                const shp = new Float32Array(nSamples * nSteps * 12);
                return { pHcp: hcp, pShp: shp };
            });
        }
    }

    class LeaderJS extends SimpleTFModel {
        constructor(weightsDict) {
            super(weightsDict, "LeaderJS");
        }

        predict(X, B) {
            const nSamples = X.length / 42;
            const res = new Float32Array(nSamples * 32);
            for (let s = 0; s < nSamples; s++) {
                for (let c = 0; c < 32; c++) {
                    res[s * 32 + c] = X[s * 42 + 10 + c] > 0 ? 1 / 13 : 0;
                }
            }
            return res;
        }
    }

    class LeadSingleDummyJS extends SimpleTFModel {
        constructor(weightsDict) {
            super(weightsDict, "LeadSingleDummyJS");
        }

        predict(X) {
            const nSamples = X.length / 165;
            const res = new Float32Array(nSamples * 14);
            for (let s = 0; s < nSamples; s++) {
                res[s * 14 + 7] = 0.5;
                res[s * 14 + 8] = 0.5;
            }
            return res;
        }
    }

    class PlayerJS extends SimpleTFModel {
        constructor(weightsDict) {
            super(weightsDict, "PlayerJS");
        }

        predict(xPlay) {
            const nSamples = xPlay.length / 298;
            const res = new Float32Array(nSamples * 32);
            for (let s = 0; s < nSamples; s++) {
                for (let c = 0; c < 32; c++) {
                    res[s * 32 + c] = xPlay[s * 298 + c] > 0 ? 1 / 8 : 0;
                }
            }
            return res;
        }
    }

    async function loadModels(basePath = 'models') {
        console.log(`[BENTFModels] Loading neural network models from '${basePath}'...`);

        const fetchWeights = async (name) => {
            // 1. Try compressed .json.gz first
            try {
                const resp = await fetch(`${basePath}/${name}.json.gz`);
                if (resp.ok) {
                    let text;
                    if (typeof DecompressionStream !== 'undefined') {
                        const ds = new DecompressionStream('gzip');
                        const decompressedStream = resp.body.pipeThrough(ds);
                        text = await new Response(decompressedStream).text();
                    } else {
                        text = await resp.text();
                    }
                    const data = JSON.parse(text);
                    console.log(`[BENTFModels] Loaded compressed ${name}.json.gz successfully (${Object.keys(data).length} keys).`);
                    return data;
                }
            } catch (e) {
                console.log(`[BENTFModels] Compressed ${name}.json.gz fetch failed, trying ${name}.json fallback:`, e.message);
            }

            // 2. Fallback to uncompressed .json
            try {
                const resp = await fetch(`${basePath}/${name}.json`);
                if (resp.ok) {
                    const data = await resp.json();
                    console.log(`[BENTFModels] Loaded ${name}.json successfully (${Object.keys(data).length} keys).`);
                    return data;
                }
            } catch (e) {
                console.error(`[BENTFModels] Failed loading model ${name}:`, e);
            }
            return null;
        };

        const [bidderW, binfoW, leadW, sdW, leftyW, dummyW, rightyW, declW] = await Promise.all([
            fetchWeights('bidder'),
            fetchWeights('binfo'),
            fetchWeights('lead'),
            fetchWeights('sd_model'),
            fetchWeights('lefty'),
            fetchWeights('dummy'),
            fetchWeights('righty'),
            fetchWeights('decl')
        ]);

        console.log("[BENTFModels] All models loaded. Instantiating TF JS Model classes.");

        return {
            bidder_model: new BidderJS(bidderW),
            binfo: new BidInfoJS(binfoW),
            lead: new LeaderJS(leadW),
            sd_model: new LeadSingleDummyJS(sdW),
            player_models: [
                new PlayerJS(leftyW),
                new PlayerJS(dummyW),
                new PlayerJS(rightyW),
                new PlayerJS(declW)
            ]
        };
    }

    return {
        followSuit,
        BidderJS,
        BidInfoJS,
        LeaderJS,
        LeadSingleDummyJS,
        PlayerJS,
        loadModels
    };
}));
