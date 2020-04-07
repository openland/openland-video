import * as sdp from 'sdp-transform';
import mediasoup from 'mediasoup';

// Extracted from media soup client
// https://github.com/versatica/mediasoup-client/blob/cc2b3de65af7cc55e615f45ce70bce10223b14ce/src/handlers/sdp/RemoteSdp.ts

export function createOffer(
    iceParamters: mediasoup.types.IceParameters,
    iceCandidates: mediasoup.types.IceCandidate[],
    dtlsParameters: mediasoup.types.DtlsParameters
) {
    // Basic boilerplate
    let res: sdp.SessionDescription = {
        version: 0,
        origin: {
            address: '0.0.0.0',
            ipVer: 4,
            netType: 'IN',
            sessionId: 10000,
            sessionVersion: 0,
            username: 'username'
        } as any,
        name: '-',
        timing: { start: 0, stop: 0 },
        media: [],
        msidSemantic: { semantic: 'WMS', token: '*' },
        groups: [{ type: 'BUNDLE', mids: '' }]
    };

    // Enable ICE Lite
    if (iceParamters.iceLite) {
        res.icelite = 'ice-lite';
    }

    // DTLS fingerprint
    let fingerprint = dtlsParameters.fingerprints[dtlsParameters.fingerprints.length - 1];
    res.fingerprint = {
        type: fingerprint.algorithm,
        hash: fingerprint.value
    };

    return sdp.write(res);
}