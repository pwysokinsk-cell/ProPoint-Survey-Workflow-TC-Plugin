declare module 'trimble-connect-workspace-api' {
  export function connect(parentWindow: Window, callback: (event: string, args: { data?: unknown }) => void, timeout?: number): Promise<any>;
}