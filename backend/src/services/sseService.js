'use strict';

// Map of schoolId -> Set of SSE response objects
const clients = new Map();

function addClient(schoolId, res) {
  if (!clients.has(schoolId)) clients.set(schoolId, new Set());
  clients.get(schoolId).add(res);
  res.on('close', () => removeClient(schoolId, res));
}

function removeClient(schoolId, res) {
  const set = clients.get(schoolId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(schoolId);
}

function emit(schoolId, event, data) {
  const set = clients.get(schoolId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      removeClient(schoolId, res);
    }
  }
}

module.exports = { addClient, removeClient, emit };
