export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready(): void;
        expand(): void;
        setHeaderColor?(color: string): void;
        setBackgroundColor?(color: string): void;
        colorScheme?: 'light' | 'dark';
        Serverless?: {
          call<T>(name: string, input: Record<string, never>, callback: (error: (Error & { parameters?: { code?: string } }) | null, result?: T) => void): void;
        };
      };
    };
  }
}
