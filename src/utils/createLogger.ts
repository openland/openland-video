import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(name: string) {
    return pino({ prettyPrint: { ignore: 'hostname,pid' }, name });
}