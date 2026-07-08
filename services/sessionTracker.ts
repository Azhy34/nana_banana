let currentSessionId = '';

export const getSessionId = (): string => {
  if (!currentSessionId) {
    currentSessionId = 'sess_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }
  return currentSessionId;
};
