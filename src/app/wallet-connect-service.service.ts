import { Injectable } from '@angular/core';
import { Web3Modal } from '@web3modal/standalone';
import Client from '@walletconnect/sign-client';
import { PairingTypes, SessionTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';

export enum DEFAULT_CHIA_METHODS {
  CHIA_GET_WALLETS = 'chia_getWallets',
  CHIA_SEND_TRANSACTION = 'chia_sendTransaction',
  CHIA_NEW_ADDRESS = 'chia_getNextAddress',
  CHIA_LOG_IN = 'chia_logIn',
  CHIA_SIGN_MESSAGE_BY_ADDRESS = 'chia_signMessageByAddress',
  CHIA_SIGN_MESSAGE_BY_ID = 'chia_signMessageById',
  CHIA_TAKE_OFFER = 'chia_takeOffer',
  CHIA_GET_WALLET_SYNC_STATUS = 'chia_getSyncStatus',
}

const DEFAULT_RELAY_URL = 'wss://relay.walletconnect.com';
const PROJECT_ID = 'REPLACE_WITH_YOUR_PROJECT_ID';

@Injectable({
  providedIn: 'root'
})
export class WalletConnectService {
  client$ = new BehaviorSubject<Client | undefined>(undefined);
  pairings$ = new BehaviorSubject<PairingTypes.Struct[]>([]);
  session$ = new BehaviorSubject<SessionTypes.Struct | undefined>(undefined);

  isInitializing$ = new BehaviorSubject<boolean>(false);
  prevRelayerValue$ = new BehaviorSubject<string>('');

  accounts$ = new BehaviorSubject<string[]>([]);
  chains$ = new BehaviorSubject<string[]>(['chia:mainnet']);
  relayerRegion$ = new BehaviorSubject<string>(DEFAULT_RELAY_URL);

  web3Modal = new Web3Modal({
    projectId: PROJECT_ID,
    walletConnectVersion: 2,
    standaloneChains: this.chains$.value,
  });

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      this.isInitializing$.next(true);

      const _client = await Client.init({
        logger: 'debug',
        relayUrl: this.relayerRegion$.value,
        projectId: PROJECT_ID,
        metadata: {
          name: 'Angular Test',
          description: 'This is a walletconnect test using angular',
          url: 'https://mintgarden.io',
          icons: ['https://assets.mainnet.mintgarden.io/web/mint-logo-round.svg'],
        },
      });

      console.log('CREATED CLIENT: ', _client);
      console.log('relayerRegion ', this.relayerRegion$.value);

      this.client$.next(_client);
      this.prevRelayerValue$.next(this.relayerRegion$.value);
      this.subscribeToEvents(_client);
      await this.checkPersistedState(_client);
    } catch (err) {
      throw err;
    } finally {
      this.isInitializing$.next(false);
    }
  }

  private reset = () => {
    this.session$.next(undefined);
    this.chains$.next([]);
    this.accounts$.next([]);
    this.relayerRegion$.next(DEFAULT_RELAY_URL);
  };

  private onSessionConnected = async (_session: SessionTypes.Struct) => {
    const allNamespaceAccounts = Object.values(_session.namespaces)
      .map((namespace) => namespace.accounts)
      .flat();
    const allNamespaceChains = Object.keys(_session.namespaces);

    this.session$.next(_session);
    // chains.value = allNamespaceChains;
    this.accounts$.next(allNamespaceAccounts);
  };

  connect = async (pairing?: any) => {
    if (typeof this.client$.value === 'undefined') {
      throw new Error('WalletConnect is not initialized');
    }
    console.log('connect, pairing topic is:', pairing?.topic);
    try {
      const requiredNamespaces = {
        chia: {
          methods: Object.values(DEFAULT_CHIA_METHODS),
          chains: this.chains$.value,
          events: [],
        },
      };
      console.log('requiredNamespaces config for connect:', requiredNamespaces);

      const { uri, approval } = await this.client$.value.connect({
        pairingTopic: pairing?.topic,
        requiredNamespaces,
      });

      // Open QRCode modal if a URI was returned (i.e. we're not connecting an existing pairing).
      if (uri) {
        await this.web3Modal.openModal({ uri });
      }

      const session = await approval();
      console.log('Established session:', session);
      await this.onSessionConnected(session);
      // Update known pairings after session is connected.
      this.pairings$.next(this.client$.value.pairing.getAll({ active: true }));
    } catch (e) {
      console.error(e);
      // ignore rejection
    } finally {
      // close modal in case it was open
      this.web3Modal.closeModal();
    }
  };

  disconnect = async () => {
    if (typeof this.client$.value === 'undefined') {
      throw new Error('WalletConnect is not initialized');
    }
    if (typeof this.session$.value === 'undefined') {
      throw new Error('Session is not connected');
    }
    await this.client$.value.disconnect({
      topic: this.session$.value.topic,
      reason: getSdkError('USER_DISCONNECTED'),
    });
    // Reset app state after disconnect.
    this.reset();
  };


  getWallets = async () => {
    const method = DEFAULT_CHIA_METHODS.CHIA_GET_WALLETS;
    try {
      const fingerprint = this.accounts$.value[0].split(':')[2];
      const result = await this.client$.value!.request({
        topic: this.session$.value!.topic,
        chainId: 'chia:mainnet',
        request: {
          method,
          params: {
            fingerprint,
            includeData: true
          },
        },
      });

      return {
        method,
        valid: true,
        result,
      };
    } catch (e) {
      console.error(e);
      return { method, valid: false };
    }
  };

  signMessageById = async (id: string, message: string) => {
    const method = DEFAULT_CHIA_METHODS.CHIA_SIGN_MESSAGE_BY_ID;
    try {
      const fingerprint = this.accounts$.value[0].split(':')[2];
      const result = await this.client$.value!.request({
        topic: this.session$.value!.topic,
        chainId: 'chia:mainnet',
        request: {
          method,
          params: {
            fingerprint: fingerprint,
            id,
            message,
          },
        },
      });

      return {
        method,
        valid: true,
        result,
      };
    } catch (e) {
      console.error(e);
      return { method, valid: false };
    }
  };

  private subscribeToEvents = (_client: Client) => {
    if (typeof _client === 'undefined') {
      throw new Error('WalletConnect is not initialized');
    }

    _client.on('session_ping', (args) => {
      console.log('EVENT', 'session_ping', args);
    });

    _client.on('session_event', (args) => {
      console.log('EVENT', 'session_event', args);
    });

    _client.on('session_update', ({ topic, params }) => {
      console.log('EVENT', 'session_update', { topic, params });
      const { namespaces } = params;
      const _session = _client.session.get(topic);
      const updatedSession = { ..._session, namespaces };
      this.onSessionConnected(updatedSession);
    });

    _client.on('session_delete', () => {
      console.log('EVENT', 'session_delete');
      this.reset();
    });
  };

  private checkPersistedState = async (_client: Client) => {
    if (typeof _client === 'undefined') {
      throw new Error('WalletConnect is not initialized');
    }
    // populates existing pairings to state
    this.pairings$.next(_client.pairing.getAll({ active: true }));
    console.log('RESTORED PAIRINGS: ', _client.pairing.getAll({ active: true }));

    if (typeof this.session$.value !== 'undefined') return;
    // populates (the last) existing session to state
    if (_client.session.length) {
      const lastKeyIndex = _client.session.keys.length - 1;
      const _session = _client.session.get(_client.session.keys[lastKeyIndex]);
      console.log('RESTORED SESSION:', _session);
      await this.onSessionConnected(_session);
      return _session;
    }
    return undefined
  };
}
