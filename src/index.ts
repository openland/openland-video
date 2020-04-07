import * as mediasoup from 'mediasoup';
import express from 'express';
import bodyParser from 'body-parser';
import sdpTransform from 'sdp-transform';

function convertIceCandidate(src: mediasoup.types.IceCandidate) {
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
        let worker = await mediasoup.createWorker();
        worker.on('dies', () => {
            // TODO: Handle
        });

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
        });

        let transport1: mediasoup.types.WebRtcTransport = await router.createWebRtcTransport({
            listenIps: ['127.0.0.1'], // Does not work with 0.0.0.0
            enableTcp: true,
            enableUdp: true,
            preferTcp: false,
            preferUdp: false,
        });
        let producer!: mediasoup.types.Producer;

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
            <h1>Hello world</h1>
            </body>
            `);
        });

        app.post('/offer', bodyParser.text(), async (req, res) => {
            let sdp = req.body as string;
            let parsed = sdpTransform.parse(sdp);
            let m = parsed.media[0];
            console.log(parsed);
            console.log(m);
            let codecs = m.rtp.filter((v) => v.codec === 'opus');
            let codecParameters: mediasoup.types.RtpCodecParameters[] = [];
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
            let encodings: mediasoup.types.RtpEncodingParameters[] = [];
            encodings.push({
                ssrc: m.ssrcs![0].id as number
            });

            producer = await transport1.produce({
                kind: 'audio',
                rtpParameters: {
                    codecs: codecParameters,
                    encodings
                }
            });

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
                    // setup: 'active',
                    connection: { ip: '127.0.0.1', version: 4 },
                    candidates: transport1.iceCandidates.map((v) => convertIceCandidate(v)),
                    endOfCandidates: 'end-of-candidates',
                    ...{ iceOptions: 'renomination' },
                }]
            };
            res.send(sdpTransform.write(sdp2));
        });

        app.post('/received', bodyParser.text(), async (req, res) => {

        });

        app.listen(4000, () => {
            console.log('Started at http://localhost:4000');
        });
    } catch (e) {
        console.warn(e);
        process.exit(-1);
    }
})();