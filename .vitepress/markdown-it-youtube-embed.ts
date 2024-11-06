import { PluginWithOptions } from 'markdown-it';
import { RuleCore } from 'markdown-it/lib/parser_core.mjs';

const markdownItYouTubeEmbed: PluginWithOptions<void> = (md) => {
  const youtubeEmbedRule: RuleCore = (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (
        token.type === 'inline' &&
        token.children &&
        token.children.length >= 1 &&
        token.children[0].type === 'link_open'
      ) {
        const linkToken = token.children[0];
        const href = linkToken.attrGet('href');

        if (href && href.startsWith('https://www.youtube.com/watch?v=')) {
          const videoId = href.split('v=')[1];
          const iframeHtml = `
            <div class="responsive-video">
              <iframe
                src="https://www.youtube.com/embed/${videoId}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>
          `;

          // Replace current token with a new HTML block token
          const newToken = new state.Token('html_block', '', 0);
          newToken.content = iframeHtml;
          tokens[i] = newToken;
        }
      }
    }
  };

  md.core.ruler.push('youtube_embed', youtubeEmbedRule);
};

export default markdownItYouTubeEmbed;
