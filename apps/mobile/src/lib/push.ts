export async function registerForPush(): Promise<string | null> { return null; }
export async function unregisterPush(): Promise<void> {}
export function onNotificationTap(_handler: (data: any) => void): () => void { return () => {}; }
