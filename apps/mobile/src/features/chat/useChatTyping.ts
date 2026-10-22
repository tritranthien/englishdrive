import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { chatApi } from './chat.api';

export function useChatTyping(
  token: string,
  threadId: string,
  focused: boolean,
  hasDraft: boolean,
) {
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (!focused || !hasDraft) return;
    let foreground =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let reported = false;
    const report = (active: boolean) => {
      reported = active;
      // Preserve ordering when typing, sending and leaving happen close together.
      queue.current = queue.current
        .then(() => chatApi.typing(token, threadId, active))
        .then(() => {})
        .catch(() => {});
    };
    if (foreground) report(true);
    const timer = setInterval(() => {
      if (foreground) report(true);
    }, 10000);
    const subscription = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (foreground) report(true);
      else if (reported) report(false);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (reported) report(false);
    };
  }, [token, threadId, focused, hasDraft]);
}
