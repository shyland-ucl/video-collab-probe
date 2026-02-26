import Peer from 'simple-peer';

class WebRTCService {
  constructor() {
    this.peer = null;
    this.isInitiator = false;
    this.onDataCallbacks = [];
    this.onConnectedCallback = null;
    this.onDisconnectedCallback = null;
  }

  /**
   * Create a session as initiator. Returns signal data (to be shared with joiner).
   * @returns {Promise<string>} JSON-stringified offer signal
   */
  createSession() {
    return new Promise((resolve) => {
      this.isInitiator = true;
      this.peer = new Peer({ initiator: true, trickle: false });
      this.peer.on('signal', (data) => resolve(JSON.stringify(data)));
      this._setupListeners();
    });
  }

  /**
   * Accept an offer signal and generate answer signal.
   * @param {string} offerSignal - JSON-stringified offer signal from initiator
   * @returns {Promise<string>} JSON-stringified answer signal
   */
  acceptOffer(offerSignal) {
    return new Promise((resolve) => {
      this.peer = new Peer({ initiator: false, trickle: false });
      this.peer.on('signal', (data) => resolve(JSON.stringify(data)));
      this._setupListeners();
      this.peer.signal(JSON.parse(offerSignal));
    });
  }

  /**
   * Complete connection by providing answer signal to initiator.
   * @param {string} answerSignal - JSON-stringified answer signal from joiner
   */
  completeConnection(answerSignal) {
    this.peer.signal(JSON.parse(answerSignal));
  }

  /**
   * Send data to the connected peer.
   * @param {object} data - Data object to send (will be JSON-stringified)
   */
  sendData(data) {
    if (this.peer && this.peer.connected) {
      this.peer.send(JSON.stringify(data));
    }
  }

  /**
   * Register a callback for incoming data.
   * @param {function} callback - Called with parsed data object
   */
  onData(callback) {
    this.onDataCallbacks.push(callback);
  }

  /**
   * Register a callback for when connection is established.
   * @param {function} callback
   */
  onConnected(callback) {
    this.onConnectedCallback = callback;
  }

  /**
   * Register a callback for when connection is lost.
   * @param {function} callback
   */
  onDisconnected(callback) {
    this.onDisconnectedCallback = callback;
  }

  /** @private */
  _setupListeners() {
    this.peer.on('connect', () => {
      this.onConnectedCallback?.();
    });

    this.peer.on('data', (rawData) => {
      const data = JSON.parse(rawData.toString());
      this.onDataCallbacks.forEach((cb) => cb(data));
    });

    this.peer.on('close', () => {
      this.onDisconnectedCallback?.();
    });

    this.peer.on('error', (err) => {
      console.error('WebRTC error:', err);
    });
  }

  /**
   * Disconnect and clean up.
   */
  disconnect() {
    this.peer?.destroy();
    this.peer = null;
    this.onDataCallbacks = [];
  }
}

export const webrtcService = new WebRTCService();
