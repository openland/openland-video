import * as sdpTransform from 'sdp-transform';

export type SDP = sdpTransform.SessionDescription;

export function parseSDP(src: string) {
    return sdpTransform.parse(src);
}

export function writeSDP(src: SDP) {
    return sdpTransform.write(src);
}

export function extractFingerprint(src: SDP) {
    if (src.fingerprint) {
        return {
            algorithm: src.fingerprint.type,
            value: src.fingerprint.hash
        };
    } else {
        for (let m of src.media) {
            if (m.fingerprint) {
                return {
                    algorithm: m.fingerprint.type,
                    value: m.fingerprint.hash
                };
            }
        }
    }
    return null;
}