import { Logger } from './../utils/createLogger';
import { MediaDefinition } from './MediaDefinition';
import mediasoup from 'mediasoup';
import { createLogger } from '../utils/createLogger';
import { createOffer } from './sdp';

export class ManagedRouter {
    #worker: mediasoup.types.Worker;
    #router: mediasoup.types.Router | null = null;
    #definition!: MediaDefinition;
    #started = false;
    #destroyed = false;
    #applying = false;
    #transports = new Map<string, mediasoup.types.WebRtcTransport>();
    #logger!: Logger;
    onAborted: (() => void) | null = null;

    constructor(worker: mediasoup.types.Worker) {
        this.#worker = worker;
    }

    apply = (definition: MediaDefinition) => {
        if (this.#destroyed) {
            return;
        }
        if (!this.#started) {
            this.#logger = createLogger('router:' + definition.id);
            this.#logger.info('Starting');
            this.#started = true;
            this.#definition = definition;
            this.#start();
        } else {
            // Ignore if version is not increased
            if (this.#definition.version >= definition.version) {
                return;
            }
            // Ignore if id mismatch
            if (this.#definition.id !== definition.id) {
                return;
            }
            this.#definition = definition;
            this.#applySettings();
        }
    }

    destroy() {
        if (!this.#destroyed) {
            this.#destroyed = true;

            // Finalize if not applying
            if (!this.#applying) {
                this.#finalize();
            }
        }
    }

    #start = () => {
        (async () => {
            try {
                let router = await this.#worker.createRouter({ mediaCodecs: this.#definition.mediaCodecs });
                if (this.#destroyed) {
                    router.close();
                    return;
                }
                this.#logger.info('Router created');
                this.#router = router;
            } catch (e) {
                if (this.#destroyed) {
                    return;
                }

                this.#destroyed = true;
                this.#logger.warn(e);
                if (this.onAborted) {
                    this.onAborted();
                }
                return;
            }
            this.#applySettings();
        })();
    }

    #applySettings = () => {
        if (this.#destroyed) {
            return;
        }
        if (this.#applying) {
            return;
        }
        this.#applying = true;

        (async () => {
            try {
                while (true) {
                    // Exit loop if already destroyed
                    if (this.#destroyed) {
                        this.#finalize();
                        return;
                    }

                    let toApply = this.#definition;

                    // 1. Create new transports
                    for (let t of toApply.transports) {
                        if (this.#transports.has(t.id)) {
                            continue;
                        }
                        this.#logger.info('Creating transport #' + t.id);
                        let tr = await this.#router!.createWebRtcTransport({
                            listenIps: ['0.0.0.0'],
                            enableUdp: t.enableUdp,
                            enableTcp: t.enableTcp,
                            preferTcp: t.preferTcp,
                            preferUdp: t.preferUdp,
                            enableSctp: false /* Explicitly disable data channels */
                        });
                        let off = createOffer(tr.iceParameters, tr.iceCandidates, tr.dtlsParameters);
                        this.#logger.info(off);
                        this.#transports.set(t.id, tr);
                        this.#logger.info('Created transport #' + t.id);
                    }

                    // 2. Stop removed transports
                    for (let t of [...this.#transports.keys()]) {
                        if (toApply.transports.find((v) => v.id === t)) {
                            continue;
                        }
                        this.#logger.info('Closing transport #' + t);
                        let tr = this.#transports.get(t)!;
                        this.#transports.delete(t);
                        tr.close();
                        this.#logger.info('Closed transport #' + t);
                    }

                    // 3. Create Producers
                    for (let p of toApply.producers) {
                        let pr = await this.#transports.get(p.transportId)!.produce({ kind: 'video', rtpParameters: { codecs: [] } });
                    }

                    // Exit loop if 
                    if (this.#definition.version === toApply.version) {
                        break;
                    }
                }

                this.#applying = false;

                // Finalize if needed
                if (this.#destroyed) {
                    this.#finalize();
                    return;
                }
            } catch (e) {
                this.#logger.warn(e);
                this.#destroyed = true;
                this.#finalize();
            }
        })();
    }

    #finalize = () => {
        if (this.#router) {
            this.#router.close();
            this.#router = null;
        }
    }
}