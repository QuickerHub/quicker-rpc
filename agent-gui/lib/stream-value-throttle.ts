/** A pending flush keeps its deadline while new stream chunks replace its value. */
export function createStreamValueThrottle(
  publish: (value: string) => void,
  intervalMs: number,
) {
  let latest = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    enqueue(value: string) {
      latest = value;
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        publish(latest);
      }, Math.max(0, intervalMs));
    },
    cancel,
  };
}
