/*
 * Ported from the wire types of @convex-dev/auth 2.0.0
 * `src/components/passkey/validation.ts` (not exported by the package):
 * WebAuthn options and responses as JSON, the shape the server sends and expects.
 * Apache-2.0 © Convex, Inc.
 */
interface CredentialDescriptor {
  id: string;
  type: 'public-key';
  transports?: string[];
}

/** `PublicKeyCredentialCreationOptionsJSON` as sent by the server. */
export interface WireCreationOptions {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { alg: number; type: 'public-key' }[];
  timeout: number;
  excludeCredentials: CredentialDescriptor[];
  authenticatorSelection: { residentKey: 'required'; requireResidentKey: true; userVerification: 'required' };
  attestation: 'none';
  extensions: Record<string, never>;
}

/** `PublicKeyCredentialRequestOptionsJSON` as sent by the server. */
export interface WireRequestOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: CredentialDescriptor[];
  userVerification: 'required';
}

export interface WireRegistrationResponse {
  id: string;
  rawId: string;
  response: { clientDataJSON: string; attestationObject: string; transports?: string[] };
  clientExtensionResults: Record<string, never>;
  type: 'public-key';
}

export interface WireAuthenticationResponse {
  id: string;
  rawId: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string };
  clientExtensionResults: Record<string, never>;
  type: 'public-key';
}
