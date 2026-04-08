export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(updater) {
      const previousState = state;
      const nextState = typeof updater === "function" ? updater(state) : { ...state, ...updater };
      state = nextState;
      listeners.forEach((listener) => listener(state, previousState));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
