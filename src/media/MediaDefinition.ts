import mediasoup from 'mediasoup';

export interface MediaTransport {
    id: string;
    enableUdp: boolean;
    enableTcp: boolean;
    preferUdp: boolean;
    preferTcp: boolean;
}

export interface MediaCodecDef {
    codec: string;
    payloadType: number;
    clockRate: number;
    channels?: number | null | undefined;
    parameters?: any | null | undefined;
    rtcpFeedback?: { type: string, parameter?: string }[] | null | undefined;
}

export interface MediaProducer {
    id: string;
    transportId: string;
    kind: 'audio' | 'video';
    codecs: MediaCodecDef[]
}

export interface MediaDefinition {
    id: string;
    version: number;
    mediaCodecs: mediasoup.types.RtpCodecCapability[];
    transports: MediaTransport[];
    producers: MediaProducer[];
}