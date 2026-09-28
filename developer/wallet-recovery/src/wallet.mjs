import {
  accountAddress, bytes, hex, derivationRequest, registrationRequest, deriveIdentity,
  createCard, validateCard, GreenboxError,
} from './crypto.mjs';

export function friendlyWalletError(error) {
  if (error instanceof GreenboxError) return error;
  const code = Number(error?.code ?? error?.data?.originalError?.code);
  if (code === 4001) return new GreenboxError('Signing was declined. Nothing was created; you can try again.', 'USER_REJECTED');
  if (code === -32002) return new GreenboxError('A wallet request is already open. Finish or dismiss it in your wallet.', 'REQUEST_PENDING');
  if (code === 4200 || code === -32601) return new GreenboxError('This wallet does not support this signing method. You can explicitly choose readable message signing for a new key. Existing keys must use their original method.', 'UNSUPPORTED_METHOD');
  return new GreenboxError('The wallet could not complete the request. Check the selected account, hardware connection, wallet version, and device prompts.', 'WALLET_FAILED');
}
export function discoverWallets(surface, onChange) {
  const discovered = new Map();
  const announce = event => {
    const detail = event?.detail;
    if (!detail?.provider || typeof detail.provider.request !== 'function' || typeof detail.info?.uuid !== 'string' || typeof detail.info?.name !== 'string') return;
    if ([...discovered.values()].some(x => x.provider === detail.provider)) return;
    discovered.set(detail.info.uuid, {id: detail.info.uuid, name: detail.info.name.slice(0, 60), rdns: String(detail.info.rdns || '').slice(0, 80), provider: detail.provider});
    onChange([...discovered.values()]);
  };
  surface.addEventListener('eip6963:announceProvider', announce);
  surface.dispatchEvent(new Event('eip6963:requestProvider'));
  // Legacy providers are added only if the wallet has not announced itself.
  const timer = setTimeout(() => {
    const providers = surface.ethereum?.providers || (surface.ethereum ? [surface.ethereum] : []);
    for (const provider of providers) {
      if (typeof provider?.request !== 'function' || [...discovered.values()].some(x => x.provider === provider)) continue;
      const name = provider.isRabby ? 'Rabby' : provider.isMetaMask ? 'MetaMask' : 'Browser wallet';
      discovered.set('legacy-' + discovered.size, {id: 'legacy-' + discovered.size, name, rdns: '', provider});
    }
    onChange([...discovered.values()]);
  }, 400);
  return () => { clearTimeout(timer); surface.removeEventListener('eip6963:announceProvider', announce); };
}
async function assertAccount(provider, account, method) {
  const accounts = await provider.request({method: 'eth_accounts'});
  if (!Array.isArray(accounts) || !accounts[0] || accountAddress(accounts[0]) !== accountAddress(account)) throw new GreenboxError('The wallet account changed. Select the intended account and start again.', 'ACCOUNT_CHANGED');
  if (method === 'eip712') {
    const chain = await provider.request({method: 'eth_chainId'});
    if (BigInt(chain) !== 1n) throw new GreenboxError('Select Ethereum mainnet in your wallet for this EIP-712 request. No transaction or gas is involved.', 'WRONG_CHAIN');
  }
}
export async function requestSignature(provider, account, request) {
  try {
    await assertAccount(provider, account, request.method);
    let signature;
    if (request.method === 'eip712') {
      const payload = {domain: request.domain,
        types: {EIP712Domain: [{name: 'name', type: 'string'}, {name: 'version', type: 'string'}, {name: 'chainId', type: 'uint256'}], ...request.types},
        primaryType: Object.keys(request.types)[0], message: request.message};
      signature = await provider.request({method: 'eth_signTypedData_v4', params: [accountAddress(account), JSON.stringify(payload)]});
    } else {
      signature = await provider.request({method: 'personal_sign', params: [hex(bytes(request.message)), accountAddress(account)]});
    }
    await assertAccount(provider, account, request.method);
    return signature;
  } catch (error) { throw friendlyWalletError(error); }
}
export async function enroll(provider, invitation, account, method, progress = () => {}) {
  let first, second;
  try {
    progress('1 of 3 · Approve the PRIVATE recovery-key message.');
    let signature = await requestSignature(provider, account, derivationRequest(invitation, account, method));
    first = await deriveIdentity(invitation, account, method, signature); signature = null;
    progress('2 of 3 · Approve the same PRIVATE message to check repeatability.');
    signature = await requestSignature(provider, account, derivationRequest(invitation, account, method));
    second = await deriveIdentity(invitation, account, method, signature); signature = null;
    if (first.publicKey !== second.publicKey) throw new GreenboxError('This wallet produced different keys for the same message. It cannot be used for repeatable signature recovery in this prototype.', 'NOT_REPEATABLE');
    progress('3 of 3 · Approve the PUBLIC registration proof. This is a different message.');
    const proof = await requestSignature(provider, account, registrationRequest(invitation, account, method, first.publicKey));
    return createCard(invitation, account, method, first.publicKey, proof);
  } finally { first?.secret.fill(0); second?.secret.fill(0); }
}
export function enrollReusable(provider, account, method, progress = () => {}) {
  return enroll(provider, null, account, method, progress);
}
export async function recreate(provider, card, progress = () => {}) {
  validateCard(card);
  progress('Approve the PRIVATE message to recreate your existing recovery key.');
  let signature = await requestSignature(provider, card.account, derivationRequest(card.invitation, card.account, card.method));
  const identity = await deriveIdentity(card.invitation, card.account, card.method, signature); signature = null;
  if (identity.publicKey !== card.publicKey) {
    identity.secret.fill(0);
    throw new GreenboxError('This wallet did not recreate the registered key. Check the original account and wallet signing implementation. Do not replace the registered key.', 'KEY_MISMATCH');
  }
  return identity;
}
