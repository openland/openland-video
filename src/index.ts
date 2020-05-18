import express from 'express';
import bodyParser from 'body-parser';
import sdpTransform from 'sdp-transform';
import * as nats from 'ts-nats';
import { extractFingerprint, parseSDP } from './sdp/SDP';
import {
    IceCandidate,
    WebRtcTransport,
    Producer,
    RtpCodecParameters,
    connectToCluster,
    RtpEncoding
} from 'mediakitchen';

function convertIceCandidate(src: IceCandidate) {
    let res: {
        foundation: string;
        component: number;
        transport: string;
        priority: number | string;
        ip: string;
        port: number;
        type: string;
        tcpType?: string;
    } = {
        component: 1, // Always 1
        foundation: src.foundation,
        ip: src.ip,
        port: src.port,
        priority: src.priority,
        transport: src.protocol,
        type: src.type
    };

    if (src.tcpType) {
        res.tcpType = src.tcpType;
    }

    return res;
}

function convertParameters(src: any) {
    return Object.keys(src).map((key) => `${key}=${src[key]}`).join(';')
}

(async () => {
    try {
        let key = Math.random() + '1111';
        let nc = await nats.connect({ payload: nats.Payload.JSON });
        console.log('connecting');
        let cluster = await connectToCluster({ nc });
        console.log(cluster.workers);
        let worker = cluster.workers[0];

        // Router
        let router = await worker.createRouter({
            mediaCodecs: [{
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
                rtcpFeedback: [
                    { type: 'transport-cc' }
                ]
            }]
        }, key + 'samplerouter');

        let transport1!: WebRtcTransport;
        let transport2: WebRtcTransport = await router.createWebRtcTransport({
            enableTcp: true,
            enableUdp: false,
            preferTcp: false,
            preferUdp: false,
        }, key + 'transport2');
        let producer!: Producer;

        // let router = new ManagedRouter(worker);
        // router.apply({
        //     id: 'def!',
        //     version: 1,
        //     mediaCodecs: [],
        //     transports: [{
        //         id: 'tr1',
        //         enableTcp: true,
        //         enableUdp: true,
        //         preferTcp: false,
        //         preferUdp: false
        //     }, {
        //         id: 'tr2',
        //         enableTcp: true,
        //         enableUdp: true,
        //         preferTcp: false,
        //         preferUdp: false
        //     }],
        //     producers: [
        //         { id: 'pr1', transportId: 'tr1', kind: 'video', codecs: [] },
        //         { id: 'pr2', transportId: 'tr2', kind: 'audio', codecs: [] }
        //     ]
        // });

        let app = express();
        app.use(express.static(__dirname + '/static'));
        app.get('/', (req, res) => {
            res.send(`
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="description" content="WebRTC reference app">
            <script type="text/javascript" src="/script.js"></script>
            </head>
            <body>
            <h1>Sender</h1>
            </body>
            `);
        });

        app.get('/2', (req, res) => {
            res.send(`
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="description" content="WebRTC reference app">
            <script type="text/javascript" src="/script2.js"></script>
            </head>
            <body>
            <h1>Receiver</h1>
            </body>
            `);
        });

        app.post('/offer', bodyParser.text(), async (req, res) => {
            let sdp = parseSDP(req.body as string);

            // Extract DTLS fingerprint
            let fingerprint = extractFingerprint(sdp);
            if (!fingerprint) {
                throw Error('No fingerprint provided');
            }

            // Create Transport
            transport1 = await router.createWebRtcTransport({
                enableTcp: true,
                enableUdp: false,
                preferTcp: false,
                preferUdp: false,
            }, key + 'transport1');
            // transport1.on('icestatechange', (iceState) => {
            //     console.log('ICE State: ' + iceState);
            // });
            // transport1.on('dtlsstatechange', (dtlsState) => {
            //     console.log('TDLS State: ' + dtlsState);
            // });
            await transport1.connect({
                dtlsParameters: {
                    role: 'server',
                    fingerprints: [{
                        algorithm: fingerprint.algorithm,
                        value: fingerprint.value
                    }]
                }
            })

            // Media
            let m = sdp.media[0];
            let codecs = m.rtp.filter((v) => v.codec === 'opus');
            let codecParameters: RtpCodecParameters[] = [];
            for (let c of codecs) {
                let fmt = m.fmtp.find((v) => v.payload === c.payload);
                let params: any = {};
                if (fmt) {
                    let parts = fmt.config.split(';');
                    for (let p of parts) {
                        let kv = p.split('=');
                        if (kv[0] === 'minptime') {
                            params[kv[0]] = parseInt(kv[1], 10);
                        } else if (kv[0] === 'useinbandfec') {
                            params[kv[0]] = parseInt(kv[1], 10);
                        }
                    }
                }
                codecParameters.push({
                    mimeType: 'audio/opus',
                    payloadType: c.payload,
                    clockRate: 48000,
                    channels: 2,
                    parameters: params,
                    rtcpFeedback: [{
                        type: 'transport-cc'
                    }]
                })
            }
            let encodings: RtpEncoding[] = [];
            encodings.push({
                ssrc: m.ssrcs![0].id as number
            });

            producer = await transport1.produce({
                paused: false,
                kind: 'audio',
                rtpParameters: {
                    codecs: codecParameters,
                    encodings,
                }
            }, key + 'producer1');

            let sdp2: sdpTransform.SessionDescription = {

                // Boilerplate
                version: 0,
                origin: {
                    username: '-',
                    sessionId: '10000',
                    sessionVersion: 1,
                    netType: 'IN',
                    ipVer: 4,
                    address: '0.0.0.0'
                } as any,
                name: '-',
                timing: { start: 0, stop: 0 },

                // ICE
                groups: [{ type: 'BUNDLE', mids: '0' }],
                fingerprint: {
                    type: transport1.dtlsParameters.fingerprints[transport1.dtlsParameters.fingerprints.length - 1].algorithm,
                    hash: transport1.dtlsParameters.fingerprints[transport1.dtlsParameters.fingerprints.length - 1].value
                },
                icelite: 'ice-lite',
                iceUfrag: transport1.iceParameters.usernameFragment,
                icePwd: transport1.iceParameters.password,
                msidSemantic: { semantic: 'WMS', token: '*' },

                // Media
                media: [{
                    mid: m.mid,
                    type: 'audio',
                    protocol: m.protocol,
                    payloads: producer.rtpParameters.codecs[0].payloadType.toString(),
                    port: 7,
                    rtcpMux: 'rtcp-mux',
                    rtcpRsize: 'rtcp-rsize',
                    direction: 'recvonly',

                    // Codec
                    rtp: [{
                        payload: producer.rtpParameters.codecs[0].payloadType,
                        rate: producer.rtpParameters.codecs[0].clockRate,
                        encoding: 2,
                        codec: 'opus',
                    }],
                    fmtp: [{
                        payload: producer.rtpParameters.codecs[0].payloadType,
                        config: convertParameters(producer.rtpParameters.codecs[0].parameters || {})
                    }],
                    rtcpFb: producer.rtpParameters.codecs[0].rtcpFeedback!.map((v) => ({
                        payload: producer.rtpParameters.codecs[0].payloadType,
                        type: v.type,
                        subtype: v.parameter
                    })),

                    // ICE + DTLS
                    setup: 'active',
                    connection: { ip: '127.0.0.1', version: 4 },
                    candidates: transport1.iceCandidates.map((v) => convertIceCandidate(v)),
                    endOfCandidates: 'end-of-candidates',
                    ...{ iceOptions: 'renomination' },
                }]
            };
            res.send(sdpTransform.write(sdp2));
        });

        app.post('/receive', bodyParser.text(), async (req, res) => {

            // Create Transport
            transport2 = await router.createWebRtcTransport({
                enableTcp: true,
                enableUdp: false,
                preferTcp: false,
                preferUdp: false,
            }, key + 'transport2');
            // transport2.on('icestatechange', (iceState) => {
            //     console.log('Ice State: ' + iceState);
            // });
            // transport2.on('dtlsstatechange', (dtlsState) => {
            //     console.log('TDLS State: ' + dtlsState);
            // });

            const consumer = await transport2.consume(producer.id, {
                paused: false,
                rtpCapabilities: {
                    codecs: [{
                        kind: 'audio',
                        mimeType: 'audio/opus',
                        clockRate: 48000,
                        channels: 2,
                        parameters: {
                            stereo: 1,
                            maxplaybackrate: 48000
                        },
                        rtcpFeedback: [{
                            type: 'transport-cc'
                        }]
                    }]
                }
            }, key + 'consume1');
            console.log(consumer.rtpParameters);

            let sdp2: sdpTransform.SessionDescription = {

                // Boilerplate
                version: 0,
                origin: {
                    username: '-',
                    sessionId: '10000',
                    sessionVersion: 1,
                    netType: 'IN',
                    ipVer: 4,
                    address: '0.0.0.0'
                } as any,
                name: '-',
                timing: { start: 0, stop: 0 },

                // ICE
                fingerprint: {
                    type: transport2.dtlsParameters.fingerprints[transport2.dtlsParameters.fingerprints.length - 1].algorithm,
                    hash: transport2.dtlsParameters.fingerprints[transport2.dtlsParameters.fingerprints.length - 1].value
                },
                icelite: 'ice-lite',
                iceUfrag: transport2.iceParameters.usernameFragment,
                icePwd: transport2.iceParameters.password,
                msidSemantic: { semantic: 'WMS', token: '*' },

                // Media
                groups: [{ type: 'BUNDLE', mids: consumer.rtpParameters.mid! }],
                media: [{
                    mid: consumer.rtpParameters.mid,
                    type: 'audio',
                    protocol: 'UDP/TLS/RTP/SAVPF',
                    payloads: consumer.rtpParameters.codecs[0].payloadType.toString(),
                    port: 7,
                    rtcpMux: 'rtcp-mux',
                    rtcpRsize: 'rtcp-rsize',
                    direction: 'sendonly',

                    // Codec
                    rtp: [{
                        payload: consumer.rtpParameters.codecs[0].payloadType,
                        rate: consumer.rtpParameters.codecs[0].clockRate,
                        encoding: 2,
                        codec: 'opus',
                    }],
                    fmtp: [{
                        payload: consumer.rtpParameters.codecs[0].payloadType,
                        config: convertParameters(consumer.rtpParameters.codecs[0].parameters || {})
                    }],
                    rtcpFb: consumer.rtpParameters.codecs[0].rtcpFeedback!.map((v) => ({
                        payload: consumer.rtpParameters.codecs[0].payloadType,
                        type: v.type,
                        subtype: v.parameter
                    })),

                    // ICE + DTLS
                    setup: 'actpass',
                    connection: { ip: '127.0.0.1', version: 4 },
                    candidates: transport2.iceCandidates.map((v) => convertIceCandidate(v)),
                    endOfCandidates: 'end-of-candidates',
                    ...{ iceOptions: 'renomination' },
                }]
            };
            res.send(sdpTransform.write(sdp2));
        });

        app.post('/receive-answer', bodyParser.text(), async (req, res) => {
            let sdp = req.body as string;
            let parsed = sdpTransform.parse(sdp);
            await transport2.connect({
                dtlsParameters: {
                    role: 'client',
                    fingerprints: [{
                        algorithm: parsed.media[0].fingerprint!.type,
                        value: parsed.media[0].fingerprint!.hash
                    }]
                }
            })
            res.send('ok');
        });

        app.listen(4000, () => {
            console.log('Started at http://localhost:4000');
        });
    } catch (e) {
        console.warn(e);
        process.exit(-1);
    }
})();