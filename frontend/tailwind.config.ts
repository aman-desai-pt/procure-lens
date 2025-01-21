import daisyui from 'daisyui';
export default {
  safelist: ['font-noto', 'font-lato'],
  theme: {
    extend: {
      fontFamily: {
        noto: ['Noto Sans', 'sans-serif'],
        lato: ['Lato', 'cursive'],
      },
    },
  },
  daisyui: {
    themes: ['emerald'],
  },
  plugins: [daisyui],
} satisfies InlineTWConfig;

/**
 * Taken from @nuxtjs/tailwindcss
 * (Lib manages some aspects of config, so updated type)
 */
import type { Config as TWConfig } from 'tailwindcss';
type _Omit<T, K extends PropertyKey> = {
  [P in keyof T as Exclude<P, K>]: T[P];
};
type InlineTWConfig = _Omit<TWConfig, 'content' | 'safelist'> & {
  content?:
    | Extract<TWConfig['content'], any[]>
    | _Omit<Extract<TWConfig['content'], Record<string, any>>, 'extract' | 'transform'>;
  safelist?: Exclude<NonNullable<TWConfig['safelist']>[number], Record<string, any>>[];
};