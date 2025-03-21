import { PluginWithOptions } from 'markdown-it';
import { RuleCore } from 'markdown-it/lib/parser_core.mjs';

const markdownItYouTubeEmbed: PluginWithOptions<void> = (md) => {
  const youtubeEmbedRule: RuleCore = (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length - 2; i++) {
      const token = tokens[i];
      const next = tokens[i + 1];
      const nextNext = tokens[i + 2];

      // Look for paragraph_open → inline → paragraph_close
      if (
        token.type === 'paragraph_open' &&
        next.type === 'inline' &&
        next.children &&
        nextNext.type === 'paragraph_close'
      ) {
        const firstChild = next.children[0];

        if (
          firstChild &&
          firstChild.type === 'link_open' &&
          firstChild
            .attrGet('href')
            ?.startsWith('https://www.youtube.com/watch?v=')
        ) {
          const href = firstChild.attrGet('href')!;
          const videoId = href.split('v=')[1];

          const iframeHtml = `
            <div class="responsive-video">
              <iframe
                src="https://www.youtube.com/embed/${videoId}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>`.trim();

          // Replace the 3 tokens (paragraph_open, inline, paragraph_close)
          const htmlToken = new state.Token('html_block', '', 0);
          htmlToken.content = iframeHtml;

          tokens.splice(i, 3, htmlToken);
        }
      }
    }
  };

  md.core.ruler.push('youtube_embed', youtubeEmbedRule);
};

export default markdownItYouTubeEmbed;
