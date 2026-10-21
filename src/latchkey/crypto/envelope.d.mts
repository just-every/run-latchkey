export interface Context { tenant: string; vault: string; object: string; purpose: string; epoch: number; version: number }
export interface Envelope { schema: 1; algorithm: 'A256GCM'; context: Context; nonce: string; ciphertext: string }
export function encode(value: Uint8Array): string;
export function decode(value: string, maximum?: number): Uint8Array<ArrayBuffer>;
export function random(size?: number): Uint8Array<ArrayBuffer>;
export function id(): string;
export function digest(value: string | Uint8Array): Promise<string>;
export function bytes(value: unknown): Uint8Array<ArrayBuffer>;
export function json(value: Uint8Array): any;
export function context(value: Context): Uint8Array<ArrayBuffer>;
export function validateEnvelope(value: unknown, expected?: Context): Envelope;
export function seal(key: Uint8Array, plaintext: Uint8Array, binding: Context): Promise<Envelope>;
export function open(key: Uint8Array, envelope: Envelope, expected: Context): Promise<Uint8Array>;
export function derive(material: Uint8Array, salt: string, purpose: string): Promise<Uint8Array>;
export function unlockKey(exportKey: string, deviceSecret: string, account: string): Promise<Uint8Array>;
export function itemKey(vaultKey: Uint8Array, tenant: string, vault: string, object: string): Promise<Uint8Array>;
export function keypair(use: 'sign' | 'wrap'): Promise<{ publicKey: string; privateKey: string }>;
export function publicKey(value: string, use: 'sign' | 'wrap'): Promise<CryptoKey>;
export function wrapRecipient(value: Uint8Array, recipient: string, binding: Context): Promise<{ publicKey: string; envelope: Envelope }>;
export function unwrapRecipient(wrapped: { publicKey: string; envelope: Envelope }, privateValue: string, binding: Context): Promise<Uint8Array>;
export function sign(privateValue: string, value: string): Promise<string>;
export function verify(publicValue: string, signature: string, value: string): Promise<boolean>;
export function signingText(method: string, path: string, token: string, nonce: string, time: string, bodyHash: string): string;
export interface SignedWrap { publicKey: string; envelope: Envelope; signer: string; signature: string }
export function wrappedText(value: Omit<SignedWrap, 'signature'>): string;
export function wrapSigned(value: Uint8Array, recipient: string, binding: Context, signer: string, privateValue: string): Promise<SignedWrap>;
export function verifyWrapped(value: unknown, authorityKey: string, signer: string, binding: Context): Promise<boolean>;
export function unwrapSigned(value: SignedWrap, privateValue: string, authorityKey: string, signer: string, binding: Context): Promise<Uint8Array>;
