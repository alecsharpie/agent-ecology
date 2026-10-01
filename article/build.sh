#!/bin/sh
# Assemble the single-file article from its parts.
cd "$(dirname "$0")"
{
  echo '<title>How Crowds Make Up Their Minds</title>'
  echo '<meta name="description" content="Small language models play the naming game, the urn game and more: what emerges, what does not, and why." />'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" />'
  echo '<style>'; cat style.css; echo '</style>'
  cat body.html
  printf '<script type="application/json" id="article-data">'; cat data.json; echo '</script>'
  echo '<script>'; cat app.js; echo '</script>'
} > how-crowds-make-up-their-minds.html
