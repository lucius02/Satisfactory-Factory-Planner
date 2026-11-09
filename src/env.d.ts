/// <reference types="vite/client" />
/** Version from package.json, injected by Vite. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** URL of the feedback worker (see feedback-worker/README.md). Empty = feedback copies to the clipboard. */
  readonly VITE_FEEDBACK_URL?: string;
}
