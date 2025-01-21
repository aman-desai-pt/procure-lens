// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: 'Procure Lens',
      bodyAttrs: {
        class: 'font-lato',
      },
    },
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss', '@nuxt/icon', '@nuxtjs/google-fonts'],
  googleFonts: {
    families: {
      'Noto+Sans': [400, 500, 600, 700],
      Lato: [400, 500, 600, 700],
    },
    useStylesheet: true,
  },
})