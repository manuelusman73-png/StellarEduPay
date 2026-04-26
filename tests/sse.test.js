'use strict';

const { addClient, removeClient, emit } = require('../backend/src/services/sseService');

// Helper: create a minimal mock SSE response object
function makeMockRes() {
  const listeners = {};
  return {
    write: jest.fn(),
    on(event, cb) { listeners[event] = cb; },
    // Simulate the browser closing the connection
    simulateClose() { if (listeners['close']) listeners['close'](); },
  };
}

// Reset the internal clients Map between tests by re-requiring the module
// We achieve isolation by removing dead connections via the public API.

describe('Issue #404 — SSE connection cleanup', () => {
  afterEach(() => {
    // Clean up any lingering state by removing all clients we added
    jest.clearAllMocks();
  });

  // ── addClient / removeClient ──────────────────────────────────────────────

  test('addClient registers the connection', () => {
    const res = makeMockRes();
    addClient('SCH001', res);

    // emit should reach the registered client
    emit('SCH001', 'ping', { ok: true });
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('event: ping')
    );

    removeClient('SCH001', res);
  });

  test('removeClient unregisters the connection so it no longer receives broadcasts', () => {
    const res = makeMockRes();
    addClient('SCH001', res);
    removeClient('SCH001', res);

    emit('SCH001', 'ping', { ok: true });
    expect(res.write).not.toHaveBeenCalled();
  });

  // ── Disconnect cleanup (res.on('close')) ──────────────────────────────────

  test('client is automatically removed when the connection closes', () => {
    const res = makeMockRes();
    addClient('SCH002', res);

    // Simulate browser/network disconnect
    res.simulateClose();

    // After close, broadcast should not reach the disconnected client
    emit('SCH002', 'update', { data: 1 });
    expect(res.write).not.toHaveBeenCalled();
  });

  test('close event on one client does not affect other clients in the same school', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    addClient('SCH003', res1);
    addClient('SCH003', res2);

    res1.simulateClose(); // only res1 disconnects

    emit('SCH003', 'update', { data: 2 });
    expect(res1.write).not.toHaveBeenCalled(); // removed
    expect(res2.write).toHaveBeenCalledTimes(1); // still active

    removeClient('SCH003', res2);
  });

  test('close event on last client removes the school entry entirely', () => {
    const res = makeMockRes();
    addClient('SCH004', res);
    res.simulateClose();

    // emit to a school with no clients should be a no-op (no error thrown)
    expect(() => emit('SCH004', 'ping', {})).not.toThrow();
    expect(res.write).not.toHaveBeenCalled();
  });

  // ── Robust broadcast: dead connections ────────────────────────────────────

  test('emit skips and removes a connection that throws on write', () => {
    const deadRes = makeMockRes();
    const liveRes = makeMockRes();

    deadRes.write.mockImplementation(() => { throw new Error('socket hang up'); });

    addClient('SCH005', deadRes);
    addClient('SCH005', liveRes);

    // Should not throw even though deadRes.write throws
    expect(() => emit('SCH005', 'event', { x: 1 })).not.toThrow();

    // Live client still received the message
    expect(liveRes.write).toHaveBeenCalledTimes(1);

    // Dead client is now removed — a second emit should not call it again
    liveRes.write.mockClear();
    emit('SCH005', 'event', { x: 2 });
    expect(deadRes.write).toHaveBeenCalledTimes(1); // only the first (failed) attempt
    expect(liveRes.write).toHaveBeenCalledTimes(1);

    removeClient('SCH005', liveRes);
  });

  test('emit to a school with no clients does not throw', () => {
    expect(() => emit('NONEXISTENT', 'ping', {})).not.toThrow();
  });

  // ── Payload format ────────────────────────────────────────────────────────

  test('emit writes correct SSE payload format', () => {
    const res = makeMockRes();
    addClient('SCH006', res);

    emit('SCH006', 'payment', { amount: 100 });

    const written = res.write.mock.calls[0][0];
    expect(written).toMatch(/^event: payment\n/);
    expect(written).toMatch(/data: {"amount":100}\n\n$/);

    removeClient('SCH006', res);
  });

  // ── Multiple schools isolation ────────────────────────────────────────────

  test('emit only broadcasts to the correct school', () => {
    const resA = makeMockRes();
    const resB = makeMockRes();
    addClient('SCHOOL_A', resA);
    addClient('SCHOOL_B', resB);

    emit('SCHOOL_A', 'ping', {});

    expect(resA.write).toHaveBeenCalledTimes(1);
    expect(resB.write).not.toHaveBeenCalled();

    removeClient('SCHOOL_A', resA);
    removeClient('SCHOOL_B', resB);
  });
});
