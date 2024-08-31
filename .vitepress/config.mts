import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Lambda Live Debugger',
  description: 'Remote debugging AWS Lambda functions',
  /* prettier-ignore */
  head: [
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['meta', { 'http-equiv': 'Content-Type', content: 'text/html; charset=utf-8' }],
    ['meta', { name: 'language', content: 'English' }],
    ['meta', { name: 'revisit-after', content: '1 days' }],
    ['meta', { name: 'author', content: 'Marko (ServerlessLife)' }],
    ['meta', { name: 'keywords', content: 'aws, lambda, debugger, serverless, aws-lambda, javascript, typescript, dev-tools, lambda-debugger, aws-cdk, serverless-framework, sls, aws-sam, sam, terraform, local-debugging, cloud-development' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Lambda Live Debugger | Remote debugging AWS Lambda functions' }],
    ['meta', { property: 'og:site_name', content: 'Lambda Live Debugger' }],
    ['meta', { property: 'og:image', content: 'https://lldebugger.com/lambda_live_debugger.png' }],
    ['meta', { property: 'og:url', content: 'https://lldebugger.com/' }],

    ['meta', { property: 'twitter:card', content: 'summary' }],
    ['meta', { property: 'twitter:site', content: '@serverlessl' }],

    [
      'script',
      { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-DWK00ZDX76' }
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-DWK00ZDX76');`
    ]
  ],
  sitemap: {
    hostname: 'https://www.lldebugger.com',
  },
  themeConfig: {
    search: {
      provider: 'local',
    },
    siteTitle: 'Lambda Live Debugger',
    logo: {
      light: '/logo_light.svg',
      dark: '/logo_dark.svg',
    },
    sidebar: [
      {
        text: 'Introduction',
        collapsed: false,
        items: [
          { text: 'Why?', link: '#why' },
          { text: 'How It Works', link: '#how-it-works' },
          { text: 'Help and Feedback', link: '#help-and-feedback' },
        ],
      },
      {
        text: 'Instructions',
        collapsed: false,
        items: [
          { text: 'Getting Started', link: '#getting-started' },
          { text: 'CLI Parameters', link: '#cli-parameters' },
          { text: 'Configuration file', link: '#configuration-file' },
          { text: 'Debugging', link: '#debugging' },
          { text: 'Development Process', link: '#development-process' },
        ],
      },
      {
        text: 'Advanced',
        collapsed: false,
        items: [
          { text: 'Observability Mode', link: '#observability-mode' },
          { text: 'Monorepo', link: '#monorepo-setup' },
          { text: 'Removing', link: '#removing' },
        ],
      },
      {
        text: 'Frameworks & Custom Setup',
        collapsed: true,
        link: '#aws-cdk-v2',
        items: [
          { text: 'AWS CDK', link: '#aws-cdk-v2' },
          {
            text: 'Serverless Framework',
            link: '#serverless-framework-v3-sls',
          },
          { text: 'SAM', link: '#aws-serverless-application-model-sam' },
          { text: 'Terraform', link: '#terraform' },
          { text: 'Custom Setup', link: '#custom-setup' },
        ],
      },
      { text: 'Authors and Contributors', link: '#authors' },
      { text: 'Disclaimer', link: '#disclaimer' },
    ],

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/ServerlessLife/lambda-live-debugger',
      },
    ],
  },
});
